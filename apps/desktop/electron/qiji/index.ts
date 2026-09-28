// qiji 商业层统一入口（主进程侧）。
// 上游同步注意：本目录（electron/qiji/）是商业层隔离区，上游没有对应文件，
// 每次 merge upstream 不会触碰这里；接线点只在 main.ts 的 qiji 标记块内。
//
// 用法（main.ts）：
//   import { registerQijiIpc } from './qiji'
//   registerQijiIpc({ hermesHome, rememberLog, getMainWindow, getTray, ... })  // 模块顶层,与 registerFsIpc 同区
//   registerQijiWallpaperScheme()   // 必须在 app ready 之前（与 MEDIA_PROTOCOL 同窗口）
//   registerQijiWallpaperProtocol() // app ready 后（与 registerMediaProtocol 同区）
import { registerQijiBrandIpc, appBrandName, brandText } from './oem-brand'
import { registerQijiClientUpdateIpc } from './client-update'
import { registerQijiDiagnosticsIpc } from './diagnostics'
import { registerQijiListDirIpc } from './list-dir'
import { registerQijiSkillMarketIpc } from './skill-market'
import {
  registerQijiWallpaperIpc,
  registerQijiWallpaperProtocol,
  registerQijiWallpaperScheme
} from './wallpaper'

export {
  appBrandName,
  brandText,
  registerQijiWallpaperProtocol,
  registerQijiWallpaperScheme
}

export interface QijiIpcDeps {
  hermesHome: string
  rememberLog: (text: string) => void
  /** 主窗口获取器（可能已被销毁/关闭）。用于更新进度推送与 OEM 标题。 */
  getMainWindow: () => {
    isDestroyed?(): boolean
    setTitle(t: string): void
    webContents?: { send?(channel: string, payload: unknown): void }
  } | null
  /** 托盘获取器（可能未创建/已销毁）。用于 OEM tooltip。 */
  getTray: () => { isDestroyed(): boolean; setToolTip(t: string): void } | null
  /** 诊断快照用：当前 hermes 版本（dev=仓库解析，打包=app.getVersion()）。 */
  resolveHermesVersion: () => string
  /** 诊断快照用：安装标记（bootstrap marker）读取器。 */
  readBootstrapMarker: () => unknown
}

export function registerQijiIpc(deps: QijiIpcDeps): void {
  registerQijiBrandIpc({ getTray: deps.getTray, getMainWindow: deps.getMainWindow })
  registerQijiClientUpdateIpc({ getMainWindow: deps.getMainWindow, rememberLog: deps.rememberLog })
  registerQijiDiagnosticsIpc({
    hermesHome: deps.hermesHome,
    rememberLog: deps.rememberLog,
    resolveHermesVersion: deps.resolveHermesVersion,
    readBootstrapMarker: deps.readBootstrapMarker
  })
  registerQijiListDirIpc({ hermesHome: deps.hermesHome })
  registerQijiSkillMarketIpc({ hermesHome: deps.hermesHome, rememberLog: deps.rememberLog })
  registerQijiWallpaperIpc()
}
