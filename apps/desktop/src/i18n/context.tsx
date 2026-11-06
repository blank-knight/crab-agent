import { applyDocumentLocale, isRecord } from '@hermes/shared/i18n'
import { useStore } from '@nanostores/react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { getHermesConfigRecord, type HermesConfigRecord, retainConfigReadOrigin, saveHermesConfig } from '@/hermes'
import { $oemBrand, DEFAULT_BRAND_NAME } from '@/store/oem-brand'

import { TRANSLATIONS } from './catalog'
import {
  DEFAULT_LOCALE,
  isSupportedLocaleValue,
  localeConfigValue,
  normalizeLocale,
  QIJI_DEFAULT_LOCALE
} from './languages'
import { setRuntimeI18nLocale } from './runtime'
import type { Locale, Translations } from './types'

export { LOCALE_META } from './languages'

export interface I18nConfigClient {
  getConfig: () => Promise<HermesConfigRecord>
  saveConfig: (config: HermesConfigRecord) => Promise<{ ok: boolean }>
}

const defaultConfigClient: I18nConfigClient = {
  getConfig: () => {
    if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
      return Promise.resolve({})
    }

    // Merged defaults make an unset language indistinguishable from saved English.
    // Older backends ignore the option and keep returning English as before.
    return getHermesConfigRecord(undefined, { includeDefaults: false })
  },
  saveConfig: config => {
    if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
      return Promise.resolve({ ok: true })
    }

    // No explicit scope: saveHermesConfig resolves the record's captured read
    // origin itself (resolveConfigWriteScope), and withConfigDisplayLanguage
    // retains that origin onto the derived record.
    return saveHermesConfig(config, undefined, { preserveLanguage: true })
  }
}

export function getConfigDisplayLanguage(config: HermesConfigRecord): unknown {
  return isRecord(config.display) ? config.display.language : undefined
}

export function withConfigDisplayLanguage(config: HermesConfigRecord, locale: Locale): HermesConfigRecord {
  const display = isRecord(config.display) ? config.display : {}

  return retainConfigReadOrigin(
    {
      ...config,
      display: {
        ...display,
        language: localeConfigValue(locale)
      }
    },
    config
  )
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * OEM 品牌替换后的翻译目录（qiji-fork 同款）：按「当前品牌」缓存深拷贝，
 * 字符串/模板函数里的「奇计」/「Qiji」替换为生效品牌名（默认螃蟹OPC）。
 * 品牌变化（登录贴牌账号/登出）时 useMemo 依赖 brandName 触发重渲染。
 */
const brandedCatalogCache = new Map<string, Translations>()

function mapTranslationValue(value: unknown, replace: (s: string) => string): unknown {
  if (typeof value === 'string') {
    return replace(value)
  }

  if (typeof value === 'function') {
    // qiji: 返回值可能为数组/对象（如 intro.custom(label) 返回 string[]）——逐元素替换，
    // 禁止 String() 整体强转（数组会被压成逗号串，调用方按下标取到单个字符）。
    return (...args: unknown[]) => mapTranslationValue((value as (...a: unknown[]) => unknown)(...args), replace)
  }

  if (Array.isArray(value)) {
    return value.map(v => mapTranslationValue(v, replace))
  }

  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(value)) {
      out[k] = mapTranslationValue(v, replace)
    }

    return out
  }

  return value
}

function getBrandedTranslations(locale: Locale, brandName: string): Translations {
  const cacheKey = `${locale}|${brandName}`
  const cached = brandedCatalogCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const base = TRANSLATIONS[locale]
  const replace = (s: string) =>
    s
      .split('奇计')
      .join(brandName)
      .replace(/\bQiji\b/g, brandName)
  const branded = mapTranslationValue(base, replace) as Translations
  brandedCatalogCache.set(cacheKey, branded)

  return branded
}

export interface I18nContextValue {
  configLoadError: Error | null
  isLoadingConfig: boolean
  isSavingLocale: boolean
  locale: Locale
  saveError: Error | null
  setLocale: (next: Locale) => Promise<void>
  t: Translations
}

const I18nContext = createContext<I18nContextValue>({
  configLoadError: null,
  isLoadingConfig: false,
  isSavingLocale: false,
  locale: DEFAULT_LOCALE,
  saveError: null,
  setLocale: async () => {},
  t: TRANSLATIONS[DEFAULT_LOCALE]
})

export interface I18nProviderProps {
  children: ReactNode
  configClient?: I18nConfigClient | null
  initialLocale?: unknown
  /** Reconcile when the window's config owner changes, without remounting its children. */
  scopeKey?: string
}

export function I18nProvider({
  children,
  configClient = defaultConfigClient,
  initialLocale,
  scopeKey
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => normalizeLocale(initialLocale))
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [isSavingLocale, setIsSavingLocale] = useState(false)
  const [configLoadError, setConfigLoadError] = useState<Error | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const localeRef = useRef(locale)
  // An explicit pick beats a late read in its own scope, not in other profiles.
  const userLocaleRef = useRef(false)
  const scopeGenerationRef = useRef(0)
  // OEM 品牌：订阅 store，品牌变化 → 翻译目录重映射 → 全界面重渲染
  const oemBrand = useStore($oemBrand)
  const brandName = oemBrand.name.trim() || DEFAULT_BRAND_NAME

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    localeRef.current = locale
    setRuntimeI18nLocale(locale)
    applyDocumentLocale(locale)
  }, [locale])

  // eslint-disable-next-line no-restricted-syntax -- scope-local request generation and user intent, not an atom mirror
  useEffect(() => {
    scopeGenerationRef.current += 1
    userLocaleRef.current = false
    setSaveError(null)
    setIsSavingLocale(false)

    if (!configClient) {
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0

    // The desktop races its own backend at startup: the renderer mounts before
    // the backend is ready, so the first /api/config call can time out. We keep
    // the established permanent-failure contract — a rejected config load
    // settles on English so the UI stays usable — but bounded retries recover
    // transient startup failures, applying the persisted display.language once
    // the backend comes up.
    const MAX_LOCALE_RETRIES = 10
    const LOCALE_RETRY_DELAY_MS = 3_000

    const loadLocale = () => {
      setIsLoadingConfig(true)
      setConfigLoadError(null)

      return configClient
        .getConfig()
        .then(async config => {
          if (cancelled || userLocaleRef.current) {
            return
          }

          const saved = getConfigDisplayLanguage(config)

          // A saved choice needs no machine probe and always takes precedence.
          if (isSupportedLocaleValue(saved)) {
            setLocaleState(normalizeLocale(saved))

            return
          }

          // qiji(qiji-fork 生产线同款): 无保存语言 → 直接默认中文,不做 OS 探测。
          // 上游语义是"探测 OS 语言,未命中回 en";qiji-fork 无探测链(DEFAULT_LOCALE='zh'
          // 直接生效),英文系统(en-US)不得拦截产品默认中文。
          if (!cancelled && !userLocaleRef.current) {
            setLocaleState(QIJI_DEFAULT_LOCALE)
          }
        })
        .catch(error => {
          if (cancelled || userLocaleRef.current) {
            return
          }

          setConfigLoadError(toError(error))
          setLocaleState(DEFAULT_LOCALE)

          if (retryCount < MAX_LOCALE_RETRIES) {
            retryCount += 1
            retryTimer = setTimeout(() => {
              loadLocale()
            }, LOCALE_RETRY_DELAY_MS)
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingConfig(false)
          }
        })
    }

    loadLocale()

    return () => {
      cancelled = true
      scopeGenerationRef.current += 1

      if (retryTimer) {
        clearTimeout(retryTimer)
      }
    }
  }, [configClient, initialLocale, scopeKey])

  const setLocale = useCallback(
    async (next: Locale) => {
      const previousLocale = localeRef.current
      const generation = scopeGenerationRef.current

      userLocaleRef.current = true
      setSaveError(null)
      setLocaleState(next)

      if (!configClient) {
        return
      }

      setIsSavingLocale(true)

      try {
        const latestConfig = await configClient.getConfig()
        const result = await configClient.saveConfig(withConfigDisplayLanguage(latestConfig, next))

        if (!result.ok) {
          throw new Error('Failed to save language')
        }
      } catch (error) {
        const nextError = toError(error)

        // The write still belongs to the GET's captured origin, but its late
        // outcome must not roll another profile's chrome back to this one.
        if (generation === scopeGenerationRef.current) {
          setLocaleState(previousLocale)
          setSaveError(nextError)
        }

        throw nextError
      } finally {
        if (generation === scopeGenerationRef.current) {
          setIsSavingLocale(false)
        }
      }
    },
    [configClient]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      configLoadError,
      isLoadingConfig,
      isSavingLocale,
      locale,
      saveError,
      setLocale,
      t: getBrandedTranslations(locale, brandName)
    }),
    [configLoadError, isLoadingConfig, isSavingLocale, locale, saveError, setLocale, brandName]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
