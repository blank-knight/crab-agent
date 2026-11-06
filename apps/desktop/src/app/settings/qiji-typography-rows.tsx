// qiji: 外观页 qiji 专属行——界面字体预设 / 全局字号 / 自定义壁纸。
// 本分支 appearance-settings 是 i18n 化新版(上游是硬编码中文版),这三行
// 以独立组件嫁接进 typography 分区,不整取上游文件。
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { applyUserFont } from '@/themes/apply-user-font'
import { FONT_PRESETS, getFontPreset, readStoredFontPref, writeStoredFontPref } from '@/themes/font-presets'
import {
  applyUserWallpaper,
  readWallpaperPref,
  type UserWallpaperPref,
  writeWallpaperPref
} from '@/themes/user-wallpaper'

import { ListRow } from './primitives'

const inputReset =
  'h-1 w-40 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary) accent-(--dt-primary)'

export function QijiTypographyRows() {
  const [fontPreset, setFontPreset] = useState(() => readStoredFontPref() ?? 'theme-default')
  const [wallpaper, setWallpaper] = useState<UserWallpaperPref | null>(() => readWallpaperPref())

  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      return Number(window.localStorage.getItem('qiji-font-scale')) || 1.25
    } catch {
      return 1.25
    }
  })

  // 字号缩放: 用户全局字号(0.85-1.5),覆盖主题 baseSize(context.tsx 启动恢复,这里实时调)
  useEffect(() => {
    document.documentElement.style.setProperty('--dt-base-size', `${(0.875 * fontScale).toFixed(3)}rem`)

    try {
      window.localStorage.setItem('qiji-font-scale', String(fontScale))
    } catch {
      // localStorage 不可用只影响下次启动恢复
    }
  }, [fontScale])

  const pickWallpaper = async () => {
    const result = await window.hermesDesktop?.wallpaper?.pick()

    if (!result) {
      return
    }

    const pref: UserWallpaperPref = { file: result.file, scrim: 55, size: 'cover' }
    setWallpaper(pref)
    writeWallpaperPref(pref)
    applyUserWallpaper(result.url, pref)
  }

  const clearWallpaper = () => {
    setWallpaper(null)
    writeWallpaperPref(null)
    applyUserWallpaper(null, null)
  }

  return (
    <>
      <ListRow
        action={
          <select
            className="rounded-lg border border-(--ui-stroke-tertiary) bg-transparent px-2 py-1 text-[length:var(--conversation-caption-font-size)]"
            onChange={event => {
              const id = event.target.value
              setFontPreset(id)
              writeStoredFontPref(id)
              const preset = getFontPreset(id)
              applyUserFont(id === 'theme-default' ? null : (preset?.fontSans ?? null), preset?.fontUrl ?? null)
            }}
            value={fontPreset}
          >
            {FONT_PRESETS.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        }
        below={
          <p className="mt-1.5 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {getFontPreset(fontPreset)?.description}
            {fontPreset !== 'theme-default' && getFontPreset(fontPreset)?.fontUrl ? ' · 首次切换需联网加载字体' : ''}
          </p>
        }
        description="字体跟随主题，或单独指定（选择保存在本机，换主题不丢失）"
        title="界面字体"
      />

      <ListRow
        action={
          <div className="flex items-center gap-3">
            <input
              aria-label="字体大小"
              className={inputReset}
              max={1.5}
              min={0.85}
              onChange={event => setFontScale(Number(event.target.value))}
              step={0.05}
              type="range"
              value={fontScale}
            />
            <span className="w-11 text-right text-[length:var(--conversation-caption-font-size)] tabular-nums text-(--ui-text-tertiary)">
              {Math.round(fontScale * 100)}%
            </span>
          </div>
        }
        description="全局界面字号（85%–150%，影响所有文字，默认125%）"
        title="字体大小"
      />

      <ListRow
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => void pickWallpaper()} size="xs" variant="outline">
              选择图片…
            </Button>
            {wallpaper ? (
              <Button
                className="text-destructive hover:text-destructive"
                onClick={clearWallpaper}
                size="xs"
                variant="ghost"
              >
                清除
              </Button>
            ) : null}
          </div>
        }
        description="自定义背景图铺满整个应用（与主题解耦，纯色主题也可用）"
        title="背景壁纸"
      />
    </>
  )
}
