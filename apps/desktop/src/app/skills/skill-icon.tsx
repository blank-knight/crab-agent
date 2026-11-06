import { Codicon } from '@/components/ui/codicon'

/**
 * 技能图标映射（qiji 0.19.4）
 *
 * Codicon（536 个 VS Code 图标）按三级匹配：
 *   1. SKILL_ICONS：技能名（目录名）精确匹配
 *   2. 类别回退：SKILL_ZH 同款的分类 → 每类一个代表图标
 *   3. 兜底：extensions（技能=可插拔能力的语义）
 *
 * 新技能漏配时走 2/3 级，不会出现空白图标。
 */

// ── 1. 技能名精确匹配（高频/首页技能优先占位） ──
const SKILL_ICONS: Record<string, string> = {
  // 办公文档
  'pptx-maker': 'pie-chart',
  'xlsx-master': 'table',
  'docx-writer': 'file-text',
  'ocr-and-documents': 'file-pdf',
  'pdf-form-filler': 'file-pdf',
  powerpoint: 'pie-chart',
  docx: 'file-text',
  xlsx: 'table',

  // 多媒体
  whisper: 'mic',
  'img-toolkit': 'file-media',
  'stable-diffusion-image-generation': 'color-mode',
  'baoyu-comic': 'book',
  'baoyu-infographic': 'layout',
  'manim-video': 'play',
  'ascii-video': 'play',
  'ascii-art': 'symbol-color',
  'pixel-art': 'primitive-square',
  comfyui: 'color-mode',
  p5js: 'symbol-color',
  'songwriting-and-ai-music': 'music',
  spotify: 'music',
  'text-to-speech': 'megaphone',
  tts: 'megaphone',
  elevenlabs: 'megaphone',
  videoflow: 'play',

  // 开发
  codex: 'terminal',
  'codex-custom-providers': 'terminal',
  'claude-code': 'terminal',
  opencode: 'terminal',
  'hermes-agent': 'settings-gear',
  'debugging-hermes-tui-commands': 'debug',
  'node-inspect-debugger': 'debug',
  'nextjs-app-router-dev': 'globe',
  'astro-seo-site': 'globe',
  'responsive-web-frontend': 'layout',
  'systematic-debugging': 'debug',
  'python-import-scope-pitfall': 'debug',
  'claim-verification': 'shield',
  'subagent-driven-development': 'organization',
  'writing-plans': 'book',
  plan: 'map',
  'kanban-orchestrator': 'organization',
  'kanban-worker': 'organization',
  'skill-source-protection': 'lock-small',
  'github-repo-management': 'git-branch',

  // 运维/服务器
  'c-drive-cleanup': 'trash',
  'wsl-disk-management': 'database',
  'linux-server-incident-response': 'shield',
  'server-intrusion-response': 'shield',
  'hermes-gateway-troubleshooting': 'broadcast',
  'llm-provider-diagnostics': 'pulse',
  'webhook-subscriptions': 'rss',
  'offline-maven-upgrades': 'package',
  'modal-serverless-gpu': 'cloud',
  'trading-dashboard-debugging': 'graph-line',
  'qiji-backend-ops': 'server',
  'qiji-deploy-build': 'rocket',
  'qiji-client-build': 'package',
  'qiji-client-release': 'package',
  'qiji-desktop-client': 'window',
  'qiji-agent-backend': 'server',
  'qiji-default-plans-release': 'credit-card',
  'qiji-geo': 'star-full',

  // 数据/量化
  'dune-onchain-queries': 'database',
  'polymarket-trading-bot': 'graph-line',
  'cex-arbitrage-scanner': 'graph-scatter',
  'quant-backtesting-data-prep': 'graph',
  'ml-train-serve-skew': 'beaker',
  'evaluating-llms-harness': 'beaker',
  guidance: 'regex',
  outlines: 'json',
  obliteratus: 'flame',
  'gguf-quantization': 'layers',
  clip: 'eye',
  'whisper-skill': 'mic',
  axolotl: 'beaker',
  'fine-tuning-with-trl': 'beaker',
  'grpo-rl-training': 'beaker',
  'peft-fine-tuning': 'beaker',
  'pytorch-fsdp': 'layers',
  unsloth: 'zap',
  dspy: 'lightbulb',

  // 消息平台
  'hermes-messaging-platform-setup': 'comment',
  'messaging-platform-qr-onboarding': 'link',
  'multi-agent-telegram-setup': 'comment',
  xitter: 'megaphone',
  'send-to-weixin': 'mail',

  // 研究/知识
  'knowledge-base-articles': 'library',
  'memos-memory-guide': 'database',
  'find-nearby': 'map',
  'digital-avatar-education': 'mortar-board',
  'fund-radar': 'graph-line',
  clarioxis: 'globe',
  'videoflow-skill': 'play',

  // 系统工具
  'computer-use': 'screen-normal',
  petdex: 'smiley',
  'minecraft-modpack-server': 'package',
  'pokemon-player': 'play',
  'native-mcp': 'plug',
  mcporter: 'plug',
  'health-coach-system': 'heart',
  godmode: 'flame',
  ideation: 'lightbulb',
  sketch: 'paintcan',
  'claude-design': 'paintcan',
  'popular-web-designs': 'layout',
  'architecture-diagram': 'graph',
  excalidraw: 'paintcan',
  pretext: 'file-text',
  humanizer: 'text-size',
  'design-md': 'paintcan',
  'touchdesigner-mcp': 'plug',
  'agent-platform-migration': 'rocket',
  'jupyter-live-kernel': 'notebook',
  'component-assessment-docs': 'file-text',
  'sharding-component-assessment': 'database',
  'sharding-component-eval': 'database',
  'kingbase-component-evaluation': 'database',
  linear: 'organization',
  'frontend-real-data-first': 'check',
  'ai-coding-memory-bank-sdd-workflow': 'book',
  'autonomous-ai-agents': 'robot',
  'web-search': 'search',
  'browser-use': 'browser',
  research: 'search',
  'wolfram-alpha': 'pulse',
  memory: 'database',
  skills: 'extensions',
  'skill-creator': 'extensions',
  'create-skill': 'extensions',
  git: 'git-branch',
  github: 'git-branch',
  docker: 'package',
  ssh: 'terminal',
  vim: 'terminal',
  ffmpeg: 'play',
  youtube: 'play'
}

// ── 2. 类别回退（与 translations.ts 的分类一致） ──
const CATEGORY_ICONS: Record<string, string> = {
  autonomous_ai_agents: 'robot',
  creative: 'paintcan',
  data_science: 'graph',
  devops: 'server',
  frontend_real_data_first: 'layout',
  gaming: 'play',
  github: 'git-branch',
  health: 'heart',
  leisure: 'map',
  mcp: 'plug',
  media: 'file-media',
  mlops: 'beaker',
  openclaw_imports: 'download',
  productivity: 'book',
  qiji_geo: 'star-full',
  red_teaming: 'flame',
  research: 'search',
  social_media: 'megaphone',
  software_development: 'terminal'
}

/** 兜底图标：技能 = 可插拔能力 */
const FALLBACK_ICON = 'extensions'

// ── 图标配色（qiji 0.19.4: 彩色图标——柔和底 + 同色系深色前景） ──
// 与图标同 key 的语义色；tailwind 任意值色板，色弱可辨（同亮度层级）。
const SKILL_ICON_TONES: Record<string, string> = {
  blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/20',
  green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/20',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/20',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/20',
  cyan: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  slate: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 border-slate-500/20',
  orange: 'bg-orange-500/12 text-orange-600 dark:text-orange-400 border-orange-500/20'
}

// 图标 → 色调（按技能语义分组：办公=蓝、多媒体=紫、开发=青、运维=橙、数据=绿、安全=红…）
const ICON_TONES: Record<string, keyof typeof SKILL_ICON_TONES> = {
  // 办公/文档 → 蓝
  'pie-chart': 'blue',
  table: 'blue',
  'file-text': 'blue',
  'file-pdf': 'blue',
  book: 'blue',
  notebook: 'blue',
  library: 'blue',
  // 多媒体/创意 → 紫/玫红
  mic: 'violet',
  music: 'violet',
  play: 'violet',
  'file-media': 'violet',
  'color-mode': 'rose',
  paintcan: 'rose',
  layout: 'violet',
  'symbol-color': 'rose',
  'primitive-square': 'violet',
  megaphone: 'rose',
  smiley: 'amber',
  // 开发 → 青
  terminal: 'cyan',
  debug: 'cyan',
  code: 'cyan',
  'file-code': 'cyan',
  json: 'cyan',
  regex: 'cyan',
  globe: 'cyan',
  browser: 'cyan',
  map: 'cyan',
  rocket: 'cyan',
  organization: 'cyan',
  'git-branch': 'cyan',
  // 运维/基础设施 → 橙
  server: 'orange',
  cloud: 'orange',
  database: 'orange',
  package: 'orange',
  'settings-gear': 'orange',
  trash: 'orange',
  broadcast: 'orange',
  rss: 'orange',
  plug: 'orange',
  window: 'orange',
  // 数据/量化 → 绿
  graph: 'green',
  'graph-line': 'green',
  'graph-scatter': 'green',
  beaker: 'green',
  layers: 'green',
  zap: 'green',
  pulse: 'green',
  lightbulb: 'amber',
  // 安全/系统 → 红/灰
  shield: 'rose',
  flame: 'rose',
  'lock-small': 'rose',
  heart: 'rose',
  search: 'cyan',
  eye: 'cyan',
  comment: 'cyan',
  'star-full': 'amber',
  extensions: 'slate'
}

export interface SkillIconProps {
  name: string
  category?: null | string
  className?: string
}

/** 图标容器样式（彩色版）——给外层 span 用 */
export function skillIconTone(iconName?: string): string {
  const tone = iconName ? ICON_TONES[iconName] : undefined

  return SKILL_ICON_TONES[tone ?? 'slate']
}

/** 技能图标：精确名 → 类别 → extensions 兜底 */
export function SkillIcon({ category, className, name }: SkillIconProps) {
  const icon = SKILL_ICONS[name] ?? CATEGORY_ICONS[String(category ?? '').replace(/-/g, '_')] ?? FALLBACK_ICON

  return <Codicon className={className} name={icon} size="1rem" />
}

/** 解析技能最终用的图标名（供容器取配套色调） */
export function resolveSkillIconName(name: string, category?: null | string): string {
  return SKILL_ICONS[name] ?? CATEGORY_ICONS[String(category ?? '').replace(/-/g, '_')] ?? FALLBACK_ICON
}
