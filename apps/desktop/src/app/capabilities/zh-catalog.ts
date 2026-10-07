// qiji 0.20.4: 技能/工具集/分类 中文映射表（自研「技能与工具」页的数据真源）。
//
// 设计：
// - key = 后端返回的 name/category 原样（英文 id），值 = 中文显示。
//   未收录的 key 原样回退（新技能/新工具集/插件自动免疫，不会显示空白）。
// - 技能 73 项（装机 vendor 树 2026-10-07 快照）+ 分类 20 项 + 工具集 31 项。
// - 上游同步/技能市场新增后：新条目显示英文名是**预期回退**，需要中文时补这张表。
// - 描述翻译优先级：本表 description > 原文（英文）。不改后端数据。

// —— 技能分类（category key → 中文）——
export const CATEGORY_ZH: Readonly<Record<string, string>> = {
  apple: 'Apple 生态',
  'autonomous-ai-agents': 'AI 编程代理',
  'computer-use': '电脑操控',
  creative: '创意设计',
  'data-science': '数据科学',
  dogfood: '应用测试',
  email: '邮件',
  github: 'GitHub',
  media: '媒体处理',
  mlops: '机器学习工程',
  'note-taking': '笔记',
  productivity: '效率办公',
  'qiji-knowledge-base': '奇计知识库',
  research: '调研',
  'smart-home': '智能家居',
  'social-media': '社交媒体',
  'software-development': '软件开发',
  yuanbao: '元宝',
  general: '通用',
  hub: '技能市场'
}

// —— 工具集（toolset name → 中文，与 settings/helpers.ts TOOLSET_ZH_LABELS 同值）——
export const TOOLSET_ZH: Readonly<Record<string, string>> = {
  web: '网页搜索与抓取',
  browser: '浏览器自动化',
  terminal: '终端与进程',
  file: '文件操作',
  code_execution: '代码执行',
  vision: '视觉与图像分析',
  video: '视频分析',
  image_gen: '图像生成',
  video_gen: '视频生成',
  x_search: 'X (Twitter) 搜索',
  tts: '文字转语音',
  stt: '语音转文字',
  skills: '技能',
  todo: '任务规划',
  kanban: '看板',
  memory: '记忆',
  context_engine: '上下文引擎',
  session_search: '会话搜索',
  connections: '连接器',
  clarify: '澄清提问',
  delegation: '任务分派',
  cronjob: '定时任务',
  homeassistant: 'Home Assistant',
  spotify: 'Spotify',
  discord: 'Discord（读取/参与）',
  discord_admin: 'Discord 服务器管理',
  yuanbao: '元宝',
  computer_use: '电脑操控',
  messaging: '消息平台',
  'browser-real-profile': '浏览器真实配置'
}

// —— 技能（skill name → { name 中文名, desc 中文描述 }）——
export interface SkillZh {
  name: string
  desc: string
}

export const SKILL_ZH: Readonly<Record<string, SkillZh>> = {
  // Apple 生态
  'apple-notes': { name: 'Apple 备忘录', desc: '通过 memo 命令管理 Apple 备忘录：创建、搜索、编辑。' },
  'apple-reminders': { name: 'Apple 提醒事项', desc: '通过 remindctl 添加、列出、完成提醒事项。' },
  findmy: { name: '查找设备', desc: '在 macOS 上通过“查找”应用追踪 Apple 设备与 AirTag。' },
  imessage: { name: 'iMessage 短信', desc: '在 macOS 上通过 imsg 命令收发 iMessage 和短信。' },
  // AI 编程代理
  'claude-code': { name: 'Claude Code', desc: '把编码任务委托给 Claude Code 命令行（功能开发、PR）。' },
  codex: { name: 'Codex', desc: '把编码任务委托给 OpenAI Codex 命令行（功能开发、PR）。' },
  'hermes-agent': { name: '客户端配置', desc: '配置、扩展本客户端。' },
  opencode: { name: 'OpenCode', desc: '把编码任务委托给 OpenCode 命令行（功能开发、PR 审查）。' },
  // 电脑操控
  'computer-use': { name: '电脑操控', desc: '在后台驱动用户桌面——点击、输入、滚动、拖拽——不打断你的操作。' },
  // 创意设计
  'architecture-diagram': { name: '架构图', desc: '生成深色主题的 SVG 架构图/云架构图/基础设施图（HTML 输出）。' },
  'ascii-art': { name: 'ASCII 字符画', desc: 'ASCII 艺术：pyfiglet 大字、cowsay、边框、图片转字符。' },
  'ascii-video': { name: 'ASCII 视频', desc: '把视频/音频转换成彩色 ASCII 动画的 MP4/GIF。' },
  'baoyu-infographic': { name: '信息图', desc: '信息图制作：21 种版式 × 21 种风格。' },
  'claude-design': { name: 'HTML 设计稿', desc: '设计一次性 HTML 作品（落地页、演示稿、原型）。' },
  comfyui: { name: 'ComfyUI', desc: '用 ComfyUI 生成图片、视频、音频——安装、启动、节点模型管理、运行工作流。' },
  'design-md': { name: '设计规范文件', desc: '编写/校验/导出 DESIGN.md 设计令牌规范文件。' },
  excalidraw: { name: '手绘风图表', desc: '手绘风 Excalidraw 图表（架构图、流程图、时序图）。' },
  humanizer: { name: '文本去 AI 味', desc: '让文字更像人写的：去除 AI 腔调，注入真实语气。' },
  'manim-video': { name: '数学动画', desc: 'Manim CE 数学动画：3Blue1Brown 风格的数学/算法视频。' },
  p5js: { name: 'p5.js 创意编程', desc: 'p5.js 草图：生成艺术、着色器、交互、3D。' },
  'popular-web-designs': { name: '网页设计系统', desc: '54 套真实设计系统（Stripe、Linear、Vercel）的 HTML/CSS 实现。' },
  pretext: { name: 'Pretext 排版', desc: '用 @chenglou/pretext 做无 DOM 文本排版——ASCII 艺术浏览器演示。' },
  sketch: { name: '快速原型', desc: '一次性 HTML 草稿：2-3 个设计变体快速对比。' },
  'songwriting-and-ai-music': { name: '写歌与 AI 音乐', desc: '歌曲创作技法与 Suno AI 音乐提示词。' },
  'touchdesigner-mcp': { name: 'TouchDesigner', desc: '通过 twozero MCP 控制运行中的 TouchDesigner——创建算子、设参数、连线。' },
  // 数据科学
  'jupyter-live-kernel': { name: 'Jupyter 实时内核', desc: '通过常驻 Jupyter 内核做迭代式 Python 计算。' },
  // 应用测试
  dogfood: { name: '网页应用探查', desc: '对网页应用做探索性测试：找 bug、留证据、出报告。' },
  // 邮件
  himalaya: { name: '邮件', desc: '通过 Himalaya 命令行收发邮件（IMAP/SMTP）。' },
  // GitHub
  'codebase-inspection': { name: '代码库统计', desc: '用 pygount 检查代码库：代码行数、语言分布、比率。' },
  'github-auth': { name: 'GitHub 认证', desc: 'GitHub 认证配置：HTTPS 令牌、SSH 密钥、gh 命令行登录。' },
  'github-code-review': { name: 'GitHub 代码审查', desc: '审查 PR：diff、行内评论（gh 命令行或 REST API）。' },
  'github-issues': { name: 'GitHub 议题', desc: '通过 gh 或 REST 创建、分诊、打标签、指派议题。' },
  'github-pr-workflow': { name: 'GitHub PR 流程', desc: 'PR 全生命周期：建分支、提交、发起、CI、合并。' },
  'github-repo-management': { name: 'GitHub 仓库管理', desc: '克隆/创建/fork 仓库；管理远端与发布。' },
  // 媒体处理
  'gif-search': { name: 'GIF 搜索', desc: '通过 Tenor 搜索下载 GIF 动图。' },
  heartmula: { name: 'AI 作曲', desc: 'HeartMuLa：从歌词+标签生成歌曲（Suno 风格）。' },
  songsee: { name: '音频分析', desc: '音频频谱/特征分析（mel、色度、MFCC）。' },
  'youtube-content': { name: 'YouTube 内容加工', desc: 'YouTube 字幕转摘要、推文串、博客文章。' },
  // 机器学习工程
  'lm-evaluation-harness': { name: '模型评测', desc: 'lm-eval-harness：大模型基准测试（MMLU、GSM8K 等）。' },
  'weights-and-biases': { name: 'W&B 实验跟踪', desc: 'Weights & Biases：记录 ML 实验、超参搜索、模型注册、看板。' },
  'huggingface-hub': { name: 'HuggingFace', desc: 'HuggingFace hf 命令行：搜索/下载/上传模型与数据集。' },
  'llama-cpp': { name: 'llama.cpp', desc: 'llama.cpp 本地 GGUF 推理 + HuggingFace 模型发现。' },
  vllm: { name: 'vLLM', desc: 'vLLM：高吞吐大模型服务，OpenAI 兼容接口，支持量化。' },
  audiocraft: { name: 'AudioCraft', desc: 'AudioCraft：MusicGen 文字生成音乐、AudioGen 文字生成音效。' },
  'segment-anything': { name: '图像分割', desc: 'SAM 分割一切模型：用点、框、掩码做零样本图像分割。' },
  // 笔记
  obsidian: { name: 'Obsidian', desc: '在 Obsidian 知识库中读取、搜索、创建、编辑笔记。' },
  // 效率办公
  airtable: { name: 'Airtable', desc: '通过 REST API 操作 Airtable：记录增删改查、筛选、批量更新。' },
  'google-workspace': { name: 'Google 全家桶', desc: 'Gmail、日历、云端硬盘、文档、表格（gws 命令行或 Python）。' },
  maps: { name: '地图与路线', desc: '地理编码、兴趣点、路线、时区（OpenStreetMap/OSRM）。' },
  'nano-pdf': { name: 'PDF 编辑', desc: '通过自然语言指令编辑 PDF 文字/错别字/标题。' },
  notion: { name: 'Notion', desc: 'Notion API + ntn 命令行：页面、数据库、markdown、Workers。' },
  'ocr-and-documents': { name: '文档识别', desc: '从 PDF/扫描件提取文字（pymupdf、marker-pdf）。' },
  petdex: { name: '桌面宠物', desc: '安装和切换动画桌面宠物形象。' },
  powerpoint: { name: 'PPT 演示文稿', desc: '创建、读取、编辑 .pptx：幻灯片、备注、模板。' },
  'teams-meeting-pipeline': { name: '会议纪要', desc: '操作 Teams 会议纪要流水线：录音转写、总结。' },
  'qiji-knowledge-base': { name: '奇计知识库', desc: '自动收集、整理、检索业务知识与品牌资料，支持批量导入。' },
  // 调研
  arxiv: { name: 'arXiv 论文', desc: '按关键词、作者、分类或 ID 搜索 arXiv 论文。' },
  blogwatcher: { name: '博客监控', desc: '通过 blogwatcher-cli 监控博客与 RSS/Atom 订阅源。' },
  'llm-wiki': { name: 'LLM 知识库', desc: 'Karpathy 的 LLM Wiki：构建/查询互链 markdown 知识库。' },
  polymarket: { name: 'Polymarket', desc: '查询 Polymarket：市场、价格、订单簿、历史。' },
  'research-paper-writing': { name: '论文写作', desc: '为 NeurIPS/ICML/ICLR 写机器学习论文：从设计到投稿。' },
  // 智能家居
  openhue: { name: '飞利浦 Hue', desc: '通过 OpenHue 命令行控制飞利浦 Hue 灯光、场景、房间。' },
  // 社交媒体
  xurl: { name: 'X (Twitter)', desc: '通过 xurl 命令行操作 X/Twitter：发帖、搜索、私信、媒体。' },
  // 软件开发
  'hermes-agent-skill-authoring': { name: '技能编写', desc: '编写仓库内 SKILL.md：frontmatter、校验器、结构与写法。' },
  'node-inspect-debugger': { name: 'Node.js 调试', desc: '通过 --inspect + Chrome DevTools 协议调试 Node.js。' },
  plan: { name: '规划模式', desc: '规划模式：写可执行的 markdown 计划，不直接动代码。' },
  'python-debugpy': { name: 'Python 调试', desc: 'Python 调试：pdb 交互 + debugpy 远程（DAP 协议）。' },
  'requesting-code-review': { name: '提交前审查', desc: '提交前审查：安全扫描、质量门禁、自动修复。' },
  'simplify-code': { name: '代码精简', desc: '并行 3 个子代理清理最近的代码改动。' },
  spike: { name: '技术验证', desc: '用一次性实验在正式开发前验证想法可行性。' },
  'systematic-debugging': { name: '系统化调试', desc: '四阶段根因调试法：先理解 bug 再动手修。' },
  'test-driven-development': { name: '测试驱动开发', desc: 'TDD：强制红-绿-重构循环，测试先行。' },
  // 元宝
  yuanbao: { name: '元宝群', desc: '元宝群操作：@成员、查群信息/成员列表。' }
}
