import { memo, type ReactNode, useState } from 'react'

import { TabDropdown } from '@/components/ui/tab-dropdown'
import type { IconComponent } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { OverlayNavGroup } from './overlay-split-layout'

/**
 * qiji 螃蟹OPC 设置页专用：左侧竖排导航 rail（全大写+宽字距+直角）。
 *
 * 风格对标 dashboard 侧栏：UPPERCASE 标签、宽字距、直角行框、
 * 激活行左侧粗描边——与 Hermes 原版的常规小写导航形成视觉区隔。
 * 只被 SettingsView 使用；其他 Overlay 系页面不受影响。
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
        'row-hover flex w-full shrink-0 items-center justify-start gap-2 border border-transparent px-2.5 text-left transition-colors',
        nested
          ? 'ml-2 h-7 pl-2 text-[0.83rem] font-medium'
          : 'h-8 text-[0.9rem] font-semibold',
        nested
          ? active
            ? 'border-l-2 border-l-foreground bg-(--ui-row-active-background) text-foreground'
            : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
          : active
            ? 'border-l-2 border-l-foreground bg-(--ui-row-active-background) text-foreground'
            : 'text-foreground/85 hover:bg-(--chrome-action-hover)'
      )}
      data-tour={id ? `nav-${id}` : undefined}
      onClick={onClick}
      type="button"
    >
      {Icon && (
        <Icon
          className={cn('shrink-0', nested ? 'size-3.5' : 'size-4', active ? 'text-foreground/80' : 'text-muted-foreground/80')}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

export const SettingsSideRail = memo(function SettingsSideRail({ footer, groups }: SettingsSideRailProps) {
  // 单开合：collapsed 只记当前激活组是否被手动收起；非激活组永远收起。
  // 点已激活的组头 = 切换收起/展开；点其他组头 = 切过去并展开。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const activeGroup = groups.find(group => group.active)
  const activeGroupId = activeGroup?.id
  // 激活组从未手动收起时默认展开
  const activeExpanded = !collapsed[activeGroupId ?? '']

  return (
    <aside
      className={cn('flex w-[11.5rem] min-h-0 shrink-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-1.5 pb-3 pt-[calc(var(--titlebar-height)/2+0.5rem)]', 'max-[47.5rem]:hidden')}
      data-tour="overlay-nav"
    >
      {groups.map(group => {
        const hasChildren = Boolean(group.children?.length)
        const expanded = group.active && activeExpanded

        return (
          <div className="contents" key={group.id}>
            {group.gapBefore && <div aria-hidden className="h-2" />}
            <div className="relative">
              <RailItem
                active={group.active}
                icon={group.icon}
                id={group.id}
                label={group.label}
                onClick={() => {
                  if (group.active) {
                    // 已激活组头：切换收起/展开
                    setCollapsed(previous => ({ ...previous, [group.id]: expanded }))
                  } else {
                    // 切组：清收起标记（新组展开）
                    setCollapsed({})
                    group.onSelect()
                  }
                }}
              />
              {hasChildren && (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-(--ui-text-tertiary) transition-transform',
                    expanded && 'rotate-90'
                  )}
                >
                  <svg className="size-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                </span>
              )}
            </div>
            {hasChildren && expanded ? (
              group.children?.map(child => (
                <RailItem active={child.active} icon={child.icon} id={child.id} key={child.id} label={child.label} nested onClick={child.onSelect} />
              ))
            ) : null}
          </div>
        )
      })}
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
