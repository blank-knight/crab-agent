import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { getProfiles, listAllProfileSessions, type SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { isDefaultProfileKey } from '@/lib/account-profile'
import { $sessionsLimit, $sidebarWorkspaceNodeOpen, setWorkspaceNodeOpen } from '@/store/layout'
import { profileLabel } from '@/store/profile'
import { $accountLockExceptions } from '@/store/profile'

import { SidebarSessionRow } from './session-row'

/**
 * crab 0.20.5o: 侧栏「专家会话」折叠分组（用户拍板的设计）。
 *
 * 普通会话列表原样；底部多一个"▸ 专家会话"分组头（可折叠、默认收起、
 * localStorage 记住状态）。组内按专家分节，各节显示该专家档案的历史
 * 会话（本机 OPC 专家 = 非 default 的独立 profile）。
 *
 * 数据（侧栏惯例：plain state + effect，不用 react-query——sidebar 组件
 * 树不承诺 QueryClientProvider，chat-sidebar 既有测试按此假设搭环境）：
 * 展开分组时拉一次 /api/profiles 取专家中文名（bot_title，profileLabel
 * 已做兜底，0.20.5o 同批）；每次展开一个专家节时按需拉该档案一页会话
 * （与侧栏 recents 同 limit）。锁收敛不在这里做——listAllProfileSessions
 * 内部统一走 accountLockedScopeFor（豁免集同源），调用方直传档案即可。
 * 行带 profile/connection 戳，resume 走 openStoredSession 的 owner-aware
 * 路径（点开即钉住行的档案，见 wiring 的 openStoredSession）。
 *
 * 折叠态读法（nanostores 订阅纪律）：per-expert 折叠存共享的
 * $sidebarWorkspaceNodeOpen（key expert-sessions:<profile>）。必须
 * useStore 订阅整张 map 再按 nodeId 取值——直调 workspaceNodeOpen()
 * 只是普通函数读，折叠状态变更不会触发本组件重渲染（date 分组同款
 * isListGroupOpen 模式，见 sessions-section）。
 */

// One page of sessions per expert, revealed on first expand. Same budget the
// flat recents list uses, so a busy expert mirrors what its own scope shows.
function expertSessionNodeId(profile: string): string {
  return `expert-sessions:${profile}`
}

function expertProfileKey(profile: string): string {
  return profile.trim().toLowerCase()
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
  const lockExceptions = useStore($accountLockExceptions)

  // Local expert profiles = the account-lock exception set (non-default,
  // on-machine profiles; refreshed by refreshAccountLockExceptions on boot
  // and session refresh). Empty (no lock / no experts) → section hidden.
  const experts = useMemo(
    () => [...lockExceptions].map(expertProfileKey).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [lockExceptions]
  )

  // bot_title (Chinese display name) comes from /api/profiles — the roster
  // does not carry it. Fetched when the group opens; kept when collapsed.
  const [labels, setLabels] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!open || experts.length === 0) {return}

    let cancelled = false

    getProfiles()
      .then(res => {
        if (cancelled) {return}

        const map = new Map<string, string>()

        for (const p of res?.profiles || []) {
          const key = expertProfileKey(p?.name || '')

          if (key && !isDefaultProfileKey(key)) {
            map.set(key, profileLabel(p))
          }
        }

        setLabels(map)
      })
      .catch(() => {
        // Labels stay keyed by profile id — display degrades, not breaks.
      })

    return () => {
      cancelled = true
    }
  }, [open, experts.length])

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
          {experts.map(profile => (
            <ExpertProfileSessions
              activeSessionId={activeSessionId}
              key={profile}
              label={labels.get(profile) || profile}
              onResumeSession={onResumeSession}
              profile={profile}
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
