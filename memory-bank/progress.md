# progress.md — renderer-rebase 滚动书签

> 模式：轻量滚动（每天收工追加一段，不删旧段；git 才是完整账本，这里只存"git 讲不了的现状"）
> 恢复入口：PROJECTS.md → 本文件 → 最新交接文档 → git log 核实

## 📌 当前状态（2026-10-08 14:40）

- **分支**: feat/coral-redesign（HEAD ec8b763181）
- **版本**: 0.20.4 已打包部署 D:\crab AI（09:01 构建，FileDescription=螃蟹AI 实锤）
- **等用户验收**（昨晚已装机，清单在 memory/2026-10-08-brand-purge-todo.md）:
  1. 任务栏悬停/右键 = 螃蟹AI（固定过的需解除重固定）
  2. 设置→外观→「珊瑚螃蟹」皮肤（新视觉的钥匙）
  3. 技能与工具：胶囊大类+分类圆片+卡片网格
  4. 插件页：仅 5 张中文卡（hideCatalog 已藏 489 上游插件）
  5. 技能市场能点开（aa5b906484 修了 market 模式被吞）

## 近两日滚动战绩（珊瑚皮肤线，10-07→10-08）

- 29273cd867 珊瑚螃蟹皮肤落地（奶油白+珊瑚橙+暖褐双模式/大圆角/MiSans）
- 3bce606ee2 技能与工具页视觉 v2（卡片网格替代行列表）
- 5712a8e754 连接器/插件页同款设计语言接管
- 6f0438c346 coral 覆盖层 article 选择器补 rounded-lg（!important 压 tailwind 的坑）
- c905f03ed5 插件页 hideCatalog——上游社区目录不对客户暴露
- aa5b906484 技能市场入口无反应根修（marketActive 被 skills 分支吞）
- 品牌清洗三需求全部收口（08fe657582）：Nous Portal 隐藏/工具集中文化/任务栏品牌统一+brand.cjs 单一源
- 前情: 0.20.3 离线包 + 图标三连修 + git 面板禁用（详档 memory/2026-10-07-econnreset-stamp根修.md）

## ⬜ 下一步（按优先级）

1. **用户验收 0.20.4**（上列五项）——有问题当场修
2. **布局骨架变体决策**（卡在这）：用户看过桌面《螃蟹AI布局预览.html》三变体（A极简头像栏/B暗色工作台/C卡片工作台）未拍板——珊瑚皮肤只是颜色字体层，侧栏头像化/空态门面化是下一阶段大活，**等用户选向才动工**
3. 七牛 CDN dl.aijiqiren.vip 绑定死线 **10-11**（还剩 3 天，用户亲手做的链：DNSPod TXT→CNAME→备案核实）
4. 服务端 3 处文案旧品牌名（"硅基Claw"悬停之谜的服务端侧，另案）
5. 0.20.4 待办五项（memory/2026-10-07-econnreset-stamp根修.md 尾部）

## 已知坑（滚动期新增）

- coral 皮肤覆盖层用 !important 才能压住 tailwind 工具类（6f0438c346）
- electron-builder asar 完整性重写会用自己配置的 productName 重建 exe 资源——productName 必须是品牌名，文件名由 executableName 独立控制（0.20.4 三轮打包换来的）
- 微信 iLink 限流加剧（连发 30s 冷却），汇报发不出时改终端留言

## 历史快档

- 2026-10-01: 0.20.1 打包+9语种清洗+螃蟹rebrand（memory/2026-10-01 两份）
- 2026-10-07: ECONNRESET 根修+0.20.3 离线包+图标三连修（memory/2026-10-07 三份）
- 2026-10-08: 品牌清洗三需求收口+0.20.4（memory/2026-10-08-brand-purge-todo.md）
