// 壁纸系统（qiji 自研）：
//   - qiji-wallpaper:// 协议：渲染层（http dev server 或打包 file://）都能安全
//     引用本地壁纸，绕开 chromium 对 http 页面加载 file:// 资源的阻止。
//   - pick/resolve/clear IPC：选图→拷入 userData/wallpapers→data:URL 返回。
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { app, dialog, ipcMain, net, protocol } from 'electron'

const WALLPAPER_PROTOCOL = 'qiji-wallpaper'

function wallpapersDir(): string {
  return path.join(app.getPath('userData'), 'wallpapers')
}

function fileToDataUrl(p: string): string {
  const ext = path.extname(p).toLowerCase()

  return `data:image/${ext === '.jpg' ? 'jpeg' : ext.slice(1)};base64,` + fs.readFileSync(p).toString('base64')
}

/** 必须在 app ready 之前调用（与上游 MEDIA_PROTOCOL 同一注册窗口）。 */
export function registerQijiWallpaperScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: WALLPAPER_PROTOCOL,
      privileges: { secure: true, standard: true, supportFetchAPI: true }
    }
  ])
}

/** app ready 后调用。 */
export function registerQijiWallpaperProtocol(): void {
  protocol.handle(WALLPAPER_PROTOCOL, request => {
    try {
      const name = decodeURIComponent(new URL(request.url).hostname + new URL(request.url).pathname).replace(/[\\/]+/g, '')

      if (!name || /\.\./.test(name)) {return new Response('bad name', { status: 400 })}
      const p = path.join(wallpapersDir(), name)

      if (!fs.existsSync(p)) {return new Response('not found', { status: 404 })}

      return net.fetch(pathToFileURL(p).toString())
    } catch {
      return new Response('error', { status: 500 })
    }
  })
}

export function registerQijiWallpaperIpc(): void {
  ipcMain.handle('hermes:wallpaper:pick', async () => {
    const picked = await dialog.showOpenDialog({
      title: '选择背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
    })

    if (picked.canceled || !picked.filePaths[0]) {return null}
    const srcPath = picked.filePaths[0]
    const dir = wallpapersDir()
    fs.mkdirSync(dir, { recursive: true })
    const ext = path.extname(srcPath).toLowerCase() || '.png'
    const dest = path.join(dir, `wp-${Date.now()}${ext}`)
    fs.copyFileSync(srcPath, dest)

    // data: URL —— 渲染层零限制(协议/CSP全绕开),971KB图≈1.3MB base64,内存可接受
    return { file: path.basename(dest), url: fileToDataUrl(dest) }
  })

  ipcMain.handle('hermes:wallpaper:resolve', async (_event, file: unknown) => {
    const name = String(file || '').trim()

    if (!name || /[\\/]/.test(name)) {return null} // 只允许裸文件名,防路径穿越
    const p = path.join(wallpapersDir(), name)

    if (!fs.existsSync(p)) {return null}

    return fileToDataUrl(p)
  })

  ipcMain.handle('hermes:wallpaper:clear', async () => {
    const dir = wallpapersDir()

    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }

    return true
  })
}
