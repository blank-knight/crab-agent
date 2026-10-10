// 消息平台中文表 + 地域分组（qiji 0.20.5）——真源 hermes_cli/web_server_messaging.py _PLATFORM_OVERRIDES
// key=platform.id（身份字段），显示时 `PLATFORM_ZH[id] ?? 原文` 回退。name/desc 一表两用。
// zh.ts messaging.platformIntro 已有页面级长文案，这里是行级数据，别混。
//
// 地域分组（qiji：主打国内平台，国内组置顶）：未收录进任何组的新平台默认进「其他」组，
// 与 name/desc 表一致——上游新增平台免疫，不会凭空消失。
interface PlatformLike {
  id: string
}

export const PLATFORM_NAME_ZH: Readonly<Record<string, string>> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  mattermost: 'Mattermost',
  matrix: 'Matrix',
  signal: 'Signal',
  whatsapp: 'WhatsApp',
  whatsapp_cloud: 'WhatsApp 云端 API',
  weixin: '微信（个人号）',
  wecom: '企业微信群机器人',
  wecom_callback: '企业微信（应用）',
  dingtalk: '钉钉',
  feishu: '飞书 / Lark',
  email: '邮件',
  sms: '短信（Twilio）',
  google_chat: 'Google Chat',
  qqbot: 'QQ 机器人',
  yuanbao: '元宝',
  homeassistant: 'Home Assistant',
  bluebubbles: 'BlueBubbles（iMessage）',
  api_server: 'API 服务器',
  webhook: 'Webhook',
  msgraph_webhook: '微软 Graph 通知',
  relay: '中继（实验性）',
  // 捆绑平台插件（name 来自插件注册表，desc 来自 _PLATFORM_OVERRIDES；10-11 CDP 实测后补录）
  teams: 'Microsoft Teams',
  irc: 'IRC',
  line: 'LINE',
  ntfy: 'Ntfy 推送',
  photon: 'Photon（iMessage）',
  raft: 'Raft 工作区',
  simplex: 'SimpleX'
}

export const PLATFORM_DESC_ZH: Readonly<Record<string, string>> = {
  telegram: '在 Telegram 私聊、群组和话题中使用。',
  discord: '接入 Discord 私聊、频道和话题。',
  slack: '通过 Socket Mode 接入 Slack。可添加允许的成员 ID，控制机器人响应范围。',
  mattermost: '接入 Mattermost 频道与私聊。',
  matrix: '在 Matrix 房间与私聊中使用。',
  signal: '通过 signal-cli REST 桥接接入。',
  whatsapp: '使用内置 WhatsApp 桥接，扫码登录。',
  whatsapp_cloud: '使用 Meta 托管的 WhatsApp 云端 API（无需本地桥接）。',
  weixin: '通过腾讯 iLink 机器人接口接入个人微信。',
  wecom: '通过 webhook 接入企业微信群机器人（仅发送）。',
  wecom_callback: '通过回调应用接入企业微信（双向）。',
  dingtalk: '接入钉钉群。',
  feishu: '在飞书中使用。',
  email: '通过 IMAP/SMTP 邮箱收发对话。',
  sms: '通过 Twilio 收发短信。',
  google_chat: '通过 Cloud Pub/Sub 接入 Google Chat。',
  qqbot: '接入 QQ 开放平台的 QQ 机器人。',
  yuanbao: '接入腾讯元宝。',
  homeassistant: '通过 Home Assistant 控制智能家居。',
  bluebubbles: '通过 BlueBubbles 服务器使用 iMessage。',
  api_server: '把螃蟹OPC 暴露为 OpenAI 兼容的 HTTP API，供 Open WebUI 等工具调用。',
  webhook: '接收 GitHub、GitLab 等 Webhook 事件。',
  msgraph_webhook: '接收微软 Graph 变更通知（Teams 会议、Outlook 等）。',
  relay: '通用中继适配器（实验性）。',
  teams: '通过 Bot Framework 接入 Microsoft Teams 聊天。',
  irc: '在 IRC 频道（或私聊）与螃蟹OPC 之间收发消息。',
  line: '通过 LINE Messaging API 接入 LINE。',
  ntfy: '通过 ntfy 推送话题与螃蟹OPC 对话（ntfy.sh 或自建）。',
  photon: '通过 Photon 托管的 Spectrum 平台使用 iMessage。',
  raft: '以外部智能体身份加入 Raft 工作区。',
  simplex: '通过本地 simplex-chat 守护进程使用 SimpleX Chat。'
}

/** 国内平台 id 集——分组依据是产品定位（主打国内），不是平台归属地事实。 */
const CN_PLATFORM_IDS = new Set([
  'weixin',
  'wecom',
  'wecom_callback',
  'dingtalk',
  'feishu',
  'qqbot',
  'yuanbao'
])

/** 海外平台 id 集——Telegram/Discord 等国际主流。 */
const OVERSEAS_PLATFORM_IDS = new Set([
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'whatsapp_cloud',
  'signal',
  'matrix',
  'mattermost',
  'google_chat',
  'sms',
  'email',
  'bluebubbles'
])

export type PlatformRegion = 'cn' | 'overseas' | 'other'

export interface PlatformRegionGroup<T extends PlatformLike = PlatformLike> {
  id: PlatformRegion
  label: string
  platforms: T[]
}

export function platformRegion(id: string): PlatformRegion {
  if (CN_PLATFORM_IDS.has(id)) {
    return 'cn'
  }

  return OVERSEAS_PLATFORM_IDS.has(id) ? 'overseas' : 'other'
}

/** 按地域分组：国内置顶 → 海外 → 其他（工具/桥接类）。空组不出列。 */
export function groupPlatformsByRegion<T extends PlatformLike>(platforms: readonly T[]): Array<PlatformRegionGroup<T>> {
  const buckets: Record<PlatformRegion, T[]> = { cn: [], overseas: [], other: [] }

  for (const platform of platforms) {
    buckets[platformRegion(platform.id)].push(platform)
  }

  const labels: Record<PlatformRegion, string> = { cn: '国内平台', overseas: '海外平台', other: '其他接入' }

  return (['cn', 'overseas', 'other'] as const)
    .filter(id => buckets[id].length > 0)
    .map(id => ({ id, label: labels[id], platforms: buckets[id] }))
}
