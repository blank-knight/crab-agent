/**
 * qiji 0.20.5: OPC 智能体 — 专家 tab 数据与动作。
 *
 * OPC 页分「技能 | 专家」两段：技能段是自营卡片墙（OPC_AGENTS，轻量、
 * 预填 /技能名）；专家段透传 hermes-bots 的 roster（隔离 profile、
 * 永续对话、独立记忆/例程）。两段机制独立，用户自选轻重——
 * 快活用技能，长期运营用专家。
 *
 * 桥接原则（0.20.5a 修订）：hermes-bots 数据层（data.ts/canonical-chat.ts）
 * 直接静态 import——plugin 发现本就是 eager glob（contrib/plugins.ts），
 * 「动态 import 对齐懒加载」的旧设计在加密链（blob: 协议）下触发
 * React #310（0.20.5 装机实锤，f_l 组件 hooks 计数漂移），已废弃。
 */

import { useEffect, useState } from 'react'

import { setWorkspaceOwnerLabel } from '@/components/pane-shell/workspace-scope'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { openBotCanonicalChat } from '../../plugins/hermes-bots/canonical-chat'
import { useRoster } from '../../plugins/hermes-bots/data'
import { displayName } from '../../plugins/hermes-bots/labels'
import { botWorkspaceOwnerKey } from '../../plugins/hermes-bots/routing'
import type { RosterRow } from '../../plugins/hermes-bots/types'
import { CreateExpertDialog } from './create-expert'

export interface OpcExpertRow {
  /** roster 身份名（profile name）——openBotCanonicalChat 认它 */
  name: string
  /** 显示名（display_name 优先） */
  label: string
  /** 一句话人设（title/description） */
  desc: string
  /** 头像占色（名字哈希取色，与 OPC_AGENTS 卡片同视觉语法） */
  hue: number
  /** 最近活跃（worker_session.last_active，ms epoch；undefined=未知） */
  lastActive?: number
}

/** 名字→稳定色相 */
export function expertHue(name: string): number {
  let h = 0

  for (const ch of name) {
    h = (h * 31 + ch.codePointAt(0)!) % 360
  }

  return h
}

/** RosterRow 的松类型投影（plugin 边界，不引 plugin 内部类型） */
type RosterSnapshotLike = { profiles?: Array<Record<string, unknown>> } | null | undefined

/** 0.20.5a: 真 useRoster 返回强类型 RosterSnapshot——经此收窄到松类型再投影 */
function asSnapshotLike(data: unknown): RosterSnapshotLike {
  if (data && typeof data === 'object' && 'profiles' in data) {
    return data as RosterSnapshotLike
  }

  return null
}

function toRow(row: Record<string, unknown>): OpcExpertRow | null {
  if (typeof row.name !== 'string' || row.name.length === 0) {
    return null
  }

  const name = row.name
  const worker = row.worker_session as { last_active?: unknown } | null | undefined

  return {
    name,
    label: typeof row.display_name === 'string' && row.display_name ? row.display_name : name,
    desc:
      typeof row.title === 'string' && row.title
        ? row.title
        : typeof row.description === 'string'
          ? row.description
          : '',
    hue: expertHue(name),
    lastActive:
      worker && typeof worker.last_active === 'number' ? (worker.last_active as number) : undefined
  }
}

export function toOpcExpertRows(snapshot: RosterSnapshotLike): OpcExpertRow[] {
  const rows = Array.isArray(snapshot?.profiles) ? (snapshot!.profiles as Array<Record<string, unknown>>) : []

  return rows.map(toRow).filter((r): r is OpcExpertRow => r !== null)
}

/** qiji 0.20.5a: 静态 import——动态 import 在加密链(blob:)下不可靠
 *  （React #310 装机实锤），且 plugin 本就是 eager glob 加载，
 *  懒加载语义从未成立。数据层模块 import 无副作用。 */
async function openOpcExpert(name: string): Promise<boolean> {
  try {
    return (await openBotCanonicalChat(name)) != null
  } catch {
    return false
  }
}

function formatLastActive(ts?: number): string {
  if (!ts) {
    return ''
  }

  const diff = Date.now() - ts

  if (diff < 60_000) {return '刚刚活跃'}

  if (diff < 3_600_000) {return `${Math.floor(diff / 60_000)} 分钟前活跃`}

  if (diff < 86_400_000) {return `${Math.floor(diff / 3_600_000)} 小时前活跃`}

  return `${Math.floor(diff / 86_400_000)} 天前活跃`
}

function ExpertCard({ expert }: { expert: OpcExpertRow }) {
  const [opening, setOpening] = useState(false)

  return (
    <button
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 text-left transition-all duration-150',
        'border-(--ui-stroke-tertiary) bg-(--ui-card) hover:-translate-y-0.5 hover:border-(--ui-primary)/40 hover:shadow-[0_6px_20px_color-mix(in_srgb,var(--ui-primary)_14%,transparent)]'
      )}
      data-tour={`opc-expert-${expert.name}`}
      disabled={opening}
      onClick={() => {
        setOpening(true)
        void openOpcExpert(expert.name).finally(() => setOpening(false))
      }}
      type="button"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[1.05rem] font-bold text-white"
          style={{ background: `hsl(${expert.hue} 52% 52%)` }}
        >
          <Codicon aria-hidden="true" name="workspace" size="1.15rem" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.95rem] font-bold text-(--ui-text-primary)">{expert.label}</span>
          <span className="block truncate text-[0.75rem] text-(--ui-text-tertiary)">
            {expert.desc || '独立记忆 · 永续对话 · 每日例程'}
          </span>
        </span>
      </div>

      <p className="text-[0.8rem] leading-relaxed text-(--ui-text-secondary)">
        <span className="mr-1.5 font-bold text-(--ui-primary)">专家</span>
        独立配置档案：有自己的记忆、人设与例程，适合长期运营型任务。
      </p>

      <span className="mt-auto flex items-center justify-between gap-1.5 text-[0.8rem] font-semibold text-(--ui-primary)">
        <span className="flex items-center gap-1.5">
          {opening ? '正在打开…' : '进入对话'}
          <Codicon
            aria-hidden="true"
            className="transition-transform duration-150 group-hover:translate-x-0.5"
            name="chevron-right"
            size="0.85rem"
          />
        </span>
        {formatLastActive(expert.lastActive) && (
          <span className="font-normal text-(--ui-text-tertiary)">{formatLastActive(expert.lastActive)}</span>
        )}
      </span>
    </button>
  )
}

/** roster → 专家卡片墙（静态 useRoster，React 规则：无条件调用） */
function RosterGrid() {
  const { data, error } = useRoster()
  const experts = toOpcExpertRows(asSnapshotLike(data))

  // qiji 0.20.5b: 发布 owner label——OPC 打开专家的 tab 标题显示专家名而非
  // 存档名 "Bot Chat"（workspaceOwnerTitle 机制，BotsPane 同款 roster-pane-lifecycle:39）。
  // OPC 路径原来漏发，openBotCanonicalChat 后 tab 一直回退 CANONICAL_CHAT_TITLE。
  // 渲染时机写入（对齐 BotsPane 的"settle after render"纪律：atom 写在 render 外）。
  useEffect(() => {
    const rows = Array.isArray(data?.profiles) ? (data!.profiles as RosterRow[]) : []
    rows.forEach(bot => {
      if (!bot?.name || bot.ghost) {return}
      try {
        setWorkspaceOwnerLabel(botWorkspaceOwnerKey(bot), displayName(bot))
      } catch {
        // 无 route 的孤儿行（botWorkspaceOwnerKey 内部有 degrade 路径，这里兜底静默）
      }
    })
  }, [data])

  if (error && experts.length === 0) {
    return (
      <p className="col-span-full px-1 py-8 text-center text-[0.85rem] text-(--ui-text-tertiary)">
        专家列表加载失败，请稍后重试。
      </p>
    )
  }

  if (experts.length === 0) {
    return (
      <p className="col-span-full px-1 py-8 text-center text-[0.85rem] text-(--ui-text-tertiary)">
        还没有专家。在「设置 → 高级功能」里打开专家面板即可创建。
      </p>
    )
  }

  return (
    <>
      {experts.map(expert => (
        <ExpertCard expert={expert} key={expert.name} />
      ))}
    </>
  )
}

/** 专家段。静态 useRoster（0.20.5a：动态 import 版在加密链下炸 #310）。 */
export function OpcExpertsSection() {
  // qiji 0.20.5b: 「＋新建专家」尾卡 + 表单
  const [creating, setCreating] = useState(false)

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3.5 px-8 pb-8 pt-3">
      <RosterGrid />
      <button
        className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--ui-stroke-tertiary) bg-transparent text-(--ui-text-tertiary) transition-all duration-150 hover:border-(--ui-primary)/50 hover:text-(--ui-primary)"
        onClick={() => setCreating(true)}
        type="button"
      >
        <Codicon name="plus" size="1.4rem" />
        <span className="text-[0.85rem] font-medium">新建专家</span>
      </button>
      {creating ? <CreateExpertDialog onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
