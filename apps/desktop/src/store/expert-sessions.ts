import { atom } from 'nanostores'

import { CANONICAL_CHAT_TITLE } from '@/plugins/hermes-bots/canonical-chat'
import { requestForBot } from '@/plugins/hermes-bots/routing'
import { $fleetRoster, refreshFleetRoster } from '@/store/fleet-roster'
import type { SessionInfo } from '@/types/hermes'

/**
 * crab 0.20.5s-r10 (10-28 方案A): 专家常驻会话切片。
 *
 * 用户拍板:侧栏不再设「专家会话」独立分组,专家的常驻对话(Bot Chat)像普通
 * 会话一样混排进「会话」列表,行标题=专家名。一专家一线程永续机制不变——
 * 这里只做"把线行放进列表",不动 canonical-chat 的身份/解析/创建链。
 *
 * 数据源:仿 $messagingSessions 的源切片模式(上游先例:hidden 会话由"拥有
 * 它的面板"用 include_hidden 专属拉取;session.list {title:} 是索引精确查,
 * 窗口无关)。每个本机专家档一条 session.list {title:'Bot Chat',
 * include_hidden:true}(requestForBot 走该档自己的后端,不偷 active 网关)。
 * 没聊过的专家没有行——与普通会话"没聊过就没有"心智一致;旧分组"建了专家
 * 不显示"的 roster 快照虫整类消失(列表不依赖 roster 快照缓存)。
 *
 * 行的 profile/connection_id 照 roster 落,owner 梯子据此把 resume 路由到
 * 该档后端;title 用专家中文名覆盖(行可见身份是"作文专家",不是内部标题
 * Bot Chat)。
 */
export const $expertSessions = atom<SessionInfo[]>([])

interface CanonicalRow {
  id?: string
  resolved_id?: string
  title?: string | null
  preview?: string | null
  started_at?: number
  message_count?: number
  source?: string | null
}

interface RosterAgentLike {
  connectionId?: string
  connectionKind?: string
  profile?: string
  profileMetadata?: { bot_title?: string; display_name?: string; title?: string; ui_meta?: Record<string, unknown> }
}

/** 本机专家行(与 OPC 专家卡同一身份判定:local + 非 default + bot_title 链)。 */
function localExperts(roster: { agents?: RosterAgentLike[] } | null): Array<{ connectionId?: string; label: string; profile: string }> {
  const out: Array<{ connectionId?: string; label: string; profile: string }> = []

  for (const agent of roster?.agents || []) {
    if (agent?.connectionKind !== 'local') {
      continue
    }

    const profile = (agent.profile || '').trim()
    const meta = agent.profileMetadata
    const botMeta = meta?.ui_meta?.['hermes-bots'] as { title?: string } | undefined
    const label =
      (meta?.display_name || '').trim() ||
      (meta?.title || '').trim() ||
      (botMeta?.title || '').trim() ||
      (meta?.bot_title || '').trim()

    if (!profile || profile.toLowerCase() === 'default' || !label) {
      continue
    }

    out.push({ connectionId: agent.connectionId, label, profile })
  }

  return out
}

let inflight: Promise<void> | null = null

/**
 * 刷新专家常驻线行。roster 先 force(新专家立即可见——不靠 5s 轮询),再对
 * 每个本机专家并行查他的 Bot Chat;查不到行(没聊过)=没有行,不造占位。
 * 单个专家查询失败只丢他那一行,不拖垮整个切片。
 */
export async function refreshExpertSessions(): Promise<void> {
  if (inflight) {
    return inflight
  }

  inflight = (async () => {
    try {
      await refreshFleetRoster({ force: true })
    } catch {
      // roster 失败保留旧切片——列表不该因一次枚举失败丢行
      return
    }

    const roster = $fleetRoster.get()
    const experts = localExperts(roster as { agents?: RosterAgentLike[] } | null)

    const rows = await Promise.all(
      experts.map(async expert => {
        try {
          const res = await requestForBot<{ sessions?: CanonicalRow[] }>(
            { connectionId: expert.connectionId, connectionKind: 'local', name: expert.profile },
            'session.list',
            { profile: expert.profile, title: CANONICAL_CHAT_TITLE, limit: 1, include_hidden: true }
          )

          const row = res?.sessions?.[0]

          if (!row?.id) {
            return null
          }

          const session: SessionInfo = {
            ended_at: null,
            id: String(row.id),
            input_tokens: 0,
            is_active: false,
            // crab 0.20.5s-r11: 先来后到——title 精确查的行摘要只有 started_at
            // (无 last_active),用 started_at 参与排序;绝不拿 Date.now() 兜底,
            // 那会把所有专家行打成"刚刚"浮顶(10-29 用户实锤:全会话沉在专家
            // 行下面)。⚠️ SessionInfo 时间轴是 Unix **秒**(session-row 的
            // formatAge/new Date(ts*1000)、后端 time.time() 都是秒)——r10 首版
            // 误乘 1000 成毫秒,13位数秒值碾压一切正常行(10位数),排序+标签
            // 双错。行没有 started_at 就 0 沉底。
            last_active: row.started_at ?? 0,
            message_count: row.message_count ?? 0,
            model: null,
            output_tokens: 0,
            preview: row.preview ?? null,
            profile: expert.profile,
            source: row.source ?? null,
            started_at: row.started_at ?? 0,
            title: expert.label,
            tool_call_count: 0,
            // 专家线行是隐藏行,正常 merge 逻辑会把 hidden:true 的行丢掉
            // (#113273 LISTED-NEVER)——切片走自己的渲染通道,不进 merge,
            // 这里不带 hidden 字段。
            ...(row.resolved_id && row.resolved_id !== row.id ? { _lineage_root_id: String(row.id) } : {})
          }

          return session
        } catch {
          return null
        }
      })
    )

    $expertSessions.set(rows.filter((row): row is SessionInfo => row !== null))
  })().finally(() => {
    inflight = null
  })

  return inflight
}
