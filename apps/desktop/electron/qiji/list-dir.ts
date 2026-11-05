// hermes:listDir（qiji 自研）——技能市场辅助：列 HERMES_HOME 下相对目录。
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import fs from 'node:fs'
import path from 'node:path'

import { ipcMain } from 'electron'

export interface ListDirDeps {
  hermesHome: string
}

export function registerQijiListDirIpc({ hermesHome }: ListDirDeps): void {
  ipcMain.handle('hermes:listDir', async (_event, relPath: unknown) => {
    const rel = String(relPath || '').replace(/\\/g, '/')

    if (rel.includes('..')) {throw new Error('invalid path')}
    const dir = path.join(hermesHome, rel)

    if (!fs.existsSync(dir)) {return []}

    return fs.readdirSync(dir, { withFileTypes: true }).map(d => ({ name: d.name, isDirectory: d.isDirectory() }))
  })
}
