// qiji 0.20.4: 连接器中文名/描述映射（key = connector slug，未收录回退英文原样）。
// 连接器目录数据来自后端（英文），渲染层按 slug 翻译；新连接器未收录时
// 显示英文是预期回退，要中文就补这张表。
export const CONNECTOR_ZH: Readonly<Record<string, { name: string; desc: string }>> = {
  slack: { name: 'Slack', desc: '团队协作平台：频道消息读写、成员互动。' },
  discord: { name: 'Discord', desc: '社区平台：服务器频道消息、成员管理。' },
  telegram: { name: 'Telegram', desc: '即时通讯：频道与群组消息收发。' },
  whatsapp: { name: 'WhatsApp', desc: '即时通讯：消息收发。' },
  gmail: { name: 'Gmail', desc: '谷歌邮箱：邮件读写与管理。' },
  google: { name: 'Google 账号', desc: '谷歌账号授权（邮箱/日历/云端硬盘）。' },
  github: { name: 'GitHub', desc: '代码托管：仓库、议题、PR。' },
  gitlab: { name: 'GitLab', desc: '代码托管：仓库与 CI。' },
  linear: { name: 'Linear', desc: '项目管理：议题与周期管理。' },
  notion: { name: 'Notion', desc: '知识库：页面与数据库读写。' },
  airtable: { name: 'Airtable', desc: '多维表格：记录管理。' },
  asana: { name: 'Asana', desc: '任务与项目管理。' },
  jira: { name: 'Jira', desc: '项目与缺陷跟踪。' },
  calendar: { name: '日历', desc: '日程与会议管理。' },
  spotify: { name: 'Spotify', desc: '音乐流媒体：播放与歌单。' },
  youtube: { name: 'YouTube', desc: '视频平台：订阅与内容。' },
  x: { name: 'X (Twitter)', desc: '社交平台：发帖与搜索。' },
  reddit: { name: 'Reddit', desc: '社区论坛：帖子与评论。' },
  stripe: { name: 'Stripe', desc: '在线支付：收款与账单。' },
  shopify: { name: 'Shopify', desc: '电商店铺管理。' },
  figma: { name: 'Figma', desc: '设计协作：文件与评论。' },
  dropbox: { name: 'Dropbox', desc: '云存储文件管理。' },
  'google-drive': { name: 'Google 云端硬盘', desc: '谷歌云存储文件管理。' },
  'google-calendar': { name: 'Google 日历', desc: '谷歌日程管理。' },
  'outlook-calendar': { name: 'Outlook 日历', desc: '微软日程管理。' },
  mcp: { name: 'MCP 服务器', desc: 'Model Context Protocol 自定义工具服务。' }
}

export function connectorNameZh(slug: string, fallback: string): string {
  return CONNECTOR_ZH[slug]?.name ?? fallback
}

export function connectorDescZh(slug: string, fallback: string): string {
  return CONNECTOR_ZH[slug]?.desc ?? fallback
}
