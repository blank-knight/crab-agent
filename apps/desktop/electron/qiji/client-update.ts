// 客户端 URL 更新（qiji 自研，fa_version 通道）：从 PHP 后端发布的下载直链
// 下载安装包并运行。离线包无 git 仓库，更新统一走
// GET /api/client/v1/update/check → downloadurl。
//
// downloadInstallerFile: 断点续传 + 自动重试（2026-09-13 战果）：
//   - 每次尝试若本地已有部分文件，带 Range: bytes=<已收>- 续传
//   - 网络错误自动重试（最多 8 次，间隔 2s 起指数退避到 20s）
//   - 服务器不支持 Range（回了 200 而非 206）→ 清空重下
//   - 最终以 Content-Length 对账，短了视为失败重试
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'

import { app, ipcMain, shell } from 'electron'

export interface ClientUpdateDeps {
  getMainWindow: () => {
    webContents?: { send?(channel: string, payload: unknown): void }
    isDestroyed?(): boolean
  } | null
  rememberLog: (text: string) => void
}

export interface DownloadProgress {
  received: number
  total: number
  percent: number
}

function installerDownloadDir(): string {
  return path.join(app.getPath('temp'), 'crab-updates')
}

function sanitizeInstallerName(rawUrl: string): string {
  let name = ''

  try {
    name = decodeURIComponent(new URL(rawUrl).pathname.split('/').filter(Boolean).pop() || '')
  } catch {
    name = ''
  }

  // Strip anything that could escape the updates dir; keep a boring filename.
  name = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)

  // No usable extension (e.g. a bare CDN path) → assume the published
  // installer; otherwise keep whatever the publisher named it (.exe/.msi/.zip).
  if (!/\.[a-zA-Z0-9]{1,5}$/.test(name)) {
    name = `${name || 'crab-setup'}.exe`
  }

  return name
}

function downloadInstallerAttempt(
  rawUrl: string,
  onProgress: ((p: DownloadProgress) => void) | undefined,
  redirectsLeft: number,
  attemptNo: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL

    try {
      parsed = new URL(String(rawUrl))
    } catch {
      reject(new Error('无效的下载地址'))
      return
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      reject(new Error(`不支持的下载协议: ${parsed.protocol}`))
      return
    }

    const client = parsed.protocol === 'https:' ? https : http

    const reqHeaders: Record<string, string> = {}
    // 续传起点由文件现状决定（首次尝试也检查——上次会话的半截文件可续）
    const dir = installerDownloadDir()
    const filePath = path.join(dir, sanitizeInstallerName(rawUrl))

    fs.promises
      .stat(filePath)
      .then(stat => ({ start: stat.size }))
      .catch(() => ({ start: 0 }))
      .then(({ start }) => {
        if (start > 0) {
          reqHeaders['Range'] = `bytes=${start}-`
          console.log(`[client-update] resuming from ${start} bytes (attempt ${attemptNo})`)
        }

        // temp 目录（而非安装目录旁的 userData/updates）——下载中的文件
        // 不能出现在安装器要覆盖的目录树附近，且 temp 由系统负责清理。
        return fs.promises.mkdir(dir, { recursive: true }).then(() => start)
      })
      .then(start => {
        // fail 由 response 回调赋值;超时可能在响应到来前触发(原 CJS 在此处
        // 引用内层 fail 会 ReferenceError,TS 编译期抓获——这里外提治本)。
        let fail: undefined | ((err: Error) => void)
        const req = client.request(parsed, { method: 'GET', headers: reqHeaders }, res => {
          const status = res.statusCode || 0

          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()

            if (redirectsLeft <= 0) {
              reject(new Error('下载地址重定向次数过多'))
              return
            }

            try {
              const next = new URL(res.headers.location, parsed).toString()
              // 重定向后 Range 头不自动跟随，交给下一轮 attempt 处理
              downloadInstallerAttempt(next, onProgress, redirectsLeft - 1, attemptNo).then(resolve, reject)
            } catch {
              reject(new Error('无效的重定向地址'))
            }
            return
          }

          if (status >= 400) {
            res.resume()
            // 416 = Range 起点超过文件末尾——多半是本地文件已完整，核对大小后直接用
            if (status === 416) {
              const cl = Number((res.headers['content-range'] as string | undefined)?.split('/')[1] || 0)
              if (cl > 0 && start >= cl) {
                resolve(filePath)
                return
              }
            }
            reject(new Error(`下载失败 (HTTP ${status})`))
            return
          }

          const resumed = status === 206 // Partial Content = 服务器接受续传
          if (start > 0 && !resumed) {
            // 服务器不理会 Range（回 200 全量）→ 本地半截文件作废
            start = 0
          }

          const total = Number(res.headers['content-length'] || 0) + (resumed ? start : 0)
          let received = resumed ? start : 0
          let lastReported = received
          let settled = false

          const done = (err: Error | null, result?: string) => {
            if (settled) return
            settled = true
            if (err) reject(err)
            else resolve(result as string)
          }

          fail = err => {
            try { req.destroy() } catch { /* already gone */ }
            done(err)
          }

          const out = fs.createWriteStream(filePath, { flags: resumed ? 'a' : 'w' })

          res.on('data', chunk => {
            received += chunk.length

            // Throttle progress events to ~4/s; 500MB installers would
            // otherwise flood the IPC channel.
            if (onProgress && received - lastReported >= 250_000) {
              lastReported = received
              onProgress({
                received,
                total,
                percent: total > 0 ? Math.floor((received / total) * 100) : 0
              })
            }
          })
          res.on('error', fail)
          res.on('end', () => {
            if (total > 0 && received < total) {
              // 连接正常关闭但字节不够（对端提前断）——交由上层重试续传
              fail(new Error(`下载不完整 (${received}/${total})`))
              return
            }
            if (onProgress) {
              onProgress({ received, total: total || received, percent: 100 })
            }
          })

          out.on('error', fail)
          out.on('finish', () => done(null, filePath))
          res.pipe(out)
        })

        req.on('error', reject)
        // Idle timeout — resets on data; a stalled CDN link aborts in 60s.
        req.setTimeout(60_000, () => {
          const err = new Error('下载超时')
          if (fail) fail(err)
          else {
            try { req.destroy() } catch { /* already gone */ }
            reject(err)
          }
        })
        req.end()
      })
      .catch(reject)
  })
}

// Stream the installer to <temp>/qiji-updates/<name>. Follows redirects
// (CDN/OSS download links commonly 302). Reports progress as
// { received, total, percent } — percent is 0 when the server sends no
// Content-Length (chunked), the renderer then shows an indeterminate bar.
function downloadInstallerFile(
  rawUrl: string,
  onProgress: ((p: DownloadProgress) => void) | undefined
): Promise<string> {
  const MAX_ATTEMPTS = 8
  const attempt = (n: number): Promise<string> =>
    downloadInstallerAttempt(rawUrl, onProgress, 5, n).catch(err => {
      if (n >= MAX_ATTEMPTS) {
        throw new Error(`下载失败（已重试 ${MAX_ATTEMPTS} 次）: ${err.message}`)
      }
      const delay = Math.min(2000 * Math.pow(2, n - 1), 20000)
      console.log(`[client-update] attempt ${n} failed (${err.message}), retrying in ${delay}ms`)
      return new Promise(r => setTimeout(r, delay)).then(() => attempt(n + 1))
    })
  return attempt(1)
}

export function registerQijiClientUpdateIpc({ getMainWindow, rememberLog }: ClientUpdateDeps): void {
  const sendProgress = (payload: DownloadProgress) => {
    try {
      const win = getMainWindow()
      const destroyed = win?.isDestroyed ? win.isDestroyed() : false
      if (win && !destroyed) {
        win.webContents?.send?.('hermes:clientUpdate:progress', payload)
      }
    } catch { /* window may be mid-teardown while quitting */ }
  }

  ipcMain.handle('hermes:clientUpdate:downloadAndRun', async (_event, rawUrl: unknown) => {
    const url = String(rawUrl || '').trim()

    if (!/^https?:\/\//i.test(url)) {
      throw new Error('无效的下载地址')
    }

    const filePath = await downloadInstallerFile(url, sendProgress)

    rememberLog(`[client-update] installer downloaded: ${url} -> ${filePath}`)

    const openError = await shell.openPath(filePath)

    if (openError) {
      throw new Error(`无法启动安装程序: ${openError}`)
    }

    // The running exe locks the install dir — quit so the installer can
    // overwrite in place. openPath already spawned the SFX (UAC prompt takes
    // a moment), so the quit race is benign.
    setTimeout(() => app.quit(), 1500)

    return { ok: true, path: filePath }
  })

  // —— Chrome 式静默更新：下载与安装拆开 ——

  // 只下载不运行。完成后渲染层常驻提醒，用户点了才装。
  ipcMain.handle('hermes:clientUpdate:download', async (_event, rawUrl: unknown) => {
    const url = String(rawUrl || '').trim()

    if (!/^https?:\/\//i.test(url)) {
      throw new Error('无效的下载地址')
    }

    const filePath = await downloadInstallerFile(url, sendProgress)

    rememberLog(`[client-update] installer downloaded (silent): ${url} -> ${filePath}`)

    return { ok: true, path: filePath }
  })

  // 运行已下载的安装包并退出应用（安装器覆盖安装目录需要独占）。
  ipcMain.handle('hermes:clientUpdate:runInstaller', async (_event, filePath: unknown) => {
    const target = String(filePath || '').trim()

    if (!target || !path.isAbsolute(target)) {
      throw new Error('无效的安装包路径')
    }

    // 必须落在主进程自己管理的下载目录里，防止渲染层被攻破后执行任意 exe
    const downloadDir = installerDownloadDir()

    if (path.dirname(target) !== downloadDir) {
      throw new Error('安装包路径不在下载目录内')
    }

    try {
      await fs.promises.access(target)
    } catch {
      throw new Error('安装包不存在，请重新下载')
    }

    rememberLog(`[client-update] running installer: ${target}`)

    const openError = await shell.openPath(target)

    if (openError) {
      throw new Error(`无法启动安装程序: ${openError}`)
    }

    setTimeout(() => app.quit(), 1500)

    return { ok: true }
  })
}
