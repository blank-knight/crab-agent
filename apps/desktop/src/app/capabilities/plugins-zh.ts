// qiji 0.20.4: 插件中文名/描述映射（key = 插件包名，未收录回退英文原样）。
// 覆盖：内置桌面插件（src/plugins/*）+ 常见 agent 插件包名。
// 新插件未收录时显示英文是预期回退；要中文就补这张表。
export const PLUGIN_ZH: Readonly<Record<string, { name: string; desc: string }>> = {
  // 内置插件——上游目录名两档大小写都收（后端目录名随版本变过）。
  'hermes-bots': { name: '专家系统', desc: '一位专家一场对话的名单模式：头像、每日例程、群聊与专家互聊。随应用内置，不需要可在此停用。' },
  Bots: { name: '专家系统', desc: '一位专家一场对话的名单模式：头像、每日例程、群聊与专家互聊。随应用内置，不需要可在此停用。' },
  kanban: { name: '看板', desc: '多代理任务看板：看板页面、侧栏入口、状态栏实时进行数。' },
  Kanban: { name: '看板', desc: '多代理任务看板：看板页面、侧栏入口、状态栏实时进行数。' },
  radio: { name: '电台', desc: '网络电台播放。' },
  Radio: { name: '电台', desc: '网络电台播放。' },
  'hello-runtime': { name: 'Hello Runtime', desc: '桌面插件运行时示例（开发用）。' },
  // 内置功能型（catalog 显示名）
  'disk-cleanup': { name: '磁盘清理', desc: '自动追踪并清理会话期间产生的临时文件（测试脚本、临时输出、定时日志），通过插件钩子运行，无需代理操心。' },
  'security-guidance': { name: '安全防护', desc: '写入文件时自动附加安全提醒：检出 pickle.load、eval、弱加密等危险模式即警告，让模型在下一轮自我修正。' },
  // agent 侧常见包
  'screen-pip': { name: '画中画', desc: '屏幕画面画中画显示。' },
  'web-dashboard': { name: '网页仪表盘', desc: '浏览器端仪表盘界面。' },
  'screenshot-tool': { name: '截图工具', desc: '屏幕截图与标注。' },
  'media-browser': { name: '媒体浏览器', desc: '浏览与管理本地媒体文件。' },
  'pdf-viewer': { name: 'PDF 阅读器', desc: '内嵌 PDF 文档查看。' },
  'video-viewer': { name: '视频播放器', desc: '内嵌视频播放。' }
}

export function pluginNameZh(name: string, fallback: string): string {
  return PLUGIN_ZH[name]?.name ?? fallback
}

export function pluginDescZh(name: string, fallback: string): string {
  return PLUGIN_ZH[name]?.desc ?? fallback
}
