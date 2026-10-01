import { memo, type ReactNode } from 'react'

import { TabDropdown } from '@/components/ui/tab-dropdown'
import type { IconComponent } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { OverlayNavLink, OverlayNavGroup } from './overlay-split-layout'

/**
 * qiji 螃蟹AI 设置页专用：右侧竖排导航 rail（全大写+宽字距+直角）。
 *
 * 与 Hermes 原版设置页（左侧 13rem 常规导航）镜像分置——导航在右，
 * 视觉风格对标 dashboard 侧栏：UPPERCASE 标签、1.2px 字距、直角行框、
 * 激活行左侧粗描边。只被 SettingsView 使用；其他 Overlay 系页面不受影响。
 *
 * 激活分组带子项时，子页以缩进行展开（默认跟随激活分组展开）。
 */

interface SettingsSideRailProps {
  footer?: ReactNode
  groups: OverlayNavGroup[]
}

function RailItem({
  active,
  icon: Icon,
  id,
  label,
  nested,
  onClick
}: {
  active: boolean
  icon: IconComponent
  id: string
  label: string
  nested?: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'row-hover flex w-full shrink-0 items-center justify-start gap-2 border border-transparent px-2.5 text-left font-medium uppercase tracking-[0.075em] transition-colors',
        nested ? 'ml-2 h-6 pl-2 text-[0.64rem]' : 'h-7 text-[0.69rem]',
        active
          ? 'border-l-2 border-l-foreground bg-(--ui-row-active-background) text-foreground'
          : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      )}
      data-tour={id ? `nav-${id}` : undefined}
      onClick={onClick}
      type="button"
    >
      {Icon && (
        <Icon
          className={cn('shrink-0', nested ? 'size-3' : 'size-3.5', active ? 'text-foreground/80' : 'text-muted-foreground/80')}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

export const SettingsSideRail = memo(function SettingsSideRail({ footer, groups }: SettingsSideRailProps) {
  return (
    <aside
      className={cn('flex w-[11rem] min-h-0 shrink-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-1.5 pb-3 pt-[calc(var(--titlebar-height)/2+0.5rem)]', 'max-[47.5rem]:hidden')}
      data-tour="overlay-nav"
    >
      {groups.map(group => (
        <div key={group.id} className="contents">
          {group.gapBefore && <div aria-hidden className="h-2" />}
          <RailItem active={group.active} icon={group.icon} id={group.id} label={group.label} onClick={group.onSelect} />
          {group.children?.map(child => (
            <RailItem active={child.active} icon={child.icon} id={child.id} key={child.id} label={child.label} nested onClick={child.onSelect} />
          ))}
        </div>
      ))}
      {footer && <div className="mt-auto flex items-center gap-1 pt-2">{footer}</div>}
    </aside>
  )
})

/** 窄屏（<47.5rem）降级：TabDropdown 下拉，与 OverlayNav 窄形态同款语义。 */
export function SettingsNarrowNav({ footer, groups }: SettingsSideRailProps) {
  return (
    <>
      <TabDropdown
        align="start"
        items={groups.flatMap(group => [
          {
            active: group.active && !group.children?.some(child => child.active),
            icon: group.icon,
            id: group.id,
            label: group.label,
            onSelect: group.onSelect,
            separatorBefore: group.gapBefore
          },
          ...(group.children ?? []).map(child => ({
            active: child.active,
            icon: child.icon,
            id: child.id,
            indent: true,
            label: child.label,
            onSelect: child.onSelect
          }))
        ])}
      />
      {footer}
    </>
  )
}
