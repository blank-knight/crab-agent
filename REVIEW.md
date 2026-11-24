# Review instructions — renderer-rebase (螃蟹OPC 桌面客户端 · 唯一活跃仓,11-24收敛)

> 参照 Anthropic Code Review 方法论定制。审 PR/分支/提交前先读这份，配合 `AGENTS.md`（贡献准则与已知坑）使用。
> 版本: 2026-11-17 v1

## Passes（三通道并行，每条 finding 打通道标签）

**Bugs**：逻辑错误、边界破坏、回归、竞态、资源泄漏。
**Security**：注入面、凭证处理（.env/profile 密钥）、加密链（blob: 协议/asar 加密）、权限边界、跨账号隔离。
**Compliance**：改动是否符合任务意图（对照提交说明）；是否符合本仓铁律（见下"本仓红线"）。

## 证据纪律（每条 finding 必须附证明）

- 每条发现必须带：**文件:行号 + 为什么错 + 触发路径**（什么输入/操作会踩到）。三者缺一 = 丢弃，不发。
- 禁止"感觉/可能/建议看看"类意见。要么给出可复现路径，要么闭嘴。
- **自我验证**：发 Finding 前先自己反驳一次——"这个是不是有意设计？改动者为什么会这么写？"查 `git log -p -S` 看原意，防把 intentional design 当 bug。

## 严重度分级

- **Critical**：会炸生产/装机（安装失败、白屏、数据丢失、跨账号泄漏、升级断链）
- **Important**：特定条件下行为错误、性能劣化、依赖墙
- **Nit**：风格/命名/微小优化。**每次 review 最多报 5 条 nit，其余汇总成一句计数**。

## 本仓红线（Bugs/Compliance 通道必查项）

### 红线 14 · 结构雷区——高被引文件与循环依赖（11-23 代码体检出土）

**机械触发**：本红线随 AGENTS.md 自动注入，凡在 qiji-fork 内改代码即生效。

改到下列文件/区域 → 验证义务自动升级，**无需任何人提醒**：

**A. 循环依赖环（动前必看加载顺序/初始化竞态）**
- 环1: `store/session.ts ↔ thread-loading.ts ↔ app/types.ts ↔ chat-messages.ts ↔ media.ts`（session.ts 88 引 god node，主干道环）
- 环2: composer 五件套 `focus.ts ↔ inline-refs.ts ↔ types.ts ↔ use-composer-actions.ts ↔ chat-runtime.ts`
- 环3: `lib/backend.ts ↔ store/auth.ts`（白屏事故案发地：blob: 加密链冲突曾在此爆发）

**B. God files（被引数=回归面）**

| 文件 | 被引 | 改它= |
|---|---|---|
| src/lib/utils.ts | 142 | 全仓最泛用工具，任何签名变化波及 142 处 |
| src/i18n/index.ts + context.tsx | 123+115 | i18n 全链路，且 context 在环1 邻域 |
| src/store/session.ts | 88 | 环1 成员，双雷叠加 |
| src/types/hermes.ts | 77 | 类型层，下游全量重编译 |
| src/hermes.ts | 66 | 白屏事故链起点 |
| src/components/ui/button.tsx | 71 | UI 基件，所有页面回归 |

**动作**：改动命中 A/B → (1) typecheck 四段全跑（单段绿=假绿）(2) 改环内文件时自检"我的 import 是否加深环" (3) 大重构合并后重照体检（触发条件：b1 回流级/结构 bug 现身/季度兜底）

**证据**：graphify AST 全量体检 2026-11-23 @ 1103b1c363（47k 符号/111k 边，零 token）；图本体 qiji-fork/graphify-out/graph.json（已 gitignore）；完整报告 knowledge-vault articles/AI/code-graph-vs-knowledge-graph-20261123.md

1. **Electron 主进程改动必须过 `tsc --build tsconfig.electron.json`**（或 apps/desktop `npm run typecheck`）——不编译就声称完成 = 未完成
2. **渲染层加密链**：资产引用不得破坏 blob: 协议；改动产物要对照加密前 dist 验证（白屏 Invalid URL 分诊见 qiji-renderer-encryption-chain skill）
3. **双树纪律**：renderer-rebase 有 WSL + /mnt/d 双工作树，scripts 动手前两树互核，别只改一边
4. **打包链**：三段式 rebuild 模板 + 四 env 齐配（SEED 全 32/CJS_MAIN/双镜像/PAYLOAD_VERSION），npm scripts 半条链曾产崩包
5. **玻璃双链都要断**、出厂中文/玻璃关闭只走 b1 线不回流 main
6. **删除类提交必须对被删文案做零计数 grep 审计**（add.html+edit.html+JS+controller 全 sibling——772ea96 漏删一行三天后才暴露的教训）
7. **改动状态类页面**：grep 页面里定义的状态类有没有被 JS 真正引用（白定义=雷）
8. **测试文件**：fix 任务中不得顺手改测试来"让测试通过"（发现测试被改弱 = Critical）
9. **声称的行为必须有调用级断言，stub 不等于覆盖**：提交说明声称的副作用（重启网关/写盘/发通知），测试必须断言它被真正调用（次数+关键参数）；只把它 stub 掉跑绿不算覆盖。状态机类新增端点的测试不得 100% 用 Fake 替身——HTTP 契约测试与状态机单元测试是两个交付物，Fake 全替=状态机未测（2331a9eb05 试点审查确立：restart 被删测试仍绿的漏网模式）
10. **升级链**：同签名才能保数据；安装器改动要考虑老版本升级路径（NSIS 旧卸载器不吃 /S 的坑）
11. **镜像类 diff 必须对照被镜像类的后续修复**：提交自称"Mirrors X"时，`git log -p` 追源类在本提交之后的 bug fix，镜像副本未同步的修复点=高置信发现（46e8590206 QQ 副本漏掉 `_poll_lock` 实案——同日微信侧修的竞态，抄自己的代码最可靠的 bug 预言就是源类的补丁历史）
12. **onboarding/配对类端点的并发模型显式审查**：凡"锁内取 session、锁外 await poll"的形状，追问 poll 自身是否可并发；会话级锁≠会话方法线程安全（静态信号：`pop(` 后跟 `await session.`）
13. **同步回调引入首个 await = 在事件循环上开并发**：原本全同步的用户交互回调（onPress/onClick/submit 拦截器）里加入第一个 await 后，快速重复操作即并发执行。发 PR 前三闸自检，缺一发不出：①去重闸（in-flight 单例，重复触发共享同一次请求）②超时闸（AbortSignal.timeout，黑洞网络不得挂默认 300s）③代数守卫（auth generation，换账号后旧会话在飞响应不得写回新账号 store）——a9b55bb226 四条 Important 全部由此模式产生

## 明确不报（Do not report）

- 生成文件（dist/、release/win-unpacked、vendor 树）
- CI 已覆盖的格式/类型问题（typecheck 绿了就不报类型 nit）
- 上游 hermes-agent 的历史遗留（除非本次改动触碰且加剧）
- jsdom 环境敏感的存量红测试（先 stash 基线对照，数字一致=存量不是新引入）

## 验证证据要求（PR 前自查，review 时核对）

改动者必须在提交说明/汇报里带**真实执行输出**（不是描述）：
- TS 改动：typecheck 通过输出
- 渲染层改动：vitest 定向跑的通过数（记住三件套：`--environment jsdom` + `--dir src` + 后台跑）
- Python 改动：对应 pytest/实际调用输出
- UI 改动：截图或 CDP 量测数据（electron-renderer-cdp-verification skill）
- 安装器/打包：7zr t 结果 + WIN 侧 EXIT=0

缺证据 = review 直接打回，不进内容审查。

## 收敛规则（防审改死循环）

- 同类问题一次全部指出（去重后按严重度排序输出）
- 修复轮次 >3：停下来重新想思路（系统性debugging skill），不再逐条打补丁
- 第二轮起只审新增改动，不重复已接受的旧 finding
- 已接受过的意见不翻烧饼

## 反馈闭环（reviewer 侧义务）

同一错误**第二次**在任何 PR 里被审出 → 必须提议把它写进 AGENTS.md 对应小节（或本文件红线区），让下一个 PR 起自动拦截。Review 结束时汇报："本轮有无值得固化的新规则"。

## 审查器校准记录（clean-PR 基准）

| 日期 | 被审提交 | 结果 |
|---|---|---|
| 2026-11-17 | 46e8590206（QQ+飞书 onboarding，发布数周稳定） | 0 误报；1 真 bug（QQ poll 竞态，已修+回归测试）+2 有效 Nit（飞书死字段/启用平台零断言，待办） |
