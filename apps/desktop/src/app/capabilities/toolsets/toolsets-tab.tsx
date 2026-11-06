import { compactNumber } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useCallback, useMemo, useState } from 'react'

import { CountSkeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { type ProfileScope, setToolsetEnabled } from '@/hermes'
import { useI18n } from '@/i18n'
import { isDesktopToolsetVisible } from '@/lib/desktop-toolsets'
import { Codecs, persistentAtom } from '@/lib/persisted'
import { queryClient } from '@/lib/query-client'
import { invalidateSlashCompletions } from '@/lib/slash-completion-cache'
import { cn } from '@/lib/utils'
import { $advancedFeatures } from '@/store/advanced-features'
import { notify, notifyError } from '@/store/notifications'
import type { ToolsetInfo } from '@/types/hermes'

import { asText, toolsetDisplayLabel } from '../../settings/helpers'
import { CapabilityEmpty } from '../primitives'
import { TOOLSET_DESC_ZH } from '../toolsets-desc-zh'

import { useToolCalls } from './tool-calls'
import { ToolsetDetail } from './toolset-detail'
import { filteredToolsets, toolsetCalls, TOOLSETS_QUERY_KEY, toolsetsQueryKey } from './toolsets-data'

// Sort direction for the Tools list — persisted so the tab remembers
// most/least-used across navigations and restarts.
const $toolsetsSortDesc = persistentAtom('hermes.desktop.capabilities.toolsetsSortDesc', true, Codecs.bool)

interface ToolsetsTabProps {
  /** The scope's toolset list, straight from the shell's query. */
  toolsets: ToolsetInfo[]
  /** The (connection, profile) scope every read and write routes to. */
  profile: ProfileScope
  query: string
}

/** qiji 0.20.5: 卡片首字圆片的稳定色相 —— 与 OPC 页/技能 rail 同一视觉语言。 */
function toolsetHue(name: string): number {
  let h = 0

  for (const ch of name) {
    h = (h * 31 + ch.charCodeAt(0)) % 360
  }

  return h
}

/** qiji 0.20.5: 工具集卡片 —— OPC 启动台同款语言（圆片 + 圆角卡 + 软阴影 + 悬浮上浮）。 */
function ToolsetCard({
  active,
  busy,
  calls,
  onConfigure,
  onToggle,
  toolset
}: {
  active: boolean
  busy: boolean
  calls: number | null
  onConfigure: () => void
  onToggle: (enabled: boolean) => void
  toolset: ToolsetInfo
}) {
  const label = toolsetDisplayLabel(toolset)
  const desc = TOOLSET_DESC_ZH[toolset.name] ?? asText(toolset.description)
  const tools = toolset ? (toolset.tools?.length ?? 0) : 0

  return (
    <div
      className={cn(
        'group flex flex-col rounded-2xl border p-4 transition-all duration-200',
        'shadow-[0_2px_12px_rgba(45,36,32,0.05)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(45,36,32,0.10)]',
        active
          ? 'border-(--ui-primary)/40 bg-(--ui-card)'
          : 'border-(--ui-border)/70 bg-(--ui-card) hover:border-(--ui-primary)/25',
        !toolset.enabled && 'opacity-75'
      )}
      data-tour={`toolset-card-${toolset.name}`}
    >
      <div className="flex items-start gap-3">
        <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={onConfigure} type="button">
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[0.8rem] font-bold text-white"
              style={{ background: `hsl(${toolsetHue(toolset.name)} 45% 55%)` }}
            >
              {label.slice(0, 1).toUpperCase()}
            </span>
            <p className="truncate text-[0.92rem] font-bold text-(--ui-text-primary)">{label}</p>
          </div>
          {desc && (
            <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-(--ui-text-tertiary)">{desc}</p>
          )}
        </button>
        <Switch aria-label={label} checked={toolset.enabled} disabled={busy} onCheckedChange={onToggle} size="xs" />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        {calls === null ? (
          <CountSkeleton />
        ) : calls > 0 ? (
          <span className="rounded-full bg-(--ui-primary)/12 px-2 py-0.5 text-[0.66rem] font-semibold text-(--ui-primary)">
            已用 {compactNumber(calls)} 次
          </span>
        ) : null}
        <span className="rounded-full bg-(--ui-muted) px-2 py-0.5 text-[0.66rem] font-medium text-(--ui-text-tertiary)">
          {tools > 0 ? `${tools} 个工具` : '工具集'}
        </span>
        {!toolset.configured && (
          <span className="rounded-full bg-(--ui-muted) px-2 py-0.5 text-[0.66rem] font-medium text-(--ui-text-tertiary)">
            需配置
          </span>
        )}
      </div>
    </div>
  )
}

/** THE Tools tab — qiji 0.20.5 视觉 v3: OPC 同款卡片墙 + 右侧详情抽屉。 */
export function ToolsetsTab({ profile, query, toolsets }: ToolsetsTabProps) {
  const advancedFeatures = useStore($advancedFeatures)
  const { t } = useI18n()
  const toolsetsSortDesc = useStore($toolsetsSortDesc)
  const toolCalls = useToolCalls(profile)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedToolset, setSelectedToolset] = useState<string | null>(null)

  // Optimistic write-through against the scoped Tools key: toggles repaint
  // instantly; the next background refetch reconciles.
  const setToolsets = useCallback(
    (fn: (cur: ToolsetInfo[] | undefined) => ToolsetInfo[] | undefined) =>
      queryClient.setQueryData<ToolsetInfo[]>(toolsetsQueryKey(profile), prev => fn(prev) ?? prev),
    [profile]
  )

  const refreshToolsets = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: TOOLSETS_QUERY_KEY })
  }, [])

  const visibleToolsets = useMemo(
    () => filteredToolsets(toolsets, query, toolCalls ?? {}, toolsetsSortDesc, advancedFeatures),
    [advancedFeatures, query, toolCalls, toolsets, toolsetsSortDesc]
  )

  // Bulk actions and the master-switch state target the WHOLE tab, never the
  // search-filtered view — a tab-wide control that silently scoped to the
  // current query would be a lie.
  const bulkToolsets = useMemo(
    () => toolsets.filter(ts => isDesktopToolsetVisible(ts.name, advancedFeatures)),
    [advancedFeatures, toolsets]
  )

  const activeToolset = useMemo(
    () => visibleToolsets.find(ts => ts.name === selectedToolset) ?? null,
    [selectedToolset, visibleToolsets]
  )

  // Single toggles are optimistic and silent on success (the row repaints
  // immediately — a toast per flip would spam rapid customization). Errors
  // revert and notify.
  async function handleToggleToolset(toolset: ToolsetInfo, enabled: boolean) {
    setToolsets(
      current =>
        current?.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row)) ?? current
    )

    try {
      await setToolsetEnabled(toolset.name, enabled, profile)
    } catch (err) {
      setToolsets(
        current =>
          current?.map(row => (row.name === toolset.name ? { ...row, enabled: !enabled, available: !enabled } : row)) ??
          current
      )
      notifyError(err, t.skills.failedToUpdate(toolsetDisplayLabel(toolset)))
    }
  }

  // Sequential on purpose: each toggle is a config read-modify-write on the
  // backend; parallel calls would race the disabled-list save.
  async function bulkApply(targets: ToolsetInfo[], enabled: boolean) {
    if (bulkBusy || targets.length === 0) {
      return
    }

    setBulkBusy(true)

    let done = 0

    try {
      for (const row of targets) {
        await setToolsetEnabled(row.name, enabled, profile)
        setToolsets(cur => cur?.map(r => (r.name === row.name ? { ...r, enabled, available: enabled } : r)) ?? cur)
        done += 1
      }

      notify({ kind: 'success', title: t.skills.bulkUpdated(done), message: '' })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(t.skills.tabToolsets))
    } finally {
      invalidateSlashCompletions()
      setBulkBusy(false)
    }
  }

  const allOn = bulkToolsets.length > 0 && bulkToolsets.every(ts => ts.enabled)

  if (visibleToolsets.length === 0) {
    return <CapabilityEmpty noun="tools" query={query} />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      {/* 卡片墙 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* 操作条：排序 + 全开/全关（原 ListStrip 的功能，卡片化后仍可达） */}
        <div className="flex items-center gap-2 px-5 pb-2 pt-3">
          <span className="text-[0.75rem] font-medium text-(--ui-text-tertiary)">
            {visibleToolsets.length} 个工具集
          </span>
          <button
            className="rounded-full px-2.5 py-1 text-[0.72rem] font-semibold text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-muted) hover:text-foreground"
            onClick={() => $toolsetsSortDesc.set(!$toolsetsSortDesc.get())}
            type="button"
          >
            {toolsetsSortDesc ? '按最常用 ↓' : '按最少用 ↑'}
          </button>
          <span className="flex-1" />
          <button
            className={cn(
              'rounded-full px-2.5 py-1 text-[0.72rem] font-semibold transition-colors',
              bulkBusy ? 'opacity-50' : 'text-(--ui-primary) hover:bg-(--ui-primary)/10'
            )}
            disabled={bulkBusy}
            onClick={() =>
              void bulkApply(
                bulkToolsets.filter(row => row.enabled !== !allOn),
                !allOn
              )
            }
            type="button"
          >
            {allOn ? '全部停用' : '全部启用'}
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2.5 px-5 pb-5">
          {visibleToolsets.map(toolset => {
            const calls = toolCalls ? toolsetCalls(toolset, toolCalls) : null

            return (
              <ToolsetCard
                active={selectedToolset === toolset.name}
                busy={bulkBusy}
                calls={calls}
                key={toolset.name}
                onConfigure={() => setSelectedToolset(toolset.name)}
                onToggle={checked => void handleToggleToolset(toolset, checked)}
                toolset={toolset}
              />
            )
          })}
        </div>
      </div>

      {/* 详情抽屉：选中的工具集在右侧（悬浮卡片式） */}
      {activeToolset && (
        <aside className="hidden w-[24rem] shrink-0 flex-col overflow-y-auto border-l border-(--ui-border)/50 bg-(--ui-card)/60 px-4 pb-4 pt-3 lg:flex">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.95rem] font-bold tracking-tight text-(--ui-text-primary)">
              {toolsetDisplayLabel(activeToolset)}
            </h3>
            <button
              className="rounded-full p-1 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-muted) hover:text-foreground"
              onClick={() => setSelectedToolset(null)}
              type="button"
            >
              <span className="text-[0.8rem]">✕</span>
            </button>
          </div>
          <ToolsetDetail
            onConfiguredChange={refreshToolsets}
            profile={profile}
            toolCalls={toolCalls ?? {}}
            toolset={activeToolset}
          />
        </aside>
      )}
    </div>
  )
}
