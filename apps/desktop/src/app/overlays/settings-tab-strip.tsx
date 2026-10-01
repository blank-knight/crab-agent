import { memo, type ReactNode, useEffect, useId, useState } from 'react'

import { TabDropdown } from '@/components/ui/tab-dropdown'
import { useI18n } from '@/i18n'
import type { IconComponent } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { OverlayNavLink, OverlayNavGroup } from './overlay-split-layout'

/**
 * qiji 螃蟹AI 设置页专用：顶部横向分段标签栏（tab strip），替代左侧竖排导航。
 *
 * 视觉对标 dashboard 的页面顶部 tab 形态——与 Hermes 原版"左 rail + 右内容"
 * 的设置页布局形成明显区隔。只被 SettingsView 使用；其他 Overlay 系页面
 * （技能/定时任务/产物）继续走 OverlaySplitLayout，互不影响。
 *
 * 布局：一行大分组 tabs（图标+标签+下划线激活态），激活分组带子项时
 * 第二行渲染子页 tabs（缩进浅色）。窄屏（<47.5rem）由调用方切回 TabDropdown。
 */

interface TabStripTabsProps {
  className?: string
  children: ReactNode
}

interface SettingsTabStripProps {
  footer?: ReactNode
  groups: OverlayNavGroup[]
}

function TabItem({
  active,
  icon: Icon,
  id,
  label,
  onClick,
  small
}: {
  active: boolean
  icon: IconComponent
  id: string
  label: string
  onClick: () => void
  small?: boolean
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent font-medium transition-colors',
        small ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
        active
          ? 'border-(--ui-text-primary) text-foreground'
          : 'border-transparent text-(--ui-text-tertiary) hover:text-foreground'
      )}
      data-tour={id ? `nav-${id}` : undefined}
      onClick={onClick}
      type="button"
    >
      {Icon && (
        <Icon
          className={cn('shrink-0', small ? 'size-3.5' : 'size-4', active ? 'text-foreground/80' : 'text-muted-foreground/80')}
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

/** 顶部标签栏容器：横向滚动、底部一条整体分隔线。 */
export function TabStripTabs({ children, className }: TabStripTabsProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-(--ui-sidebar-border) px-1 pb-0',
        className
      )}
      data-tour="overlay-nav"
    >
      {children}
    </div>
  )
}

export const SettingsTabStrip = memo(function SettingsTabStrip({ footer, groups }: SettingsTabStripProps) {
  const { t } = useI18n()
  const navId = useId()
  const [disclosures, setDisclosures] = useState<Record<string, boolean>>({})
  const activeGroup = groups.find(group => group.active)
  const activeGroupId = activeGroup?.id
  const activeChild: OverlayNavLink | undefined = activeGroup?.children?.find(child => child.active)

  // Route entry reveals its branch（与 OverlayNav 同语义：离开时折叠自动展开的分支）。
  useEffect(() => {
    if (!activeGroupId) {
      return
    }

    setDisclosures(previous => {
      if (previous[activeGroupId] !== false) {
        return previous
      }

      const next = { ...previous }
      delete next[activeGroupId]

      return next
    })
  }, [activeGroupId, activeChild?.id])

  return (
    <div className="flex min-h-0 shrink-0 flex-col">
      <TabStripTabs>
        {groups.map(group => (
          <TabItem
            active={group.active}
            icon={group.icon}
            id={group.id}
            key={group.id}
            label={group.label}
            onClick={group.onSelect}
          />
        ))}
      </TabStripTabs>
      {activeGroup?.children?.length ? (
        <div className="flex items-center gap-0.5 overflow-x-auto px-2 pt-1.5 pb-1" id={`${navId}-${activeGroup.id}`}>
          {activeGroup.children.map(child => (
            <TabItem active={child.active} icon={child.icon} id={child.id} key={child.id} label={child.label} onClick={child.onSelect} small />
          ))}
        </div>
      ) : null}
      {footer && <div className="flex items-center gap-1 pt-1.5">{footer}</div>}
    </div>
  )
})

/** 窄屏（<47.5rem）降级：TabDropdown 下拉，与原 OverlayNav 窄形态同款语义。 */
export function SettingsNarrowNav({ footer, groups }: SettingsTabStripProps) {
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
