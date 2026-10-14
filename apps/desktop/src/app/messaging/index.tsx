import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { StatusDot, type StatusTone } from '@/components/status-dot'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { ErrorBanner } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import {
  approvePairing,
  type FeishuOnboardingApplyResponse,
  getMessagingPlatforms,
  getPairing,
  type MessagingEnvVarInfo,
  type MessagingPlatformInfo,
  type PairingUser,
  type QqOnboardingApplyResponse,
  revokePairing,
  type TelegramOnboardingApplyResponse,
  updateMessagingPlatform,
  type WeixinOnboardingApplyResponse
} from '@/hermes'
import { type Translations, useI18n } from '@/i18n'
import { openExternalLink } from '@/lib/external-link'
import { AlertTriangle, ExternalLink, RefreshCw, Save, Trash2 } from '@/lib/icons'
import { normalize } from '@/lib/text'
import { cn } from '@/lib/utils'
import { $changeEventsAvailable, $pairingChangeTick, $platformsChangeTick } from '@/store/live-sync'
import { notify, notifyError } from '@/store/notifications'
import { $settingsRequestProfile } from '@/store/settings-scope'
import { $gatewayRestarting, runGatewayRestart, watchGatewayRestartOutcome } from '@/store/system-actions'

import { SegmentedControl, type SegmentedControlOption } from '../../components/ui/segmented-control'
import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { DetailColumn, ListColumn, MasterDetail } from '../master-detail'
import { PageSearchShell } from '../page-search-shell'
import { CREDENTIAL_CONTROL_CLASS } from '../settings/credential-key-ui'
import { credentialPreview } from '../settings/helpers'
import { ListRow } from '../settings/primitives'
import { SettingsProfileScope } from '../settings/profile-scope'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { FeishuQrSetup } from './feishu-qr-setup'
import { PlatformAvatar } from './platform-icon'
import { groupPlatformsByRegion, PLATFORM_DESC_ZH, PLATFORM_NAME_ZH, platformRegion, type PlatformRegion } from './platforms-zh'
import { QqQrSetup } from './qq-qr-setup'
import { TelegramQrSetup } from './telegram-qr-setup'
import { WeixinQrSetup } from './weixin-qr-setup'

interface MessagingViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

type EditMap = Record<string, Record<string, string>>

const PILL_TONE: Record<StatusTone, string> = {
  good: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  bad: 'bg-destructive/10 text-destructive'
}

const stateLabel = (state: null | string | undefined, m: Translations['messaging']) =>
  state ? m.states[state] || state.replace(/_/g, ' ') : m.unknown

function stateTone({ enabled, state }: MessagingPlatformInfo): StatusTone {
  if (!enabled) {
    return 'muted'
  }

  if (state === 'connected') {
    return 'good'
  }

  if (state === 'fatal' || state === 'startup_failed') {
    return 'bad'
  }

  return 'warn'
}

const trimEdits = (edits: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(edits)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v)
  )

/** Stable row identity: a user id is only unique within its platform. */
const pairingKey = (user: PairingUser) => `${user.platform}:${user.user_id}`

const pairingLabel = (user: PairingUser) => user.user_name || user.user_id

/** Group pairing rows by platform id so a detail pane can slice its own. */
function byPlatform(rows: PairingUser[]): Record<string, PairingUser[]> {
  const grouped: Record<string, PairingUser[]> = {}

  for (const row of rows) {
    ;(grouped[row.platform] ||= []).push(row)
  }

  return grouped
}

const FIELD_COPY: Record<string, { advanced?: boolean }> = {
  TELEGRAM_PROXY: { advanced: true },
  DISCORD_REPLY_TO_MODE: { advanced: true },
  DISCORD_ALLOW_ALL_USERS: { advanced: true },
  DISCORD_HOME_CHANNEL: { advanced: true },
  DISCORD_HOME_CHANNEL_NAME: { advanced: true },
  BLUEBUBBLES_ALLOW_ALL_USERS: { advanced: true },
  MATTERMOST_ALLOW_ALL_USERS: { advanced: true },
  MATTERMOST_HOME_CHANNEL: { advanced: true },
  QQ_ALLOW_ALL_USERS: { advanced: true },
  QQBOT_HOME_CHANNEL: { advanced: true },
  QQBOT_HOME_CHANNEL_NAME: { advanced: true },
  WHATSAPP_ENABLED: { advanced: true },
  WHATSAPP_MODE: { advanced: true },
  // qiji 0.20.5i: 飞书走 WebSocket 长连接，必填仅 AppID+Secret；这两个是
  // webhook 回调模式的可选项（adapter.py:1660），平铺在表单里吓退用户。
  FEISHU_ENCRYPT_KEY: { advanced: true },
  FEISHU_VERIFICATION_TOKEN: { advanced: true }
}

function fieldCopy(field: MessagingEnvVarInfo, m: Translations['messaging']) {
  const copy = FIELD_COPY[field.key] || {}
  const localized = m.fieldCopy[field.key] || {}

  return {
    label: localized.label || field.prompt || field.key,
    help: localized.help || field.description,
    // qiji 0.20.5c: 有中文文案时 placeholder 不再回退后端英文 prompt——
    // 此前「中文标签 + 输入框英文提示」双显（0.20.5b 验收反馈）。
    placeholder: localized.placeholder || localized.label || field.prompt,
    advanced: Boolean(copy.advanced || field.advanced)
  }
}

export function MessagingView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: MessagingViewProps) {
  const { t } = useI18n()
  const m = t.messaging
  // Shared settings "Applies to" scope, request-shaped (undefined → follow
  // the active profile; the API helpers treat null as "target primary").
  const scopeProfile = useStore($settingsRequestProfile)
  const [platforms, setPlatforms] = useState<MessagingPlatformInfo[] | null>(null)
  // A saved credential/toggle only takes effect on the next gateway start, so a
  // vanishing toast is not enough: the page keeps a banner up until a restart
  // actually happens (dashboard parity). Cleared on a completed restart.
  const [restartNeeded, setRestartNeeded] = useState(false)
  const gatewayRestarting = useStore($gatewayRestarting)

  const [pairing, setPairing] = useState<{ approved: PairingUser[]; pending: PairingUser[] }>({
    approved: [],
    pending: []
  })

  const [approving, setApproving] = useState<null | string>(null)
  const [pendingRevoke, setPendingRevoke] = useState<null | PairingUser>(null)
  const [edits, setEdits] = useState<EditMap>({})
  const [query, setQuery] = useState('')
  // qiji 0.20.5: 地域段选（国内默认）——列表形态与 hermes 原生平铺列表区分
  const [region, setRegion] = useState<PlatformRegion>('cn')
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const platformIds = useMemo(() => platforms?.map(p => p.id) ?? [], [platforms])
  const [selectedId, setSelectedId] = useRouteEnumParam('platform', platformIds, platformIds[0] ?? '')

  const restartGatewayNow = useCallback(async () => {
    // runGatewayRestart never rejects: it toasts the failure and settles the
    // statusbar indicator; the banner stays if the restart did not complete.
    const ok = await runGatewayRestart()

    if (ok) {
      setRestartNeeded(false)
      window.setTimeout(() => void refreshPlatformsRef.current(true), 4000)
    }
  }, [])

  // A multiplexed named profile is re-served from its new config at once (`hot_served`): no restart
  // banner; re-read status once the adapter had a moment to connect. Anything else needs a restart.
  const settleAfterUpdate = useCallback((hotServed: boolean | undefined) => {
    if (hotServed) {
      window.setTimeout(() => void refreshPlatformsRef.current(true), 4000)

      return
    }

    setRestartNeeded(true)
  }, [])

  // The scope each in-flight fetch was issued for. A→B: A's request can resolve
  // AFTER the switch and repaint A's platforms/env snapshot (its redacted
  // Telegram token included) under B until B's own response lands (#96542).
  // A response whose scope is no longer the rendered one is dropped.
  const scopeRef = useRef(scopeProfile)

  scopeRef.current = scopeProfile

  const refreshPlatforms = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRefreshing(true)
      }

      try {
        const result = await getMessagingPlatforms(scopeProfile)

        if (scopeRef.current === scopeProfile) {
          setPlatforms(result.platforms)
        }
      } catch (err) {
        if (!silent) {
          notifyError(err, m.loadFailed)
        }
      } finally {
        if (!silent) {
          setRefreshing(false)
        }
      }
    },
    [m, scopeProfile]
  )

  // Latest-callback ref: the deferred post-restart refresh must not capture a
  // stale scope closure from before a profile switch.
  const refreshPlatformsRef = useRef(refreshPlatforms)

  refreshPlatformsRef.current = refreshPlatforms

  // Pairing has its own signal. platforms.changed tracks connect/disconnect
  // health via gateway_state.json, which a new pairing request never moves —
  // riding it would leave a pending row invisible until something unrelated
  // reconnected. Failures stay silent: an older backend without the endpoint
  // should show no rows, not an error banner over a working page.
  const refreshPairing = useCallback(async () => {
    try {
      const result = await getPairing(scopeProfile)

      if (scopeRef.current === scopeProfile) {
        setPairing({ approved: result.approved ?? [], pending: result.pending ?? [] })
      }
    } catch {
      // Leave the last known rows in place rather than blanking them.
    }
  }, [scopeProfile])

  const refreshAll = useCallback(
    async (silent = false) => {
      await Promise.all([refreshPlatforms(silent), refreshPairing()])
    },
    [refreshPairing, refreshPlatforms]
  )

  useRefreshHotkey(() => void refreshAll())

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  // Scope switch: the mounted list still shows the PREVIOUS profile's
  // platforms/pairing while the new fetch is in flight — blank it so stale
  // rows can't be toggled against the wrong backend. This must run during
  // render, not in an effect: passive effects fire after paint, and that
  // first painted frame would show the previous profile's credential
  // placeholders (e.g. a redacted Telegram token) under the new profile's
  // scope for the ~1s until the fetch lands (#96542). Setting state during
  // render makes React throw the stale frame away before it reaches the
  // screen.
  const [prevScope, setPrevScope] = useState(scopeProfile)

  if (prevScope !== scopeProfile) {
    setPrevScope(scopeProfile)
    setPlatforms(null)
    setPairing({ approved: [], pending: [] })
    setEdits({})
  }

  const changeEventsAvailable = useStore($changeEventsAvailable)
  const platformsChangeTick = useStore($platformsChangeTick)
  const pairingChangeTick = useStore($pairingChangeTick)

  // A new pending request (or a grant from another surface) moves the pairing
  // store on disk; the change watcher turns that into pairing.changed.
  useEffect(() => {
    if (!changeEventsAvailable || pairingChangeTick === 0 || document.hidden) {
      return
    }

    void refreshPairing()
  }, [changeEventsAvailable, pairingChangeTick, refreshPairing])

  // Connection status updates without a manual "check" click. platforms.changed
  // (the gateway persisting connect/disconnect/health to gateway_state.json)
  // drives the refresh on event-capable backends — no timer; older backends
  // keep the legacy visible-tab poll.
  useEffect(() => {
    if (!changeEventsAvailable || platformsChangeTick === 0 || document.hidden) {
      return
    }

    void refreshPlatforms(true)
  }, [changeEventsAvailable, platformsChangeTick, refreshPlatforms])

  useEffect(() => {
    if (changeEventsAvailable) {
      return
    }

    let cancelled = false

    function tick() {
      if (cancelled || document.hidden) {
        return
      }

      void refreshAll(true)
    }

    const id = window.setInterval(tick, 6000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [changeEventsAvailable, refreshAll])

  const selected = useMemo(() => {
    if (!platforms) {
      return null
    }

    return platforms.find(platform => platform.id === selectedId) || platforms[0] || null
  }, [platforms, selectedId])

  const pendingByPlatform = useMemo(() => byPlatform(pairing.pending), [pairing.pending])
  const approvedByPlatform = useMemo(() => byPlatform(pairing.approved), [pairing.approved])

  const visiblePlatforms = useMemo(() => {
    if (!platforms) {
      return []
    }

    const q = normalize(query)

    if (!q) {
      return platforms
    }

    return platforms.filter(platform =>
      [platform.id, platform.name, platform.description, platform.state]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [platforms, query])

  // qiji 0.20.5: 地域分组派生——段选数据源
  const regionGroups = useMemo(() => groupPlatformsByRegion(visiblePlatforms), [visiblePlatforms])

  const regionPlatformsByGroup = useMemo(() => {
    const byGroup: Partial<Record<PlatformRegion, MessagingPlatformInfo[]>> = {}

    for (const group of regionGroups) {
      byGroup[group.id] = group.platforms
    }

    return byGroup
  }, [regionGroups])

  // 跨组结果只在搜索时出现——平时切到哪组就只看哪组（列表形态干净），
  // 搜索时全量命中可达，点跨组项自动切组。
  const otherRegionHits = useMemo(
    () => (query.trim() ? visiblePlatforms.filter(p => platformRegion(p.id) !== region) : []),
    [visiblePlatforms, region, query]
  )

  async function handleToggle(platform: MessagingPlatformInfo, enabled: boolean) {
    setSaving(`enabled:${platform.id}`)

    try {
      const result = await updateMessagingPlatform(platform.id, { enabled }, scopeProfile)
      setPlatforms(
        current =>
          current?.map(row =>
            row.id === platform.id
              ? {
                  ...row,
                  enabled,
                  state: enabled ? (row.configured ? 'pending_restart' : 'not_configured') : 'disabled'
                }
              : row
          ) ?? current
      )
      settleAfterUpdate(result.hot_served)
      notify({
        kind: 'success',
        title: enabled ? m.platformEnabled(platform.name) : m.platformDisabled(platform.name),
        message: result.hot_served ? m.appliedLive : m.restartToApply
      })
    } catch (err) {
      notifyError(err, m.failedUpdate(platform.name))
    } finally {
      setSaving(null)
    }
  }

  async function handleSave(platform: MessagingPlatformInfo) {
    const env = trimEdits(edits[platform.id] || {})

    if (Object.keys(env).length === 0) {
      return
    }

    setSaving(`env:${platform.id}`)

    try {
      const result = await updateMessagingPlatform(platform.id, { env }, scopeProfile)
      setEdits(current => ({ ...current, [platform.id]: {} }))
      await refreshPlatforms()
      settleAfterUpdate(result.hot_served)
      notify({
        kind: 'success',
        title: m.setupSaved(platform.name),
        message: result.hot_served ? m.connectingLive : m.restartToReconnect
      })
    } catch (err) {
      notifyError(err, m.failedSave(platform.name))
    } finally {
      setSaving(null)
    }
  }

  async function handleClear(platform: MessagingPlatformInfo, key: string) {
    setSaving(`clear:${key}`)

    try {
      const result = await updateMessagingPlatform(platform.id, { clear_env: [key] }, scopeProfile)
      setEdits(current => ({
        ...current,
        [platform.id]: {
          ...(current[platform.id] || {}),
          [key]: ''
        }
      }))
      await refreshPlatforms()
      settleAfterUpdate(result.hot_served)
      notify({ kind: 'success', title: m.keyCleared(key), message: m.setupUpdated(platform.name) })
    } catch (err) {
      notifyError(err, m.failedClear(key))
    } finally {
      setSaving(null)
    }
  }

  // QR onboarding wrote the token + allowlist and asked the backend to restart
  // the gateway. restart_started only means the child spawned; watch its exit
  // so a failed restart lands in the banner instead of a silent "stopped".
  async function handleTelegramApplied(result: TelegramOnboardingApplyResponse) {
    await refreshPlatforms(true)

    if (result.restart_started) {
      const connectedBot = result.bot_username ? `${m.states.connected}: @${result.bot_username}` : null

      notify({
        kind: 'success',
        title: m.setupSaved('Telegram'),
        message: [connectedBot, m.telegramQr.savedRestarting].filter(Boolean).join(' · ')
      })
      setRestartNeeded(false)
      const ok = await watchGatewayRestartOutcome()

      if (!ok) {
        setRestartNeeded(true)
        notify({
          kind: 'error',
          title: m.restartFailedManual,
          message: m.restartFailedManualDetail,
          action: { label: m.restartAgain, onClick: () => void runGatewayRestart() },
          secondaryAction: {
            label: m.openLogs,
            onClick: () => void window.hermesDesktop?.revealLogs?.().catch(() => undefined)
          }
        })
      }

      void refreshPlatforms(true)

      return
    }

    if (result.needs_restart) {
      // Backend could not spawn the restart (or is too old to try): fall back
      // to the app's own restart action, same as the manual-save path.
      await restartGatewayNow()

      if (result.restart_error) {
        notifyError(new Error(result.restart_error), m.telegramQr.savedRestartFailed(`: ${result.restart_error}`))
        setRestartNeeded(true)
      }
    }
  }

  // Feishu QR onboarding: same post-apply handling as Weixin.
  async function handleFeishuApplied(result: FeishuOnboardingApplyResponse) {
    await refreshPlatforms(true)

    if (result.restart_started) {
      notify({
        kind: 'success',
        title: m.setupSaved(PLATFORM_NAME_ZH.feishu ?? 'Feishu'),
        message: m.feishuQr.savedRestarting
      })
      setRestartNeeded(false)
      const ok = await watchGatewayRestartOutcome()

      if (!ok) {
        setRestartNeeded(true)
        notify({
          kind: 'error',
          title: m.restartFailedManual,
          message: m.restartFailedManualDetail,
          action: { label: m.restartAgain, onClick: () => void runGatewayRestart() },
          secondaryAction: {
            label: m.openLogs,
            onClick: () => void window.hermesDesktop?.revealLogs?.().catch(() => undefined)
          }
        })
      }

      void refreshPlatforms(true)

      return
    }

    if (result.needs_restart) {
      await restartGatewayNow()

      if (result.restart_error) {
        notifyError(new Error(result.restart_error), m.feishuQr.savedRestartFailed(`: ${result.restart_error}`))
        setRestartNeeded(true)
      }
    }
  }

  // QQ QR onboarding: same post-apply handling as Weixin.
  async function handleQqApplied(result: QqOnboardingApplyResponse) {
    await refreshPlatforms(true)

    if (result.restart_started) {
      notify({
        kind: 'success',
        title: m.setupSaved(PLATFORM_NAME_ZH.qqbot ?? 'QQ Bot'),
        message: m.qqQr.savedRestarting
      })
      setRestartNeeded(false)
      const ok = await watchGatewayRestartOutcome()

      if (!ok) {
        setRestartNeeded(true)
        notify({
          kind: 'error',
          title: m.restartFailedManual,
          message: m.restartFailedManualDetail,
          action: { label: m.restartAgain, onClick: () => void runGatewayRestart() },
          secondaryAction: {
            label: m.openLogs,
            onClick: () => void window.hermesDesktop?.revealLogs?.().catch(() => undefined)
          }
        })
      }

      void refreshPlatforms(true)

      return
    }

    if (result.needs_restart) {
      await restartGatewayNow()

      if (result.restart_error) {
        notifyError(new Error(result.restart_error), m.qqQr.savedRestartFailed(`: ${result.restart_error}`))
        setRestartNeeded(true)
      }
    }
  }

  // Weixin QR onboarding wrote the credentials the same way; mirror the
  // Telegram post-apply handling (refresh → restart watch → banner).
  async function handleWeixinApplied(result: WeixinOnboardingApplyResponse) {
    await refreshPlatforms(true)

    if (result.restart_started) {
      notify({
        kind: 'success',
        title: m.setupSaved(PLATFORM_NAME_ZH.weixin ?? 'Weixin'),
        message: m.weixinQr.savedRestarting
      })
      setRestartNeeded(false)
      const ok = await watchGatewayRestartOutcome()

      if (!ok) {
        setRestartNeeded(true)
        notify({
          kind: 'error',
          title: m.restartFailedManual,
          message: m.restartFailedManualDetail,
          action: { label: m.restartAgain, onClick: () => void runGatewayRestart() },
          secondaryAction: {
            label: m.openLogs,
            onClick: () => void window.hermesDesktop?.revealLogs?.().catch(() => undefined)
          }
        })
      }

      void refreshPlatforms(true)

      return
    }

    if (result.needs_restart) {
      await restartGatewayNow()

      if (result.restart_error) {
        notifyError(new Error(result.restart_error), m.weixinQr.savedRestartFailed(`: ${result.restart_error}`))
        setRestartNeeded(true)
      }
    }
  }

  // Approve/revoke paint from a snapshot immediately, then let the
  // authoritative refresh have the last word. A failed write restores the
  // snapshot so the row never silently disappears on an error.
  async function handleApprove(user: PairingUser) {
    if (!user.request_id) {
      return
    }

    const key = pairingKey(user)
    const snapshot = pairing
    setApproving(key)
    setPairing(current => ({
      approved: current.approved,
      pending: current.pending.filter(row => pairingKey(row) !== key)
    }))

    try {
      await approvePairing(user.platform, user.request_id, scopeProfile)
      notify({ kind: 'success', title: m.approvedUser(pairingLabel(user)), message: m.approvedHint })
      await refreshPairing()
    } catch (err) {
      setPairing(snapshot)
      // 429 is the code path's brute-force lockout — a distinct condition the
      // operator can only wait out, so it gets its own message.
      const lockedOut = err instanceof Error && err.message.includes('429')
      notifyError(err, lockedOut ? m.pairingLockedOut : m.failedApprove(pairingLabel(user)))
    } finally {
      setApproving(null)
    }
  }

  // ConfirmDialog owns the pending → done → close beat and shows an inline
  // error when onConfirm throws, so this rethrows instead of swallowing.
  async function handleRevoke(user: PairingUser) {
    const key = pairingKey(user)
    const snapshot = pairing
    setPairing(current => ({
      approved: current.approved.filter(row => pairingKey(row) !== key),
      pending: current.pending
    }))

    try {
      await revokePairing(user.platform, user.user_id, scopeProfile)
      notify({ kind: 'success', title: m.revokedUser(pairingLabel(user)), message: user.platform })
      await refreshPairing()
    } catch (err) {
      setPairing(snapshot)
      throw err
    }
  }

  return (
    <PageSearchShell
      {...props}
      onSearchChange={setQuery}
      searchHidden={(platforms?.length ?? 0) === 0}
      searchHints={platforms?.slice(0, 5).map(platform => t.common.tryHint(platform.name.toLowerCase()))}
      searchPlaceholder={m.search}
      searchValue={query}
    >
      {!platforms ? (
        <PageLoader label={m.loading} />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {/* Which profile's gateway this page configures (hidden for
              single-profile users). */}
          <SettingsProfileScope className="border-b border-(--ui-stroke-secondary) px-3 py-2" />
          <div className="min-h-0 flex-1">
            <MasterDetail>
              <ListColumn>
                {/* qiji 0.20.5: 地域段选——顶部切换国内/海外/其他，默认国内（产品主打国内）。
                    选中的组展开为平铺列表；搜索跨组命中时自动跳到命中项所在组，不打断查找。 */}
                <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
                  <SegmentedControl
                    onChange={id => {
                      setRegion(id)
                      // 段切换后当前选中平台若不在新组，不强制清空——右侧详情保持，回切即回
                    }}
                    options={REGION_OPTIONS}
                    value={region}
                  />
                  <span className="text-[0.7rem] tabular-nums text-(--ui-text-tertiary)">
                    {regionGroups.find(g => g.id === region)?.platforms.length ?? 0}
                  </span>
                </div>
                <ul className="space-y-1">
                  {(regionPlatformsByGroup[region] ?? []).map(platform => (
                    <li key={platform.id}>
                      <PlatformRow
                        active={selected?.id === platform.id}
                        onSelect={() => setSelectedId(platform.id)}
                        pendingCount={pendingByPlatform[platform.id]?.length ?? 0}
                        platform={platform}
                      />
                    </li>
                  ))}
                </ul>
                {/* 搜索命中其他组时的回跳入口——保持「搜索永远有结果可达」 */}
                {otherRegionHits.length > 0 && (
                  <div className="mt-3 border-t border-(--ui-stroke-secondary) pt-2">
                    <p className="px-2 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-(--ui-text-tertiary)">
                      其他分组中的结果
                    </p>
                    <ul className="space-y-1">
                      {otherRegionHits.map(platform => (
                        <li key={platform.id}>
                          <PlatformRow
                            active={selected?.id === platform.id}
                            onSelect={() => {
                              setRegion(platformRegion(platform.id))
                              setSelectedId(platform.id)
                            }}
                            pendingCount={pendingByPlatform[platform.id]?.length ?? 0}
                            platform={platform}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </ListColumn>

              <DetailColumn
                actionBar={
                  selected && (
                    <PlatformActionBar
                      hasEdits={Object.keys(trimEdits(edits[selected.id] || {})).length > 0}
                      onSave={() => void handleSave(selected)}
                      onToggle={enabled => void handleToggle(selected, enabled)}
                      platform={selected}
                      saving={saving}
                    />
                  )
                }
              >
                {restartNeeded && (
                  <Alert variant="warning">
                    <AlertTriangle />
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                      <span>{m.restartNeeded}</span>
                      <Button
                        disabled={gatewayRestarting}
                        onClick={() => void restartGatewayNow()}
                        size="sm"
                        variant="secondary"
                      >
                        <RefreshCw className={gatewayRestarting ? 'animate-spin' : undefined} />
                        {gatewayRestarting ? m.restarting : m.restartNow}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {selected && (
                  <PlatformDetail
                    approved={approvedByPlatform[selected.id] ?? []}
                    approving={approving}
                    edits={edits[selected.id] || {}}
                    onApprove={user => void handleApprove(user)}
                    onClear={key => void handleClear(selected, key)}
                    onEdit={(key, value) =>
                      setEdits(current => ({
                        ...current,
                        [selected.id]: {
                          ...(current[selected.id] || {}),
                          [key]: value
                        }
                      }))
                    }
                    onFeishuApplied={result => void handleFeishuApplied(result)}
                    onQqApplied={result => void handleQqApplied(result)}
                    onRevoke={setPendingRevoke}
                    onTelegramApplied={result => void handleTelegramApplied(result)}
                    onWeixinApplied={result => void handleWeixinApplied(result)}
                    pending={pendingByPlatform[selected.id] ?? []}
                    platform={selected}
                    saving={saving}
                    scopeProfile={scopeProfile}
                  />
                )}
              </DetailColumn>
            </MasterDetail>
          </div>
        </div>
      )}

      <ConfirmDialog
        busyLabel={m.revoking}
        cancelLabel={t.common.cancel}
        confirmLabel={m.revoke}
        description={pendingRevoke ? m.revokeDesc(pairingLabel(pendingRevoke)) : null}
        destructive
        onClose={() => setPendingRevoke(null)}
        onConfirm={() => (pendingRevoke ? handleRevoke(pendingRevoke) : undefined)}
        open={Boolean(pendingRevoke)}
        title={m.revokeTitle}
      />
    </PageSearchShell>
  )
}

const REGION_OPTIONS = [
  { id: 'cn', label: '国内' },
  { id: 'overseas', label: '海外' },
  { id: 'other', label: '其他' }
] as const satisfies readonly SegmentedControlOption<PlatformRegion>[]

function PlatformRow({
  active,
  onSelect,
  pendingCount,
  platform
}: {
  active: boolean
  onSelect: () => void
  pendingCount: number
  platform: MessagingPlatformInfo
}) {
  const { t } = useI18n()

  return (
    <button
      className={cn(
        'row-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:text-foreground',
        active ? 'bg-(--ui-row-active-background) text-foreground' : 'text-(--ui-text-secondary)'
      )}
      onClick={onSelect}
      type="button"
    >
      <PlatformAvatar platformId={platform.id} platformName={platform.name} />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-[length:var(--conversation-text-font-size)] font-normal">{PLATFORM_NAME_ZH[platform.id] ?? platform.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Someone is waiting to be let in — the only way this page tells
              you so before you open the platform. */}
          {pendingCount > 0 && (
            <span
              aria-label={t.messaging.pendingAria(pendingCount)}
              className={cn(
                'inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[0.66rem] font-medium tabular-nums',
                PILL_TONE.warn
              )}
            >
              {pendingCount}
            </span>
          )}
          <StatusDot tone={stateTone(platform)} />
        </span>
      </span>
    </button>
  )
}

function PlatformDetail({
  approved,
  approving,
  edits,
  onApprove,
  onClear,
  onEdit,
  onRevoke,
  onTelegramApplied,
  onWeixinApplied,
  onQqApplied,
  onFeishuApplied,
  pending,
  platform,
  saving,
  scopeProfile
}: {
  approved: PairingUser[]
  approving: null | string
  edits: Record<string, string>
  onApprove: (user: PairingUser) => void
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  onRevoke: (user: PairingUser) => void
  onTelegramApplied: (result: TelegramOnboardingApplyResponse) => void
  onWeixinApplied: (result: WeixinOnboardingApplyResponse) => void
  onQqApplied: (result: QqOnboardingApplyResponse) => void
  onFeishuApplied: (result: FeishuOnboardingApplyResponse) => void
  pending: PairingUser[]
  platform: MessagingPlatformInfo
  saving: string | null
  scopeProfile: string | undefined
}) {
  const { t } = useI18n()
  const m = t.messaging
  const [showAdvanced, setShowAdvanced] = useState(false)

  const requiredFields = platform.env_vars.filter(field => field.required)
  const optionalFields = platform.env_vars.filter(field => !field.required && !fieldCopy(field, m).advanced)
  const advancedFields = platform.env_vars.filter(field => !field.required && fieldCopy(field, m).advanced)
  const hiddenCount = advancedFields.length

  return (
    <>
      <header className="flex items-start gap-3">
        <PlatformAvatar platformId={platform.id} platformName={platform.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">{PLATFORM_NAME_ZH[platform.id] ?? platform.name}</h3>
            <StatePill tone={stateTone(platform)}>{stateLabel(platform.state, m)}</StatePill>
            {/* Resting states earn no pill — only actionable ones. */}
            {!platform.configured && <SetupPill active={false}>{m.needsSetup}</SetupPill>}
            {/* The state pill already reads "gateway stopped" when that is the
                platform's whole story; only add the hint when it is not. */}
            {!platform.gateway_running && platform.state !== 'gateway_stopped' && (
              <SetupPill active={false}>{m.gatewayStopped}</SetupPill>
            )}
          </div>
          <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {PLATFORM_DESC_ZH[platform.id] ?? platform.description}
          </p>
          <PlatformHint platform={platform} />
        </div>
      </header>

      {platform.error_message && <ErrorBanner>{platform.error_message}</ErrorBanner>}

      {/* Pending pairing requests. Rendered only when someone is actually
          waiting — an empty-state card here would be permanent chrome on a
          page that is usually about credentials, not approvals. */}
      {pending.length > 0 && (
        <section>
          <SectionTitle>{m.pendingRequests(pending.length)}</SectionTitle>
          <div className="mt-1 grid gap-1">
            {pending.map(user => {
              const busy = approving === pairingKey(user)
              const waited = typeof user.age_minutes === 'number' ? m.waitingSince(user.age_minutes) : null

              return (
                <ListRow
                  action={
                    <Button
                      disabled={busy || !user.request_id}
                      onClick={() => onApprove(user)}
                      size="sm"
                      variant="secondary"
                    >
                      {busy ? m.approving : m.approve}
                    </Button>
                  }
                  // An unnamed requester is only a user id — showing it as
                  // both title and description just repeats itself.
                  description={[user.user_name ? user.user_id : null, waited].filter(Boolean).join(' · ')}
                  key={pairingKey(user)}
                  title={pairingLabel(user)}
                />
              )
            })}
          </div>
        </section>
      )}

      {approved.length > 0 && (
        <section>
          <SectionTitle>{m.approvedUsers(approved.length)}</SectionTitle>
          <div className="mt-1 grid gap-1">
            {approved.map(user => (
              <ListRow
                action={
                  <Button
                    aria-label={m.revokeAria(pairingLabel(user))}
                    onClick={() => onRevoke(user)}
                    size="sm"
                    variant="ghost"
                  >
                    {m.revoke}
                  </Button>
                }
                description={user.user_name ? user.user_id : undefined}
                key={pairingKey(user)}
                title={pairingLabel(user)}
              />
            ))}
          </div>
        </section>
      )}

      {platform.id === 'telegram' && (
        <section>
          <SectionTitle>{m.telegramQr.quickSetup}</SectionTitle>
          <div className="mt-3">
            <TelegramQrSetup onApplied={onTelegramApplied} platform={platform} scopeProfile={scopeProfile} />
          </div>
        </section>
      )}

      {platform.id === 'weixin' && (
        <section>
          <SectionTitle>{m.weixinQr.quickSetup}</SectionTitle>
          <div className="mt-3">
            <WeixinQrSetup onApplied={onWeixinApplied} platform={platform} scopeProfile={scopeProfile} />
          </div>
        </section>
      )}

      {platform.id === 'qqbot' && (
        <section>
          <SectionTitle>{m.qqQr.quickSetup}</SectionTitle>
          <div className="mt-3">
            <QqQrSetup onApplied={onQqApplied} platform={platform} scopeProfile={scopeProfile} />
          </div>
        </section>
      )}

      {platform.id === 'feishu' && (
        <section>
          <SectionTitle>{m.feishuQr.quickSetup}</SectionTitle>
          <div className="mt-3">
            <FeishuQrSetup onApplied={onFeishuApplied} platform={platform} scopeProfile={scopeProfile} />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>{m.getCredentials}</SectionTitle>
        <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {introCopy(platform, m)}
        </p>
        {platform.docs_url && (
          // qiji 0.20.5b: 设置指南跳转暂时隐藏（指向上游 hermes 文档站）。
          // 后续换成自有帮助站后恢复接线：把 BRAND_DOCS_BASE 指过去即可。
          false ? (
            <div className="mt-3">
              <Button asChild size="sm" variant="textStrong">
                <a
                  href={platform.docs_url}
                  onClick={event => {
                    // Route through the validated external opener instead of
                    // letting Electron resolve the anchor. A packaged build's
                    // empty/relative href resolves to the app's own
                    // index.html file path, which shell.openPath then fails to
                    // open ("file not found"). Plugin platforms (Teams, etc.)
                    // ship no docs_url, so this guard + handler keeps the
                    // button from ever pointing at a local bundle path.
                    event.preventDefault()
                    openExternalLink(platform.docs_url)
                  }}
                  rel="noreferrer"
                  target="_blank"
                >
                  {m.openSetupGuide}
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          ) : null
        )}
      </section>

      <section>
        <SectionTitle>{m.required}</SectionTitle>
        <div className="mt-3 grid gap-1">
          {requiredFields.length > 0 ? (
            requiredFields.map(field => (
              <MessagingField
                edits={edits}
                field={field}
                key={field.key}
                onClear={onClear}
                onEdit={onEdit}
                saving={saving}
              />
            ))
          ) : (
            <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
              {m.noTokenNeeded}
            </p>
          )}
        </div>
      </section>

      {optionalFields.length > 0 && (
        <section>
          <SectionTitle>{m.recommended}</SectionTitle>
          <div className="mt-3 grid gap-1">
            {optionalFields.map(field => (
              <MessagingField
                edits={edits}
                field={field}
                key={field.key}
                onClear={onClear}
                onEdit={onEdit}
                saving={saving}
              />
            ))}
          </div>
        </section>
      )}

      {hiddenCount > 0 && (
        <section>
          <button
            className="flex w-full items-center justify-between gap-2 py-0.5 text-left text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowAdvanced(value => !value)}
            type="button"
          >
            <span>{m.advanced(hiddenCount)}</span>
            <DisclosureCaret open={showAdvanced} size="0.875rem" />
          </button>
          {showAdvanced && (
            <div className="mt-3 grid gap-1">
              {advancedFields.map(field => (
                <MessagingField
                  edits={edits}
                  field={field}
                  key={field.key}
                  onClear={onClear}
                  onEdit={onEdit}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

function PlatformActionBar({
  hasEdits,
  onSave,
  onToggle,
  platform,
  saving
}: {
  hasEdits: boolean
  onSave: () => void
  onToggle: (enabled: boolean) => void
  platform: MessagingPlatformInfo
  saving: string | null
}) {
  const { t } = useI18n()
  const m = t.messaging
  const isSavingEnv = saving === `env:${platform.id}`

  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Switch
          aria-label={platform.enabled ? m.disableAria(platform.name) : m.enableAria(platform.name)}
          checked={platform.enabled}
          disabled={saving === `enabled:${platform.id}`}
          onCheckedChange={onToggle}
          size="xs"
        />
        {platform.enabled ? m.enabled : m.disabled}
      </label>

      <div className="ml-auto flex items-center gap-2">
        {hasEdits && <span className="text-xs text-muted-foreground">{m.unsavedChanges}</span>}
        <Button disabled={!hasEdits || isSavingEnv} onClick={onSave} size="sm">
          <Save />
          {isSavingEnv ? m.saving : m.saveChanges}
        </Button>
      </div>
    </>
  )
}

const PLATFORM_INTRO: Record<string, string> = {
  telegram:
    'In Telegram, talk to @BotFather, run /newbot, and copy the token it gives you. Then grab your numeric user ID from @userinfobot.',
  discord:
    'Open the Discord Developer Portal, create an application, add a Bot, then copy its token. Invite the bot to your server with the right scopes.',
  slack:
    'Create a Slack app, enable Socket Mode, install it to your workspace, then copy the bot token and app-level token.',
  mattermost:
    'On your Mattermost server, create a bot account or personal access token, then paste the server URL and token here.',
  matrix: 'Sign in to your homeserver with the bot account, then copy the access token, user ID, and homeserver URL.',
  signal:
    'Run a signal-cli REST bridge somewhere reachable, then point Hermes at the URL and the registered phone number.',
  whatsapp:
    'Start the WhatsApp bridge that ships with Hermes, scan the QR code on first run, then enable the platform.',
  bluebubbles:
    'Run BlueBubbles Server on a Mac with iMessage, expose its API, then point Hermes at the URL with the server password.',
  homeassistant:
    'In Home Assistant, open your profile and create a long-lived access token. Paste it here along with your HA URL.',
  email:
    'Use a dedicated mailbox. For Gmail/Workspace, create an app password and use imap.gmail.com / smtp.gmail.com.',
  sms: 'Get your Twilio Account SID and Auth Token from the Twilio console, plus a phone number that can send SMS.',
  dingtalk:
    'Two steps: ① create an enterprise app at open-dev.dingtalk.com (no public callback needed) ② copy the Client ID (App key) and Client Secret into the fields below.',
  feishu:
    '三步接入：① 在 open.feishu.cn 创建企业自建应用 ② 添加「机器人」能力，事件订阅选择「使用长连接接收事件」 ③ 把凭证与基础信息页的 App ID 和 App Secret 粘贴到下方。无需公网地址。',
  wecom:
    'Two steps: ① in a WeCom group tap … → Group robot → Add ② paste the key= part of the webhook URL below. Push-only; use WeCom (app) for two-way chat.',
  wecom_callback:
    'Set up a WeCom self-built app, expose its callback URL, and provide the corp ID, secret, agent ID, and AES key.',
  weixin:
    'Prefer Quick setup above: scan the QR with WeChat and confirm on your phone — no manual credentials. Connects through Tencent\'s iLink Bot API.',
  qqbot:
    'Prefer Quick setup above (scan to create the bot). Manual: register an app on the QQ Open Platform (q.qq.com) and copy the App ID and Client Secret.',
  api_server:
    'Expose Hermes as an OpenAI-compatible API. Set an auth key, then point Open WebUI / LobeChat / etc. at the host:port.',
  webhook:
    'Run an HTTP server that other tools (GitHub, GitLab, custom apps) can POST to. Use the secret to verify signatures.'
}

const introCopy = (platform: MessagingPlatformInfo, m: Translations['messaging']) =>
  m.platformIntro[platform.id] || PLATFORM_INTRO[platform.id] || platform.description

function MessagingField({
  edits,
  field,
  onClear,
  onEdit,
  saving
}: {
  edits: Record<string, string>
  field: MessagingEnvVarInfo
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  saving: string | null
}) {
  const { t } = useI18n()
  const m = t.messaging
  const copy = fieldCopy(field, m)
  const fieldId = `messaging-field-${field.key}`

  return (
    <ListRow
      action={
        <div className="flex w-full items-center gap-2 @2xl:w-88">
          <Input
            className={CREDENTIAL_CONTROL_CLASS}
            id={fieldId}
            onChange={event => onEdit(field.key, event.target.value)}
            placeholder={field.is_set ? credentialPreview(field.redacted_value) || m.replaceValue : copy.placeholder}
            type={field.is_password ? 'password' : 'text'}
            value={edits[field.key] || ''}
          />
          {field.url && (
            <Tip label={m.openDocs}>
              <Button asChild className="size-8 shrink-0" variant="ghost">
                <a href={field.url} rel="noreferrer" target="_blank">
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </Tip>
          )}
          {field.is_set && (
            <Tip label={m.clearField(field.key)}>
              <Button
                className="size-8 shrink-0"
                disabled={saving === `clear:${field.key}`}
                onClick={() => onClear(field.key)}
                variant="ghost"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Tip>
          )}
        </div>
      }
      description={copy.help}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={fieldId}>{copy.label}</label>
          {field.is_set && <span className="text-[0.66rem] font-medium text-primary">{m.saved}</span>}
        </span>
      }
    />
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h4>
}

function PlatformHint({ platform }: { platform: MessagingPlatformInfo }) {
  const { t } = useI18n()

  // A served secondary's api_server/webhook live on the shared gateway listener under
  // /p/<profile>/: the state pill says connected, this line says where to point the client.
  if (platform.ingress_url) {
    return (
      <p className="mt-2 text-xs leading-5 text-muted-foreground break-all">
        {t.messaging.sharedListenerUrl}{' '}
        <code className="font-mono text-foreground" data-slot="ingress-url">
          {platform.ingress_url}
        </code>
      </p>
    )
  }

  if (!platform.enabled || platform.state === 'connected') {
    return null
  }

  const hint =
    platform.state === 'pending_restart'
      ? t.messaging.hintPendingRestart
      : platform.gateway_running
        ? null
        : t.messaging.hintGatewayStopped

  return hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null
}

function StatePill({ children, tone }: { children: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.66rem] font-medium',
        PILL_TONE[tone]
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  )
}

function SetupPill({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.66rem] font-medium',
        PILL_TONE[active ? 'good' : 'muted']
      )}
    >
      {children}
    </span>
  )
}
