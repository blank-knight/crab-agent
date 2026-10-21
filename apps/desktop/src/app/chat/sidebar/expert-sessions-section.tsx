import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { listAllProfileSessions, type SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { $fleetRoster, refreshFleetRoster } from '@/store/fleet-roster'
import { $sessionsLimit, $sidebarWorkspaceNodeOpen, setWorkspaceNodeOpen } from '@/store/layout'

import { SidebarSessionRow } from './session-row'

/**
 * crab 0.20.5o-r2: 侧栏「专家会话」折叠分组。
 *
 * 普通会话列表原样；底部多一个"▸ 专家会话"分组头（可折叠、默认收起、
 * localStorage 记住状态）。组内按专家分节，各节显示该专家档案的历史会话。
 *
 * 数据源（r2 修正，10-21 装机实锤：新建算命专家对话后分组里没有他——
 * 旧实现用账号锁豁免集当专家集合，而豁免集只在启动/登录刷一次）：
 * 改用 $fleetRoster（Electron 枚举的本机连接 profile 全集），挂载时
 * force 刷新一次——新建专家立即可见；中文名同行带（profileMetadata:
 * display_name → title → ui_meta['hermes-bots'].title），不再单独拉
 * /api/profiles。与 OPC 专家页同一身份体系（profile name），概念不再
 * 与"配置档案"分叉：本机非 default 的 profile 就是 OPC 专家，一对一。
 *
 * 会话拉取走 listAllProfileSessions（锁收敛在它内部统一做，0.20.5o
 * 已接豁免），行带 profile/connection 戳，resume 走 owner-aware
 * openStoredSession（点开即钉住行的档案）。
 *
 * 折叠态读法（nanostores 订阅纪律）：per-expert 折叠存共享的
 * $sidebarWorkspaceNodeOpen（key expert-sessions:<profile>）。必须
 * useStore 订阅整张 map 再按 nodeId 取值——直调 workspaceNodeOpen()
 * 只是普通函数读，折叠状态变更不会触发本组件重渲染。
 */

// One page of sessions per expert, revealed on first expand. Same budget the
// flat recents list uses, so a busy expert mirrors what its own scope shows.
function expertSessionNodeId(profile: string): string {
  return `expert-sessions:${profile}`
}

function expertProfileKey(profile: string): string {
  return profile.trim().toLowerCase()
}

interface LocalExpert {
  key: string
  label: string
}

/** fleetRoster 行 → 本机专家（local 连接、非 default）。名字链与 OPC 专家卡一致。 */
function localExpertsFromRoster(roster: { agents?: Array<{ connectionKind?: string; profile?: string; profileMetadata?: { display_name?: string; title?: string; ui_meta?: Record<string, unknown> } }> } | null): LocalExpert[] {
  const out = new Map<string, LocalExpert>()

  for (const agent of roster?.agents || []) {
    if (agent?.connectionKind !== 'local') {continue}

    const key = expertProfileKey(agent.profile || '')

    if (!key || key === 'default') {continue}

    if (out.has(key)) {continue}

    const meta = agent.profileMetadata
    const botMeta = meta?.ui_meta?.['hermes-bots'] as { title?: string } | undefined

    const label =
      (meta?.display_name || '').trim() ||
      (meta?.title || '').trim() ||
      (botMeta?.title || '').trim() ||
      key

    out.set(key, { key, label })
  }

  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label))
}

interface ExpertSessionsSectionProps {
  activeSessionId: null | string
  /** Owner-aware resume door (openStoredSession). */
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onToggle: () => void
  open: boolean
}

export function SidebarExpertSessionsSection({
  activeSessionId,
  onResumeSession,
  onToggle,
  open
}: ExpertSessionsSectionProps) {
  const { t } = useI18n()
  const e = t.sidebar.expertSessions
  const roster = useStore($fleetRoster)

  // The roster store is fetched on demand (mount/focus), never on a timer —
  // a freshly created expert would sit invisible until the next window focus.
  // One forced refresh per mount keeps the group current without polling.
  useEffect(() => {
    void refreshFleetRoster({ force: true })
  }, [])

  const experts = useMemo(() => localExpertsFromRoster(roster), [roster])

  if (experts.length === 0) {
    return null
  }

  return (
    <SidebarGroup className="shrink-0 p-0 pb-1">
      <div className="group/section flex shrink-0 items-center justify-between pb-1 pt-1.5">
        <button
          className="group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          <SidebarPanelLabel>{e.label}</SidebarPanelLabel>
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      </div>
      {open && (
        <SidebarGroupContent className="flex flex-col gap-px pb-1.75">
          {experts.map(expert => (
            <ExpertProfileSessions
              activeSessionId={activeSessionId}
              key={expert.key}
              label={expert.label}
              onResumeSession={onResumeSession}
              profile={expert.key}
            />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

interface ExpertProfileSessionsProps {
  activeSessionId: null | string
  label: string
  profile: string
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
}

function ExpertProfileSessions({ activeSessionId, label, profile, onResumeSession }: ExpertProfileSessionsProps) {
  const { t } = useI18n()
  const e = t.sidebar.expertSessions
  // Section default: collapsed (user-approved design). Persisted on the
  // shared workspace-node map, absolute value (see layout.ts rationale).
  // Subscribed read (useStore) — see the subscription note up top.
  const nodeId = expertSessionNodeId(profile)
  const nodeOpen = useStore($sidebarWorkspaceNodeOpen)
  const open = nodeOpen[nodeId] ?? false

  // null = not loaded yet (loading); [] = loaded, empty.
  const [sessions, setSessions] = useState<null | SessionInfo[]>(null)

  useEffect(() => {
    if (!open) {return}

    let cancelled = false

    setSessions(null)

    listAllProfileSessions($sessionsLimit.get(), 1, 'exclude', 'recent', profile)
      .then(res => {
        if (!cancelled) {setSessions(res?.sessions ?? [])}
      })
      .catch(() => {
        if (!cancelled) {setSessions([])}
      })

    return () => {
      cancelled = true
    }
  }, [open, profile])

  return (
    <div>
      <button
        aria-expanded={open}
        aria-label={e.toggleProfile(label, !open)}
        className="flex w-full min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left leading-none hover:bg-(--chrome-action-hover)"
        onClick={() => setWorkspaceNodeOpen(nodeId, !open)}
        type="button"
      >
        <DisclosureCaret className="shrink-0 text-(--ui-text-tertiary)" open={open} />
        <span className="truncate text-[0.75rem] font-medium text-(--ui-text-secondary)">{label}</span>
        {sessions !== null && sessions.length > 0 && (
          <span className="ml-auto shrink-0 text-[0.6875rem] text-(--ui-text-tertiary) tabular-nums">
            {sessions.length}
          </span>
        )}
      </button>
      {open && (
        <div className="ml-[1.375rem] flex flex-col gap-px">
          {sessions === null ? (
            <div className="py-1 pl-1 text-[0.6875rem] text-(--ui-text-tertiary)">{e.loading}</div>
          ) : sessions.length === 0 ? (
            <div className="py-1 pl-1 text-[0.6875rem] text-(--ui-text-tertiary)">{e.noSessions}</div>
          ) : (
            sessions.map(session => (
              <SidebarSessionRow
                isPinned={false}
                isSelected={session.id === activeSessionId}
                key={`${session.profile ?? ''}::${session.id}`}
                onArchive={() => undefined}
                onDelete={() => undefined}
                onPin={() => undefined}
                onResume={() => onResumeSession(session.id, session)}
                onToggleUnread={() => undefined}
                session={session}
                unread={session.unread === true}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
