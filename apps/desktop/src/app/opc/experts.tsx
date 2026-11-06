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

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { setWorkspaceOwnerLabel } from '@/components/pane-shell/workspace-scope'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { refreshFleetRoster } from '@/store/fleet-roster'
import { refreshAccountLockExceptions } from '@/store/profile'

import { openBotCanonicalChat } from '../../plugins/hermes-bots/canonical-chat'
import { $botMeta, useRoster } from '../../plugins/hermes-bots/data'
import { displayName } from '../../plugins/hermes-bots/labels'
import { deleteBot } from '../../plugins/hermes-bots/profile-ops'
import { botRosterMeta, botWorkspaceOwnerKey } from '../../plugins/hermes-bots/routing'
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

function toRow(
  row: Record<string, unknown>,
  localMeta?: Record<string, { title?: unknown; description?: unknown }>
): OpcExpertRow | null {
  if (typeof row.name !== 'string' || row.name.length === 0) {
    return null
  }

  const name = row.name
  const worker = row.worker_session as { last_active?: unknown } | null | undefined

  // crab 0.20.5k: 专家名显示修复。CreateExpertDialog 把「专家名字」存进
  // ui_meta['hermes-bots'].title（服务端 profile.yaml 持久化），旧 toRow 的
  // label 只读 row.display_name ——新建专家没有 display_name，于是永远显示
  // profile id（pmv9im007）。优先级链对齐 Bots 面板 displayName()：
  // ui_meta title > row.title > display_name > name。desc 同步只读人设
  // （description），不再把 title 当人设显示（避免名字重复出现在两行）。
  const meta =
    row.ui_meta && typeof row.ui_meta === 'object'
      ? ((row.ui_meta as Record<string, unknown>)['hermes-bots'] as { title?: unknown; description?: unknown } | null)
      : null

  // crab 0.20.5l: 行不带 ui_meta 时（创建竞态窗口：profiles.create 已落、
  // 服务端 ui_meta 写回未达、roster 抓到裸行），叠查本地 $botMeta——
  // saveBotMeta 在建档后同步写好，比等下一轮轮询早数秒。
  const local = localMeta?.[name]

  const metaTitle =
    (typeof meta?.title === 'string' && meta.title.trim()) ||
    (typeof local?.title === 'string' && local.title.trim()) ||
    ''

  const rowTitle = typeof row.title === 'string' ? row.title.trim() : ''
  const displayNameField = typeof row.display_name === 'string' && row.display_name ? row.display_name : ''
  const metaDesc = typeof meta?.description === 'string' ? meta.description : ''
  const localDesc = typeof local?.description === 'string' ? local.description : ''
  const rowDesc = typeof row.description === 'string' ? row.description : ''

  return {
    name,
    label: metaTitle || rowTitle || displayNameField || name,
    desc: metaDesc || localDesc || rowDesc || '',
    hue: expertHue(metaTitle || name),
    lastActive: worker && typeof worker.last_active === 'number' ? (worker.last_active as number) : undefined
  }
}

export function toOpcExpertRows(
  snapshot: RosterSnapshotLike,
  localMeta?: Record<string, { title?: unknown; description?: unknown }>
): OpcExpertRow[] {
  const rows = Array.isArray(snapshot?.profiles) ? (snapshot!.profiles as Array<Record<string, unknown>>) : []

  return rows.map(row => toRow(row, localMeta)).filter((r): r is OpcExpertRow => r !== null)
}

/** qiji 0.20.5a: 静态 import——动态 import 在加密链(blob:)下不可靠
 *  （React #310 装机实锤），且 plugin 本就是 eager glob 加载，
 *  懒加载语义从未成立。数据层模块 import 无副作用。
 *  0.20.5c: kickoffOnCreate——OPC 专家经 profiles.configure 出生、从未走过
 *  New Agent 创建流，首点 mint 的空会话就是「空对话」报障根因；mint 时
 *  补一发 intro（上游 BotsPane 路径不传，ScottFive 守卫不受影响）。 */
async function openOpcExpert(name: string): Promise<boolean> {
  try {
    return (await openBotCanonicalChat(name, { kickoffOnCreate: true })) != null
  } catch {
    return false
  }
}

function formatLastActive(ts?: number): string {
  if (!ts) {
    return ''
  }

  const diff = Date.now() - ts

  if (diff < 60_000) {
    return '刚刚活跃'
  }

  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟前活跃`
  }

  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时前活跃`
  }

  return `${Math.floor(diff / 86_400_000)} 天前活跃`
}

function ExpertCard({ expert }: { expert: OpcExpertRow }) {
  const [opening, setOpening] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const doDelete = async () => {
    if (deleting) {
      return
    }
    setDeleting(true)
    setConfirmError(null)

    try {
      await deleteBot({ name: expert.name } as RosterRow)
      // crab 0.20.5o-r2: 删除后立刻刷 fleet roster——侧栏「专家会话」分组
      // 的数据源就是它，不刷则已删专家残留到下次窗口聚焦。
      void refreshFleetRoster({ force: true })
      // 同步刷账号锁豁免集：被删档案退出豁免集，拉取侧收敛回锁定档，
      // 已删专家的孤儿会话不再出现在任何 scope。
      void refreshAccountLockExceptions()
      setConfirming(false)
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 text-left transition-all duration-150',
        'border-(--ui-stroke-tertiary) bg-(--ui-card) hover:-translate-y-0.5 hover:border-(--ui-primary)/40 hover:shadow-[0_6px_20px_color-mix(in_srgb,var(--ui-primary)_14%,transparent)]'
      )}
      data-tour={`opc-expert-${expert.name}`}
      onClick={() => {
        if (!opening && !deleting) {
          setOpening(true)
          void openOpcExpert(expert.name).finally(() => setOpening(false))
        }
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !opening && !deleting) {
          setOpening(true)
          void openOpcExpert(expert.name).finally(() => setOpening(false))
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* crab 0.20.5k-r3: hover 删除按钮（装机反馈：专家删不掉）。
          外层是 div（不是 button）就是为了允许这个嵌套交互元素。 */}
      <span className="absolute right-2.5 top-2.5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          aria-label="删除专家"
          className={cn(
            'flex size-6 items-center justify-center rounded-md bg-(--ui-muted) text-(--ui-text-secondary) transition-colors hover:text-red-500',
            deleting && 'animate-spin'
          )}
          onClick={e => {
            e.stopPropagation()
            setConfirming(true)
          }}
          type="button"
        >
          <Codicon name={deleting ? 'loading' : 'trash'} size="0.8rem" />
        </button>
      </span>

      {confirming ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-(--ui-card)/95 p-4 backdrop-blur-sm"
          onClick={e => e.stopPropagation()}
          role="presentation"
        >
          <p className="text-[0.85rem] font-semibold text-(--ui-text-primary)">删除专家「{expert.label}」？</p>
          <p className="text-center text-[0.72rem] leading-relaxed text-(--ui-text-tertiary)">
            将永久删除该专家的档案、记忆与全部对话历史，不可恢复。
          </p>
          {confirmError ? (
            <p className="max-w-full break-all text-center text-[0.7rem] text-red-500">{confirmError}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              className="rounded-md px-3 py-1 text-[0.78rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-muted)"
              onClick={e => {
                e.stopPropagation()

                if (!deleting) {
                  setConfirming(false)
                }
              }}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-md bg-red-500/90 px-3 py-1 text-[0.78rem] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              disabled={deleting}
              onClick={e => {
                e.stopPropagation()
                void doDelete()
              }}
              type="button"
            >
              {deleting ? '删除中…' : '永久删除'}
            </button>
          </div>
        </div>
      ) : null}

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
    </div>
  )
}

/** roster → 专家卡片墙（静态 useRoster，React 规则：无条件调用） */
function RosterGrid() {
  const { data, error } = useRoster()
  // crab 0.20.5l: 创建瞬间防闪 id——saveBotMeta 同步先写本地 $botMeta，
  // 而 roster 行的 ui_meta 要等下一轮轮询（且服务端写回有 1-2s 空档）才带
  // 中文名；行数据缺 title 时叠查本地缓存，卡片首帧就是中文名，不再先露
  // profile id 再跳变。本地缓存只在行缺 meta 时兜底，服务端真源优先。
  const botMeta = useStore($botMeta)
  const experts = toOpcExpertRows(asSnapshotLike(data), botMeta)

  // qiji 0.20.5b: 发布 owner label——OPC 打开专家的 tab 标题显示专家名而非
  // 存档名 "Bot Chat"（workspaceOwnerTitle 机制，BotsPane 同款 roster-pane-lifecycle:39）。
  // OPC 路径原来漏发，openBotCanonicalChat 后 tab 一直回退 CANONICAL_CHAT_TITLE。
  // 渲染时机写入（对齐 BotsPane 的"settle after render"纪律：atom 写在 render 外）。
  useEffect(() => {
    const rows = Array.isArray(data?.profiles) ? (data!.profiles as RosterRow[]) : []
    rows.forEach(bot => {
      if (!bot?.name || bot.ghost) {
        return
      }

      try {
        // crab 0.20.5k: meta 必传——displayName 不带 meta 时读不到
        // ui_meta['hermes-bots'].title，专家 tab 标题会退回 profile id。
        setWorkspaceOwnerLabel(botWorkspaceOwnerKey(bot), displayName(bot, botRosterMeta(bot, $botMeta.get())))
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
        还没有专家。点击右下角「新建专家」创建第一位。
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
