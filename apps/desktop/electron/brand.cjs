// 品牌配置单一事实源 —— 贴牌（白标）改名只改这里。
// 消费方：electron/qiji/*（运行时解析数据目录）+ installer/build-installer.cjs
// （编译期生成 BrandInfo.cs 注入 launcher3/uninstall，并给 install.ps1 注入默认值）。
module.exports = {
  dataDirName: 'qiji',
  userDataDirName: 'Qiji',
  displayName: '螃蟹AI',
  defaultName: '螃蟹AI'
}
