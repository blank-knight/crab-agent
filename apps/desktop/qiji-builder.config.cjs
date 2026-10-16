// qiji 0.20.0 打包配置 —— renderer-rebase 底座专用 overlay。
// 不改上游 electron-builder.config.cjs(零污染),由 QIJI_BUILDER_CONFIG 指定本文件。
// 差异点:品牌(brand.cjs 单一源)、win target(dir+nsis)、icon、asar unpack(dist/** 渲染层
// 加密链需要)、vendor/install.ps1 extraResources、afterPack 加密钩子。
// 用法: npx electron-builder --win --x64 --config qiji-builder.config.cjs --config.win.target=dir
'use strict'
const path = require('path')

const APP = __dirname
const VERSION = require('./package.json').version
// qiji 0.20.4: 品牌单一源——electron/brand.cjs。改名只改那一份（AUMI/exe 资源/
// nsis 快捷方式名全部从这出；主进程 main.ts 读 qiji/brand.ts 同值）。
const BRAND = require('./electron/brand.cjs')

/** @type {import("app-builder-lib").Configuration} */
module.exports = {
  electronVersion: require('./package.json').devDependencies.electron,
  appId: BRAND.appId,
  // qiji 0.20.4: productName=显示名(eb把它烙进exe FileDescription/任务栏右键
  // 名);exe文件名/安装目录走 executableName/userDataDirName(独立=Qiji,不动用户现场)。
  productName: BRAND.displayName,
  // crab 0.20.5m: exe 名走 brand.executableName(=Crab);userDataDirName(Qiji)
  // 只作 Roaming 兜底与老装机清理,两者解耦。
  executableName: BRAND.executableName || BRAND.userDataDirName,
  compression: 'maximum',
  directories: { output: 'release' },
  files: ['dist/**', 'assets/**', 'public/**', 'package.json'],
  // 渲染层大 JS 与主进程 enc 走 unpacked(qiji 加密链物理文件布局)
  asar: {
    unpack: ['**/*.node', '**/prebuilds/**', 'dist/**'],
    // qiji: 加密链把 entry 换成 dist/bootstrap.cjs(原 electron-main.cjs 转 .enc)——
    // sanity check 还按 package.json main(electron-main.mjs) 找文件必炸,关掉
    disableSanityCheck: true
  },
  extraResources: [
    { from: 'build/install-stamp.json', to: 'install-stamp.json' },
    { from: 'build/native-deps', to: 'native-deps' },
    { from: 'assets/icon.ico', to: 'icon.ico' },
    { from: '../../scripts/install.ps1', to: 'install.ps1' },
    { from: 'build/vendor', to: 'vendor' }
  ],
  // eb27 把 rebuild 开关收进 nativeModules 组;禁掉 rebuild(本机无 VS BuildTools,
  // 且不需要:asar 只收 dist/**,原生树由 beforePack 从 build/native-deps 预编译产物拷入)。
  nativeModules: { npmRebuild: false, nodeGypRebuild: false },
  // 上游 beforePack:清残 appOutDir + 拷 node-pty 原生树到 dist/node_modules(运行时硬依赖)
  beforePack: 'scripts/before-pack.mjs',
  // qiji 0.20.4: exe 版本资源烙印(FileDescription/ProductName=品牌名)——
  // 上游 electron-builder.config.cjs 同款钩子,qiji overlay 此前漏挂导致 exe
  // 顶着 stock "Qiji/Nous Research" 出厂(任务栏右键名/文件属性页全错)。
  afterExtract: 'scripts/after-extract.mjs',
  // qiji 加密钩子(渲染层 RC4 + 主进程 bootstrap);QIJI_OBF_SEED 未设=dev 明文跳过
  afterPack: 'scripts/afterpack-encrypt.cjs',
  win: {
    target: ['dir'],
    icon: 'assets/icon.ico',
    legalTrademarks: BRAND.displayName
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    shortcutName: BRAND.displayName,
    uninstallDisplayName: BRAND.displayName,
    warningsAsErrors: false
  }
}
