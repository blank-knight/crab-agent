// qiji 0.20.4: 插件中文名/描述映射（key = 插件包名，未收录回退英文原样）。
// 覆盖：内置桌面插件（src/plugins/*）+ 常见 agent 插件包名。
// 新插件未收录时显示英文是预期回退；要中文就补这张表。
export const PLUGIN_ZH: Readonly<Record<string, { name: string; desc: string }>> = {
  'hermes-bots': { name: '机器人', desc: '创建常驻 AI 机器人——每个机器人一个持久身份与专属对话，可绑定不同模型与人格。' },
  kanban: { name: '看板', desc: '任务看板插件：看板视图与任务卡片，配套看板工具集。' },
  radio: { name: '电台', desc: '网络电台播放插件。' },
  'hello-runtime': { name: 'Hello Runtime', desc: '桌面插件运行时示例（开发用）。' },
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
