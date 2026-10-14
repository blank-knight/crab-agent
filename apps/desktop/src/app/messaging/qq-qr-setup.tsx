import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorBanner } from '@/components/ui/error-state'
import {
  applyQqOnboarding,
  cancelQqOnboarding,
  getQqOnboardingStatus,
  type MessagingPlatformInfo,
  type QqOnboardingApplyResponse,
  type QqOnboardingStartResponse,
  startQqOnboarding
} from '@/hermes'
import { useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { Check, ExternalLink, Loader2, QrCode, X } from '@/lib/icons'

type Phase = 'applying' | 'confirmed' | 'idle' | 'starting' | 'waiting'

async function renderQr(payload: string): Promise<string> {
  const QRCode = await import('qrcode')

  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 224 })
}

export interface QqQrSetupProps {
  /** Called after the backend saved the credentials; receives the restart outcome. */
  onApplied: (result: QqOnboardingApplyResponse) => void
  platform: MessagingPlatformInfo
  /** Request-shaped profile scope (undefined → active profile). */
  scopeProfile: string | undefined
}

/**
 * QQ Bot "Quick setup": scan with QQ on q.qq.com's bind-task QR and the bot's
 * app_id + client_secret are minted for you — no open-platform console visit.
 * Mirrors WeixinQrSetup; the scanner's openid is auto-allowed by the backend.
 */
export function QqQrSetup({ onApplied, platform, scopeProfile }: QqQrSetupProps) {
  const { t } = useI18n()
  const q = t.messaging.qqQr
  const [setup, setSetup] = useState<null | QqOnboardingStartResponse>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [connectedApp, setConnectedApp] = useState<null | string>(null)
  const [error, setError] = useState('')

  const reset = () => {
    setSetup(null)
    setQrDataUrl('')
    setPhase('idle')
    setError('')
  }

  // Poll until QQ confirms. Transient errors keep polling; 404 resets the card.
  useEffect(() => {
    if (!setup || (phase !== 'waiting' && phase !== 'confirmed')) {
      return
    }

    let cancelled = false
    let timer: null | number = null

    const poll = async () => {
      try {
        const status = await getQqOnboardingStatus(setup.pairing_id, scopeProfile)

        if (cancelled) {
          return
        }

        if (status.status === 'confirmed') {
          setPhase('confirmed')
          setError('')

          return
        }

        if (status.status === 'timeout') {
          setSetup(null)
          setQrDataUrl('')
          setPhase('idle')
          setError(status.error || q.expired)

          return
        }

        // QR refreshed server-side; re-render the new code.
        if (status.qr_url && status.qr_url !== setup.qr_url) {
          setSetup({ ...setup, qr_url: status.qr_url })
          void renderQr(status.qr_url).then(url => {
            if (!cancelled) {
              setQrDataUrl(url)
            }
          })
        }

        setError('')
        timer = window.setTimeout(() => void poll(), 2000)
      } catch (pollError) {
        if (cancelled) {
          return
        }

        if (/\b404\b/.test(String(pollError))) {
          setSetup(null)
          setQrDataUrl('')
          setPhase('idle')
          setError(q.sessionGone)

          return
        }

        timer = window.setTimeout(() => void poll(), 3000)
      }
    }

    timer = window.setTimeout(() => void poll(), 1200)

    return () => {
      cancelled = true

      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [phase, q, scopeProfile, setup])

  const start = async () => {
    setPhase('starting')
    setError('')
    setConnectedApp(null)

    try {
      const result = await startQqOnboarding(scopeProfile)
      const dataUrl = await renderQr(result.qr_url)
      setSetup(result)
      setQrDataUrl(dataUrl)
      setPhase('waiting')
    } catch (startError) {
      setPhase('idle')
      setError(String(startError))
    }
  }

  const cancel = async () => {
    if (setup) {
      try {
        await cancelQqOnboarding(setup.pairing_id, scopeProfile)
      } catch {
        // Local cleanup still wins; the backend hard-expires sessions itself.
      }
    }

    reset()
  }

  const apply = async () => {
    if (!setup) {
      return
    }

    setPhase('applying')
    setError('')

    try {
      const result = await applyQqOnboarding(setup.pairing_id, scopeProfile)
      reset()
      setConnectedApp(result.app_id)
      onApplied(result)
    } catch (applyError) {
      setPhase('confirmed')
      setError(String(applyError))
    }
  }

  return (
    <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary,transparent) p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[length:var(--conversation-text-font-size)] font-medium">{q.quickSetup}</span>
            <Badge variant="success">{q.recommended}</Badge>
          </div>
          <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {q.quickHelp}
          </p>
        </div>
        {phase === 'idle' && (
          <Button onClick={() => void start()} size="sm">
            <QrCode />
            {q.startScan}
          </Button>
        )}
        {phase === 'starting' && (
          <Button disabled size="sm">
            {q.starting}
          </Button>
        )}
      </div>

      {phase === 'idle' && connectedApp && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="success">{t.messaging.states.connected}</Badge>
          <span className="font-mono text-xs text-muted-foreground">{connectedApp}</span>
        </div>
      )}

      {platform.configured && phase === 'idle' && !connectedApp && (
        <p className="mt-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-muted-foreground">
          {q.replaceWarning}
        </p>
      )}

      {error && <ErrorBanner className="mt-3">{error}</ErrorBanner>}

      {setup && qrDataUrl && (
        <div className="mt-3 grid gap-4 border-t border-(--ui-stroke-secondary) pt-3 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="grid content-start gap-3">
            {phase === 'waiting' && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warn">{q.waiting}</Badge>
                <span className="text-xs text-muted-foreground">{q.scanHint}</span>
              </div>
            )}

            {phase === 'confirmed' && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">
                  <Check />
                  {q.confirmed}
                </Badge>
                <span className="text-xs text-muted-foreground">{q.confirmedHint}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {phase === 'confirmed' || phase === 'applying' ? (
                <Button disabled={phase === 'applying'} onClick={() => void apply()} size="sm">
                  {phase === 'applying' ? <Loader2 className="animate-spin" /> : <Check />}
                  {phase === 'applying' ? q.applying : q.saveAndRestart}
                </Button>
              ) : null}
              <Button onClick={() => void cancel()} size="sm" variant="secondary">
                <X />
                {t.common.cancel}
              </Button>
            </div>
          </div>

          <div className="grid justify-items-center gap-2">
            <img
              alt={q.qrAlt}
              className="size-[224px] rounded-lg border border-(--ui-stroke-secondary) bg-white p-2"
              src={qrDataUrl}
            />
            <div className="max-w-[224px] text-center text-xs leading-relaxed text-muted-foreground">
              {q.autoRefreshHint}
            </div>
            {setup.qr_url && (
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                onClick={() => void openExternalLink(setup.qr_url)}
                type="button"
              >
                <ExternalLink className="size-3" />
                {q.openLink}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
