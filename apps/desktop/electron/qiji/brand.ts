// qiji 品牌配置单一事实源 —— 贴牌（白标）改名只改这里。
// 消费方：electron/qiji/*（运行时解析数据目录）+ installer/build-installer.cjs
// （编译期生成 BrandInfo.cs 注入 launcher3/uninstall，并给 install.ps1 注入默认值）。
// 新增字段时同步更新 build-installer.cjs 的 BrandInfo.cs 生成段。
//
// 上游同步注意：本目录（electron/qiji/）是商业层隔离区，上游没有对应文件，
// 每次 merge upstream 不会触碰这里；接线点只在 main.ts 的三处 qiji 标记块内。
export const BRAND = {
  // Windows 数据目录：%LOCALAPPDATA%\<dataDirName>；类 Unix：~/.<dataDirName>
  // （vendor、venv、会话、日志全在这里；Defender 排除目标也是它）
  dataDirName: 'qiji',
  // Electron userData（Roaming）目录名 —— 跟 productName 走，卸载器用它清登录态
  userDataDirName: 'Qiji',
  // 默认产品显示名（OEM 未推送时用）
  defaultName: '螃蟹AI'
} as const
