// Curation for the desktop "Skills & Tools → Toolsets" list.
//
// `GET /api/tools/toolsets` returns the full CONFIGURABLE_TOOLSETS set with no
// desktop-specific filter — so it surfaces entries that don't belong in a flat
// per-user toggle list on the desktop: platform-coupled toolsets (which
// `hermes tools` already platform-restricts on the CLI) and internal plumbing
// that isn't a user-facing capability. Mirror the curation approach used for
// slash commands (`desktop-slash-commands.ts`): one documented block-list, one
// predicate. Hiding a toolset only removes its row — its enabled state and
// runtime gating are untouched.
const DESKTOP_HIDDEN_TOOLSETS = new Set([
  // Platform-coupled — only meaningful when that platform is the active
  // adapter; `hermes tools` restricts these off the CLI too.
  'discord',
  'discord_admin',
  'yuanbao',
  // Internal plumbing, not a user capability toggle.
  'context_engine',
  'moa'
])

/**
 * qiji 0.20.5: 开发者向工具集——普通用户默认不见（「高级功能」开关放出）。
 * 与 DESKTOP_HIDDEN_TOOLSETS 的区别：那些是任何桌面用户都不该见的（平台
 * 耦合/内部管线），这些是合法能力但受众是开发者/极客。
 */
const DEVELOPER_TOOLSETS = new Set([
  'api',
  'editor',
  'safe',
  'debugging',
  'homeassistant',
  'spotify',
  'browser-real-profile'
])

export function isDesktopToolsetVisible(name: string, advancedFeatures = false): boolean {
  if (DESKTOP_HIDDEN_TOOLSETS.has(name)) {
    return false
  }

  return advancedFeatures || !DEVELOPER_TOOLSETS.has(name)
}

/**
 * qiji 0.20.5: 开发者向连接器（slug）——普通用户默认不见（「高级功能」开关放出）。
 * 判例：已连接/已关闭状态不过滤——用户已经在用的不能凭空消失，只隐藏「可用」陈列。
 */
const DEVELOPER_CONNECTORS = new Set(['gitlab', 'jira', 'linear'])

export type ConnectorVisibilityState = 'available' | 'broken' | 'connected' | 'connecting' | 'expired' | 'off' | 'unknown'

export function isConnectorSlugVisible(slug: string, state: ConnectorVisibilityState, advancedFeatures = false): boolean {
  if (advancedFeatures || !DEVELOPER_CONNECTORS.has(slug)) {
    return true
  }

  // 已连接系（含异常/过期）一律保留；只藏从未用过的陈列（available/off/unknown）
  return state === 'connected' || state === 'broken' || state === 'connecting' || state === 'expired'
}

/** Desktop plugin id → the agent toolset carrying the same feature's
 *  agent-side tools. The Plugins page's Desktop switch toggles this app's UI
 *  panel; for these entries it also flips the toolset opt-in through the same
 *  `PUT /api/tools/toolsets/{name}` the Toolsets tab uses, so the panel is
 *  never UI-only (#96969). The kanban board is the built-in case: it has no
 *  agent-plugin package half, its agent tools live in the `kanban` toolset. */
export const DESKTOP_PLUGIN_TOOLSETS: Readonly<Record<string, string>> = {
  kanban: 'kanban'
}
