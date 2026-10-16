// 日志自检导出（qiji 自研）—— 用户反馈问题时一键打包诊断快照到桌面，把"手动拷贝
// %LOCALAPPDATA%\qiji\logs"变成点一下按钮。收集：环境信息 + 各日志尾部
// + 安装标记 + 老目录残留检测。不含任何密钥明文。
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { app, ipcMain } from 'electron'

import { BRAND } from './brand'

export interface DiagnosticsDeps {
  hermesHome: string
  rememberLog: (text: string) => void
  resolveHermesVersion: () => string
  readBootstrapMarker: () => unknown
}

function readTail(p: string, maxBytes = 64 * 1024): string {
  try {
    if (!fs.existsSync(p)) return '(文件不存在)'
    const stat = fs.statSync(p)
    const start = Math.max(0, stat.size - maxBytes)
    const fd = fs.openSync(p, 'r')
    try {
      const buf = Buffer.alloc(Math.min(stat.size, maxBytes))
      fs.readSync(fd, buf, 0, buf.length, start)
      return buf.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch (e) {
    return `(读取失败: ${(e as Error).message})`
  }
}

export function registerQijiDiagnosticsIpc({
  hermesHome,
  rememberLog,
  resolveHermesVersion,
  readBootstrapMarker
}: DiagnosticsDeps): void {
  ipcMain.handle('hermes:diagnostics:export', async () => {
    const home = app.getPath('home')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `crab-diagnostics-${stamp}.txt`
    const desktopDir = path.join(home, 'Desktop')
    const outPath = path.join(desktopDir, fileName)

    const logDir = path.join(hermesHome, 'logs')
    const sections: string[] = []
    sections.push(`==== ${BRAND.defaultName}诊断快照 ====`)
    sections.push(`导出时间: ${new Date().toISOString()}`)
    sections.push(`版本: ${resolveHermesVersion()}  Electron: ${process.versions.electron}  Node: ${process.versions.node}`)
    sections.push(`系统: ${process.platform} ${os.release()} ${process.arch}  主机: ${os.hostname()}`)
    sections.push(`数据目录: ${hermesHome}`)
    sections.push(`标记文件: ${readBootstrapMarker() ? JSON.stringify(readBootstrapMarker()) : '(缺失!)'}`)
    sections.push(`运行时长: ${Math.round(process.uptime())}s`)

    // 老目录残留检测（hermes→qiji 改名事故的痕迹）
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      const legacyHome = path.join(process.env.LOCALAPPDATA, 'hermes')
      sections.push(`旧版数据目录 ${legacyHome}: ${fs.existsSync(legacyHome) ? '存在（注意：旧数据搁浅在此）' : '无'}`)
    }

    for (const name of ['desktop.log', 'agent.log', 'gui.log', 'errors.log', 'install.log']) {
      sections.push(`\n==== ${name} (尾部 64KB) ====`)
      sections.push(readTail(path.join(logDir, name)))
    }

    const content = sections.join('\n') + '\n'
    try {
      fs.mkdirSync(desktopDir, { recursive: true })
      fs.writeFileSync(outPath, content, 'utf8')
      rememberLog(`[diagnostics] 诊断快照已导出到 ${outPath}`)
      return { ok: true, path: outPath }
    } catch (e) {
      return { ok: false, error: (e as Error).message ? (e as Error).message : String(e) }
    }
  })
}
