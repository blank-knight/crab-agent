import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { codiconIcon } from '@/components/ui/codicon'
import { KbdCombo } from '@/components/ui/kbd'
import { Tip } from '@/components/ui/tooltip'
import { getHermesConfigDefaults, getHermesConfigRecord, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import {
  Archive,
  Bell,
  Cpu,
  Download,
  Globe,
  Info,
  Keyboard,
  KeyRound,
  Palette,
  RefreshCw,
  Search,
  Settings2,
  ShieldLock,
  Upload,
  Users,
  Wrench,
  Zap
} from '@/lib/icons'
import { isEditableTarget } from '@/lib/keybinds/combo'
import { typeToFocusChar } from '@/lib/keybinds/composer-focus-keys'
import { cn } from '@/lib/utils'
import { $advancedFeatures } from '@/store/advanced-features'
import { $auth } from '@/store/auth'
import { $commandPaletteOpen, openCommandPalettePage } from '@/store/command-palette'
import { confirm } from '@/store/confirm'
import { $activeConnectionId } from '@/store/connections'
import { bindingsFor } from '@/store/keybinds'
import { $localModelsEnabled } from '@/store/local-models-flag'
import { notifyError } from '@/store/notifications'
import { $settingsScopeProfile } from '@/store/settings-scope'

import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { OverlayIconButton } from '../overlays/overlay-chrome'
import { OverlayMain, type OverlayNavGroup } from '../overlays/overlay-split-layout'
import { OverlayView } from '../overlays/overlay-view'
import { categoryOfGroup, SettingsCategoryBar } from '../overlays/settings-category-nav'
import { SettingsNarrowNav, SettingsSideRail } from '../overlays/settings-side-rail'

import { AboutSettings } from './about-settings'
import { AccountSettings } from './account-settings'
import { AppearanceSettings } from './appearance-settings'
import { BILLING_VIEWS, BillingSettings, type BillingSubView } from './billing'
import { deriveBillingView, useBillingState, useSubscriptionState } from './billing/use-billing-state'
import { ConfigSettings } from './config-settings'
import { SECTIONS } from './constants'
import { GatewaySettings } from './gateway-settings'
import { KeybindSettings } from './keybind-settings'
import { KEYS_VIEWS, KeysSettings, type KeysView } from './keys-settings'
import { MarketSettings } from './market-settings'
import { movedSettingsTabRedirect } from './moved-tabs'
import { NotificationsSettings } from './notifications-settings'
import { SettingsBreadcrumbContext } from './primitives'
import { PROVIDER_VIEWS, ProvidersSettings, type ProviderView } from './providers-settings'
import { SessionsSettings } from './sessions-settings'
import { SettingsSubpageHeader } from './subpage-navigation'
import { resolveSettingsSubpage, settingsSubpageIcon, settingsSubpages } from './subpages'
import type { SettingsPageProps, SettingsView as SettingsViewId } from './types'
import { vaultOwnerKey, VaultSettings } from './vault-settings'

/** qiji 0.20.5: 「高级」分区里纯开发者向子页——默认不出现在导航（开关放出）。 */
const ADVANCED_DEVELOPER_SUBPAGES = new Set(['runtime', 'tools', 'terminal', 'output', 'delegation'])

/**
 * qiji 0.20.5c: 各分区按「高级功能」开关过滤的子页（装机二轮用户反馈：
 * 主备模型/多 agent 协作这类开发者向配置对普通用户是噪音）。
 * - 模型：fallbacks（主备/fallback_providers）、auxiliary（辅助模型）、
 *   moa（多模型混合路由）——普通用户只关心主模型。
 * - 记忆：context（上下文窗口/压缩参数）——调参向。
 * - 0.20.5d（r6 盘点拍板）：语音 transcription/speech（TTS/STT 供应商 77 字段
 *   调参向，普通用户只碰 voiceConversation 开关）；工作区 shell/files
 *   （persistent_shell/env_passthrough/code_execution.mode 等开发者项）；
 *   安全 checkpoints（max_snapshots 调参向）。
 * 深链仍可直达，只是不在导航陈列；物理功能与已存配置不受影响。
 */
const ADVANCED_GATED_SUBPAGES_BY_VIEW: Record<string, Set<string>> = {
  'config:advanced': ADVANCED_DEVELOPER_SUBPAGES,
  'config:model': new Set(['fallbacks', 'auxiliary', 'moa']),
  'config:memory': new Set(['context']),
  'config:voice': new Set(['transcription', 'speech']),
  'config:workspace': new Set(['shell', 'files']),
  'config:safety': new Set(['checkpoints'])
}

const SETTINGS_VIEWS: readonly SettingsViewId[] = [
  ...SECTIONS.map(s => `config:${s.id}` as SettingsViewId),
  'providers',
  'gateway',
  // Legacy alias: the Connections page merged into Gateways. Kept in the enum
  // so saved `?tab=connections` deep links still resolve (redirected below).
  'connections',
  'keybinds',
  'keys',
  'vault',
  'notifications',
  'billing',
  'market',
  'account',
  'sessions',
  'about'
]

export function SettingsView({ onClose, onConfigSaved, onMainModelChanged }: SettingsPageProps) {
  const scopeProfile = useStore($settingsScopeProfile)
  const activeConnectionId = useStore($activeConnectionId)
  const { t } = useI18n()
  // qiji 账号联动：平台 key 用户(is_custom_key=0)隐藏模型配置段；
  // 已登录才显示个人中心入口
  const authState = useStore($auth)
  const navigate = useNavigate()
  const { hash, pathname, search } = useLocation()

  // MCP and Plugins moved out of Settings into Capabilities. Keep old
  // `/settings?tab=mcp|plugins` deep links working — `useRouteEnumParam` would
  // silently coerce the unknown tab to the default view otherwise.
  useEffect(() => {
    const redirect = movedSettingsTabRedirect(search)

    if (redirect) {
      navigate(redirect, { replace: true })
    }
  }, [navigate, search])

  const [activeView] = useRouteEnumParam('tab', SETTINGS_VIEWS, 'config:model' as SettingsViewId)
  const advancedFeatures = useStore($advancedFeatures)
  const params = new URLSearchParams(search)
  const requestedSubpage = params.get('page')
  const subpage = resolveSettingsSubpage(activeView, params)
  const needsSubpageRedirect = Boolean(subpage && subpage !== requestedSubpage)
  const subpageSearch = new URLSearchParams(search)

  if (subpage) {
    subpageSearch.set('page', subpage)
  }

  const openSettingsPage = useCallback(
    (view: SettingsViewId, page?: string) => {
      const next = new URLSearchParams(search)

      for (const key of [
        'page',
        'field',
        'setting',
        'key',
        'aux',
        'session',
        'kind',
        'label',
        'origin',
        'pview',
        'kview',
        'bview'
      ]) {
        next.delete(key)
      }

      next.set('tab', view)
      const destination = page ?? settingsSubpages(view)[0]?.id

      if (destination) {
        next.set('page', destination)
      }

      navigate({ hash, pathname, search: `?${next}` }, { replace: true })
    },
    [hash, navigate, pathname, search]
  )

  const setActiveView = useCallback((view: SettingsViewId) => openSettingsPage(view), [openSettingsPage])

  // Connections merged into the unified Gateways page: land old
  // `?tab=connections` routes/bookmarks there instead of a dead entry.
  useEffect(() => {
    if (activeView === 'connections') {
      setActiveView('gateway')
    }
  }, [activeView, setActiveView])
  // Providers subnav (Accounts vs API keys) lives in its own param so each
  // sub-view is deep-linkable and survives a refresh.
  const [providerView, setProviderView] = useRouteEnumParam<ProviderView>('pview', PROVIDER_VIEWS, 'accounts')
  const [keysView] = useRouteEnumParam<KeysView>('kview', KEYS_VIEWS, 'tools')
  const [billingView] = useRouteEnumParam<BillingSubView>('bview', BILLING_VIEWS, 'overview')
  const billingState = useBillingState()
  const subscriptionState = useSubscriptionState()
  const billingPresentation = deriveBillingView(billingState.data, subscriptionState.data)
  const canViewPlans = billingPresentation.status === 'normal' && Boolean(billingPresentation.plan?.action)

  // Jump to a section + its sub-view in one navigate. Two sequential setters
  // would each read the same stale `search` and the second would clobber the
  // first's `tab` — so the sub-view never opened on narrow screens.
  const openSubView = useCallback(
    (tab: SettingsViewId, param: string, value: string, fallback: string) => {
      const params = new URLSearchParams(search)

      for (const key of ['page', 'field', 'setting', 'key', 'aux', 'session', 'kind', 'label', 'origin']) {
        params.delete(key)
      }

      params.set('tab', tab)

      if (value === fallback) {
        params.delete(param)
      } else {
        params.set(param, value)
      }

      const qs = params.toString()
      navigate({ hash, pathname, search: qs ? `?${qs}` : '' }, { replace: true })
    },
    [hash, navigate, pathname, search]
  )

  const openProviderView = useCallback(
    (view: ProviderView) => openSubView('providers', 'pview', view, 'accounts'),
    [openSubView]
  )

  const openKeysView = useCallback((view: KeysView) => openSubView('keys', 'kview', view, 'tools'), [openSubView])

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const exportConfig = async () => {
    try {
      const cfg = await getHermesConfigRecord()
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'hermes-config.json'
      a.click()
      URL.revokeObjectURL(url)
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, t.settings.exportFailed)
    }
  }

  const resetConfig = async () => {
    const ok = await confirm({
      confirmLabel: t.settings.resetToDefaults,
      destructive: true,
      title: t.settings.resetConfirm
    })

    if (!ok) {
      return
    }

    try {
      await saveHermesConfig(await getHermesConfigDefaults())
      triggerHaptic('success')
      onConfigSaved?.()
    } catch (err) {
      notifyError(err, t.settings.resetFailed)
    }
  }

  const navGroups: OverlayNavGroup[] = useMemo(
    () =>
      (
        [
          ...SECTIONS.flatMap(s => {
            const view = `config:${s.id}` as SettingsViewId

            const entry = {
              active: activeView === view,
              icon: s.icon,
              id: view,
              label: t.settings.sections[s.id] ?? s.label,
              onSelect: () => setActiveView(view)
            }

            // Credential Vault lives beside the Browser section: it feeds the
            // browser's model-blind vault fill, so the two are one mental unit.
            if (s.id === 'browser') {
              return [
                entry,
                {
                  active: activeView === 'vault',
                  icon: ShieldLock,
                  id: 'vault',
                  label: t.settings.nav.vault,
                  onSelect: () => setActiveView('vault')
                }
              ]
            }

            return [entry]
          }),
          {
            active: activeView === 'notifications',
            icon: Bell,
            id: 'notifications',
            label: t.settings.nav.notifications,
            onSelect: () => setActiveView('notifications')
          },
          // qiji 0.20.4: 隐藏「账单与套餐」导航（纯 Nous Portal 订阅页；中转站
          // 未定。接自家中转时恢复此 entry 与子项）。
          {
            active: activeView === 'providers',
            children: [
              {
                active: activeView === 'providers' && providerView === 'accounts',
                icon: codiconIcon('account'),
                id: 'pview:accounts',
                label: t.settings.nav.providerAccounts,
                onSelect: () => openProviderView('accounts')
              },
              {
                active: activeView === 'providers' && providerView === 'keys',
                icon: KeyRound,
                id: 'pview:keys',
                label: t.settings.nav.providerApiKeys,
                onSelect: () => openProviderView('keys')
              },
              // qiji: 自定义端点导航项不暴露——产品走平台后端,该上游功能打本地
              // runtime 会 404 报"无法加载自定义端点",对用户是纯噪音。
              // Local models ships behind the --local launch flag: no flag, no
              // nav entry (the pane itself also refuses to render, so a stale
              // ?pview=local deep link falls back to accounts-shaped emptiness
              // rather than a hidden feature).
              ...($localModelsEnabled.get()
                ? [
                    {
                      active: activeView === 'providers' && providerView === 'local',
                      icon: Cpu,
                      id: 'pview:local',
                      label: t.settings.nav.providerLocalModels,
                      onSelect: () => openProviderView('local')
                    }
                  ]
                : [])
            ],
            gapBefore: true,
            icon: Zap,
            id: 'providers',
            label: t.settings.nav.providers,
            onSelect: () => setActiveView('providers')
          },
          {
            active: activeView === 'gateway',
            icon: Globe,
            id: 'gateway',
            label: t.settings.nav.gateway,
            onSelect: () => setActiveView('gateway')
          },
          {
            active: activeView === 'keybinds',
            icon: Keyboard,
            id: 'keybinds',
            label: t.settings.nav.keybinds,
            onSelect: () => setActiveView('keybinds')
          },
          // qiji 0.20.5d: 「工具与密钥」整页挂高级开关（r6 盘点拍板）——平台侧
          // API key / .env 管理对平台账号用户无意义（key 由服务端托管），
          // 默认不陈列；对齐 providers local models 的条件展开模式（深链仍可
          // 直达，页面本体不渲染受影响面）。
          ...(advancedFeatures
            ? [
                {
                  active: activeView === 'keys',
                  children: [
                    {
                      active: activeView === 'keys' && keysView === 'tools',
                      icon: Wrench,
                      id: 'kview:tools',
                      label: t.settings.nav.keysTools,
                      onSelect: () => openKeysView('tools')
                    },
                    {
                      active: activeView === 'keys' && keysView === 'settings',
                      icon: Settings2,
                      id: 'kview:settings',
                      label: t.settings.nav.keysSettings,
                      onSelect: () => openKeysView('settings')
                    }
                  ],
                  icon: KeyRound,
                  id: 'keys',
                  label: t.settings.nav.apiKeys,
                  onSelect: () => setActiveView('keys')
                }
              ]
            : []),
          {
            active: activeView === 'market',
            icon: Palette,
            id: 'market',
            label: t.settings.nav.market,
            onSelect: () => setActiveView('market')
          },
          ...(authState.token
            ? [
                {
                  active: activeView === 'account',
                  gapBefore: true,
                  icon: Users,
                  id: 'account',
                  label: t.settings.nav.account,
                  onSelect: () => setActiveView('account')
                }
              ]
            : []),
          {
            active: activeView === 'sessions',
            icon: Archive,
            id: 'sessions',
            label: t.settings.nav.sessions,
            onSelect: () => setActiveView('sessions')
          },
          {
            active: activeView === 'about',
            gapBefore: true,
            icon: Info,
            id: 'about',
            label: t.settings.nav.about,
            onSelect: () => setActiveView('about')
          }
        ] as OverlayNavGroup[]
      ).map(group => {
        const view = group.id as SettingsViewId
        let children = settingsSubpages(view)

        // qiji 0.20.5: 砍可见性不砍功能——纯开发者向子页默认隐藏，设置→关于
        // 打开「高级功能」开关后放出（深链仍可直达，只是不在导航里陈列；
        // 物理功能与已存配置不受影响）。0.20.5c 起扩到模型/记忆分区的
        // 调参子页（ADVANCED_GATED_SUBPAGES_BY_VIEW）。
        const gated = ADVANCED_GATED_SUBPAGES_BY_VIEW[view]

        if (gated && !advancedFeatures) {
          children = children.filter(page => !gated.has(page.id))
        }

        return children.length
          ? {
              ...group,
              children: children.map(page => ({
                active: group.active && subpage === page.id,
                icon: settingsSubpageIcon(page, group.icon),
                id: `${view}:${page.id}`,
                label: t.settings.subpages[page.labelKey],
                onSelect: () => openSettingsPage(view, page.id)
              }))
            }
          : group
      }),
    [
      activeView,
      advancedFeatures,
      authState.token,
      billingView,
      canViewPlans,
      keysView,
      providerView,
      subpage,
      t,
      setActiveView,
      openProviderView,
      openKeysView,
      openSettingsPage,
      openSubView
    ]
  )

  // qiji 螃蟹OPC: 两级导航——当前分组所属大类 + 该大类下的可见分组 + 大类切换
  const activeCategory = useMemo(
    () =>
      navGroups.find(group => group.active) ? categoryOfGroup(navGroups.find(group => group.active)!.id) : 'general',
    [navGroups]
  )

  const visibleGroups = useMemo(
    () => navGroups.filter(group => categoryOfGroup(group.id) === activeCategory),
    [navGroups, activeCategory]
  )

  const onSelectCategory = useCallback(
    (categoryId: string) => {
      // 切大类 = 跳到该大类第一个分组
      const first = navGroups.find(group => categoryOfGroup(group.id) === categoryId)
      first?.onSelect()
    },
    [navGroups]
  )

  const activeGroup = navGroups.find(group => group.active)
  const activeChild = activeGroup?.children?.find(child => child.active)

  // Type-to-search: printable keystrokes on the Settings surface (outside any
  // field) open the settings-scoped palette, seeded with the character — same
  // reflex as the chat surface's type-to-focus, pointed at search instead.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ($commandPaletteOpen.get() || isEditableTarget(event.target)) {
        return
      }

      const char = typeToFocusChar(event)

      if (char === null || char === ' ') {
        return
      }

      event.preventDefault()
      openCommandPalettePage('settings', char)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Fake search pill riding the card's top edge, dead-center and half off it.
  // Clicking (or just typing) opens the ⌘K palette scoped to settings; while
  // the palette is up the pill hands over to it — grows slightly and fades,
  // then fades back when the palette closes. It sits outside the raised card,
  // so it needs its own opaque glass surface to mask the content underneath.
  const searchCombo = bindingsFor('nav.commandPalette')[0]
  const paletteOpen = useStore($commandPaletteOpen)

  const searchPill = (
    <button
      className={cn(
        'flex h-(--titlebar-control-height) items-center gap-1.5 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) px-2.5 text-(--ui-text-tertiary) shadow-sm transition-all duration-200 ease-out hover:text-foreground motion-reduce:transition-none',
        paletteOpen && 'pointer-events-none scale-110 opacity-0'
      )}
      data-glass-opaque=""
      onClick={() => {
        triggerHaptic('open')
        openCommandPalettePage('settings')
      }}
      tabIndex={paletteOpen ? -1 : undefined}
      type="button"
    >
      <Search className="size-3" />
      <span className="text-xs">{t.settings.search.pill}</span>
      {searchCombo && <KbdCombo combo={searchCombo} size="sm" variant="ghost" />}
    </button>
  )

  const navFooter = (
    <>
      <Tip label={t.settings.exportConfig}>
        <OverlayIconButton onClick={() => void exportConfig()}>
          <Download />
        </OverlayIconButton>
      </Tip>
      <Tip label={t.settings.importConfig}>
        <OverlayIconButton
          onClick={() => {
            triggerHaptic('open')
            importInputRef.current?.click()
          }}
        >
          <Upload />
        </OverlayIconButton>
      </Tip>
      <Tip label={t.settings.resetToDefaults}>
        <OverlayIconButton
          className="hover:text-destructive"
          onClick={() => {
            triggerHaptic('warning')
            void resetConfig()
          }}
        >
          <RefreshCw />
        </OverlayIconButton>
      </Tip>
    </>
  )

  const activeSettingsContent =
    activeView === 'config:appearance' ? (
      <AppearanceSettings subpage={subpage} />
    ) : activeView === 'market' ? (
      <MarketSettings />
    ) : activeView === 'account' ? (
      <AccountSettings />
    ) : activeView === 'about' ? (
      <AboutSettings subpage={subpage} />
    ) : activeView === 'gateway' || activeView === 'connections' ? (
      // 'connections' renders the unified page too so the frame before
      // the alias redirect lands doesn't flash the fallback view.
      <GatewaySettings subpage={subpage} />
    ) : activeView === 'keybinds' ? (
      <KeybindSettings subpage={subpage} />
    ) : activeView.startsWith('config:') ? (
      <ConfigSettings
        activeSectionId={activeView.slice('config:'.length)}
        importInputRef={importInputRef}
        onConfigSaved={onConfigSaved}
        onMainModelChanged={onMainModelChanged}
        subpage={subpage}
      />
    ) : activeView === 'providers' ? (
      <ProvidersSettings
        key={scopeProfile}
        onClose={onClose}
        onConfigSaved={onConfigSaved}
        onMainModelChanged={onMainModelChanged}
        onViewChange={setProviderView}
        view={providerView}
      />
    ) : activeView === 'keys' ? (
      <KeysSettings view={keysView} />
    ) : activeView === 'notifications' ? (
      <NotificationsSettings subpage={subpage} />
    ) : activeView === 'billing' ? (
      // qiji 0.20.4: 账单页随导航一起隐藏（Nous 订阅页）；深链/?tab=billing
      // 兜底渲染空区块，接自家中转时随 nav entry 一并恢复。
      <BillingSettings />
    ) : activeView === 'vault' ? (
      <VaultSettings key={vaultOwnerKey(activeConnectionId, scopeProfile)} subpage={subpage} />
    ) : (
      <SessionsSettings subpage={subpage} />
    )

  return (
    <OverlayView closeLabel={t.settings.closeSettings} edgeBadge={searchPill} onClose={onClose}>
      {/* qiji 螃蟹OPC: 设置页两级导航——顶部 6 大类标签栏（一行放下，永不溢出）+
          左侧 rail 只显示当前大类下的分组。信息架构对标 dashboard。 */}
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
        <div className="hidden px-1 pt-[calc(var(--titlebar-height)/2+0.5rem)] max-[47.5rem]:block">
          <SettingsNarrowNav footer={navFooter} groups={navGroups} />
        </div>
        <div className="shrink-0 px-1 pt-[calc(var(--titlebar-height)/2+0.375rem)]">
          <SettingsCategoryBar activeCategory={activeCategory} onSelect={onSelectCategory} />
        </div>
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <SettingsSideRail footer={navFooter} groups={visibleGroups} />
          <OverlayMain className="px-0 pb-0">
            <SettingsBreadcrumbContext.Provider value>
              {activeGroup && <SettingsSubpageHeader child={activeChild} group={activeGroup} />}
              {needsSubpageRedirect ? (
                <Navigate replace to={{ hash, pathname, search: `?${subpageSearch}` }} />
              ) : (
                activeSettingsContent
              )}
            </SettingsBreadcrumbContext.Provider>
          </OverlayMain>
        </div>
      </div>
    </OverlayView>
  )
}

export { SettingsView as SettingsPage }
