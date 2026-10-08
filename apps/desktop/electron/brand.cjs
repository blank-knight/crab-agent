// 品牌配置单一事实源 —— 贴牌（白标）改名只改这里。
// 消费方：electron/qiji/*（运行时解析数据目录）+ installer/build-installer.cjs
// （编译期生成 BrandInfo.cs 注入 launcher3/uninstall，并给 install.ps1 注入默认值）。
module.exports = {
  dataDirName: 'qiji',
  userDataDirName: 'Qiji',
  displayName: '螃蟹OPC',
  defaultName: '螃蟹OPC',
  // exe 版本资源 CompanyName / LegalCopyright（set-exe-identity.mjs 消费）
  companyName: 'Qiji',
  // Windows AUMI（toast 通知 + 任务栏分组；须与 qiji-builder.config.cjs appId 一致）
  appId: 'com.qiji.desktop'
}
