import { useStore } from '@nanostores/react'
import { useEffect, useMemo } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { useI18n } from '@/i18n'
import { openBotCanonicalChat } from '@/plugins/hermes-bots/canonical-chat'
import { $fleetRoster, refreshFleetRoster } from '@/store/fleet-roster'
import { notifyError } from '@/store/notifications'

/**
 * 侧栏「专家会话」分组 —— crab 0.20.5o-r2（10-21 产品定稿）：一专家一线程。
 *
 * 模型对齐（用户拍板）：OPC 专家页承诺的就是"永续对话"——每个专家一条
 * 常驻 canonical 会话（openBotCanonicalChat，hermes-bots 现成机制），点
 * 名字永远进他那条线，今天接着昨天聊。首版按通用档案模型列 N 条历史，
 * 与 OPC 承诺互相矛盾（"专家会话下挂一堆对话"），且暴露了"档案"概念。
 *
 * 数据源：$fleetRoster（本机连接、非 default 档案 = 专家，与 OPC 专家页
 * 同一身份体系）。点击 = openBotCanonicalChat(profileName)：已有常驻线则
 * resume，没有则建（kickoffOnCreate 与 OPC 专家卡一致）。
 *
 * 挂载时强刷一次 roster：新删专家立即可见（roster 平时只按需拉取）。
 */
function expertProfileKey(profile: string): string {
  return profile.trim().toLowerCase()
}

interface LocalExpert {
  key: string
  label: string
}

/** fleetRoster 行 → 本机专家（local 连接、非 default）。名字链与 OPC 专家卡一致。 */
function localExpertsFromRoster(roster: { agents?: Array<{ connectionKind?: string; profile?: string; profileMetadata?: { display_name?: string; title?: string; bot_title?: string; ui_meta?: Record<string, unknown> } }> } | null): LocalExpert[] {
  const out = new Map<string, LocalExpert>()

  for (const agent of roster?.agents || []) {
    if (agent?.connectionKind !== 'local') {continue}

    const key = expertProfileKey(agent.profile || '')

    // crab 0.20.5s: 账号档不是专家——账号隔离档(acc_*)与本机专家共用"local 非
    // default"特征,不排除会把登录账号档列进专家分组(装机实锤 acc_13800002026
    // 混入)。以 bot 身份判定:专家档必有 bot_title(/api/profiles 只回它),acc 档
    // 和 default 无 bot_title(roster 实测 meta:[])。无 bot_title 即不是专家。
    const meta = agent.profileMetadata
    const botMeta = meta?.ui_meta?.['hermes-bots'] as { title?: string } | undefined

    if (!key || key === 'default') {continue}

    if (!(meta?.bot_title || botMeta?.title)) {continue}

    if (out.has(key)) {continue}

    // crab 0.20.5s: bot_title 补进兜底链——专家档通常只有 bot_title(无
    // display_name),缺这档 roster 兜底裸 ID(侧栏显示 pmvagpyyc)。
    const label =
      (meta?.display_name || '').trim() ||
      (meta?.title || '').trim() ||
      (botMeta?.title || '').trim() ||
      (meta?.bot_title || '').trim() ||
      key

    out.set(key, { key, label })
  }

  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label))
}

interface ExpertSessionsSectionProps {
  onToggle: () => void
  open: boolean
}

export function SidebarExpertSessionsSection({ onToggle, open }: ExpertSessionsSectionProps) {
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
            <ExpertRow key={expert.key} label={expert.label} profile={expert.key} />
          ))}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}

interface ExpertRowProps {
  label: string
  profile: string
}

/** 一专家一行：点击 = 进他的常驻对话（canonical chat）。 */
function ExpertRow({ label, profile }: ExpertRowProps) {
  const openCanonical = () => {
    // 与 OPC 专家卡同链路：已有常驻线 resume，没有则建。openBotCanonicalChat
    // 接受 RosterRow | string（档案名）；kickoffOnCreate 让新建线立即就绪。
    openBotCanonicalChat(profile, { kickoffOnCreate: true }).catch(err => {
      notifyError(err, `无法打开 ${label} 的对话`)
    })
  }

  return (
    <button
      className="flex w-full min-w-0 items-center gap-1.5 rounded-sm px-1 py-1 text-left leading-none hover:bg-(--chrome-action-hover)"
      onClick={openCanonical}
      type="button"
    >
      <span className="truncate text-[0.75rem] font-medium text-(--ui-text-secondary)">{label}</span>
    </button>
  )
}
