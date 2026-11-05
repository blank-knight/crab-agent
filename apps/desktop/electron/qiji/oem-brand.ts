// OEM 贴牌品牌：渲染进程登录后推送（hermes:oem-brand:set）。空=官方默认。
// 托盘 tooltip / 窗口标题等主进程可见文案从这里取。
// 上游同步注意：qiji 隔离区模块（见 electron/qiji/brand.ts 头注）。
import { ipcMain } from 'electron'

import { BRAND } from './brand'

export interface OemBrandState {
  name: string
  logo: string
}

export interface QijiBrandDeps {
  getTray: () => { isDestroyed(): boolean; setToolTip(t: string): void } | null
  getMainWindow: () => { isDestroyed?(): boolean; setTitle(t: string): void } | null
}

const oemBrandState: OemBrandState = { name: '', logo: '' }

export function appBrandName(): string {
  return oemBrandState.name.trim() || BRAND.defaultName
}

/** 把文案里的默认名替换为当前贴牌名（无贴牌=原样） */
export function brandText(text: string): string {
  const name = appBrandName()

  return name === BRAND.defaultName ? text : text.split(BRAND.defaultName).join(name)
}

export function registerQijiBrandIpc({ getTray, getMainWindow }: QijiBrandDeps): void {
  ipcMain.handle('hermes:oem-brand:set', async (_event, brand: { name?: unknown; logo?: unknown }) => {
    const name = typeof brand?.name === 'string' ? brand.name : ''
    const logo = typeof brand?.logo === 'string' ? brand.logo : ''
    oemBrandState.name = name
    oemBrandState.logo = logo
    const display = appBrandName()

    try {
      const tray = getTray()

      if (tray && !tray.isDestroyed()) {
        tray.setToolTip(display)
      }
    } catch {
      // ignore
    }

    try {
      const win = getMainWindow()
      const destroyed = win?.isDestroyed ? win.isDestroyed() : false

      if (win && !destroyed) {
        win.setTitle(display)
      }
    } catch {
      // ignore
    }

    return { ok: true }
  })
}
