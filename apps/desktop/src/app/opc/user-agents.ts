/**
 * qiji 0.20.5b: 用户自定义 OPC 智能体（方案A——本地启动器条目，不真建技能包）。
 *
 * 边界（10-12 拍板）：
 * - 卡 = 快捷入口：kind 'skill' 预填 `/技能名`，kind 'prompt' 预填一段提示词。
 * - 存 localStorage（`qiji-user-agents`），跨会话保留；不进技能与工具页
 *   （那页是 /api/skills 的系统仓库视图，混入快捷方式会让两页语义打架）。
 * - 渲染出口只有 OPC 技能段卡墙；编辑/删除就地（hover 按钮）。
 */

export type UserAgentKind = 'skill' | 'prompt'

export interface UserAgent {
  /** 稳定 id（毫秒时间戳字符串） */
  id: string
  /** 卡片标题（必填） */
  title: string
  /** 一句话描述 */
  desc: string
  kind: UserAgentKind
  /** kind=skill: 技能名（预填 `/target `）；kind=prompt: 提示词全文 */
  target: string
  /** 卡片强调色相（0-359，新建时随机一次后固定） */
  hue: number
  /** 创建时间 ms */
  createdAt: number
}

const KEY = 'qiji-user-agents'

function parse(raw: string | null): UserAgent[] {
  if (!raw) {
    return []
  }

  try {
    const arr = JSON.parse(raw)

    if (!Array.isArray(arr)) {
      return []
    }

    return arr.filter(
      (u): u is UserAgent =>
        u &&
        typeof u.id === 'string' &&
        typeof u.title === 'string' &&
        typeof u.target === 'string' &&
        (u.kind === 'skill' || u.kind === 'prompt')
    )
  } catch {
    return []
  }
}

export function loadUserAgents(): UserAgent[] {
  return parse(localStorage.getItem(KEY))
}

export function saveUserAgents(list: UserAgent[]): void {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function addUserAgent(partial: Pick<UserAgent, 'title' | 'desc' | 'kind' | 'target'>): UserAgent {
  const agent: UserAgent = {
    id: String(Date.now()),
    hue: Math.floor(Math.random() * 360),
    createdAt: Date.now(),
    ...partial
  }

  saveUserAgents([agent, ...loadUserAgents()])

  return agent
}

export function removeUserAgent(id: string): void {
  saveUserAgents(loadUserAgents().filter(u => u.id !== id))
}

export function updateUserAgent(id: string, patch: Partial<Omit<UserAgent, 'id'>>): void {
  saveUserAgents(loadUserAgents().map(u => (u.id === id ? { ...u, ...patch } : u)))
}
