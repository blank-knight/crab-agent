// 品牌配置单一事实源 —— 贴牌（白标）改名只改这里。
// 消费方：electron/qiji/*（运行时解析数据目录）+ installer/build-installer.cjs
// （编译期生成 BrandInfo.cs 注入 launcher3/uninstall，并给 install.ps1 注入默认值）。
//
// crab 0.20.5m: 内部代号 qiji→crab 贴牌。改了：exe 名(Crab.exe)/安装包名
// (Crab-*-Setup.exe)/公司名/AUMI/卸载注册表键。**数据目录（dataDirName/
// userDataDirName 兜底常量）刻意不动**：
//  - 引擎现场走 LOCALAPPDATA\hermes（data-paths.mjs 硬编码，与 brand 无关）；
//  - Electron userData 走 productName=螃蟹OPC（Roaming\螃蟹OPC）；
//  - qiji/Qiji 兜底只被 launcher3/uninstall 的 Defender 排除与 Roaming 清理
//    消费——老装机（0.20.5l 及以前）的数据就在那里，改了会把老现场漏扫/漏清。
//    新装机两常量实际不命中任何真实目录，纯兜底。
module.exports = {
  // 数据目录兜底名：保持 qiji（老装机兼容，见上）
  dataDirName: 'qiji',
  // Electron userData 兜底名：保持 Qiji（同上）
  userDataDirName: 'Qiji',
  displayName: '螃蟹OPC',
  defaultName: '螃蟹OPC',
  // exe 版本资源 CompanyName / LegalCopyright（set-exe-identity.mjs 消费）
  companyName: 'Crab',
  // 主程序 exe 名 = executableName（qiji-builder.config.cjs 消费）
  // 0.20.5m 起与 userDataDirName 解耦：exe 叫 Crab，Roaming 兜底还是 Qiji。
  executableName: 'Crab',
  // Windows AUMI（toast 通知 + 任务栏分组；须与 qiji-builder.config.cjs appId 一致）
  appId: 'com.crab.desktop',
  // crab 0.20.5v (B15): 首启是否跳过"本地/云端"选择门，直接本地安装。
  // 品牌产品语义：装机即本地使用；false 则恢复上游选择门。
  autoLocalBootstrap: true
}
