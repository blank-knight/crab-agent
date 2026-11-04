import { memo, type ReactNode } from 'react'

import { TabDropdown } from '@/components/ui/tab-dropdown'
import { Brain, Cpu, Network, Settings2, ShieldLock, type IconComponent, Users } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { OverlayNavGroup } from './overlay-split-layout'

/**
 * qiji 螃蟹OPC 设置页专用：顶部大类标签栏 + 左侧分组 rail 的两级导航。
 *
 * 信息架构对标 dashboard：顶部一行 6 个大类（永不溢出），左侧 rail 只显示
 * 当前大类下的分组（手风琴单开合）。与 Hermes 原版"左 rail 全量平铺 23 组"
 * 的设置页形成结构性区隔。
 *
 * CATEGORY_MAP 把 23 个分组 id 归入 6 大类；未列出的分组默认进「其他」。
 */

export interface SettingsCategory {
  id: string
  label: string
  icon: IconComponent
  /** 该大类包含的分组 id 前缀（config:xxx 取 xxx 段） */
  members: string[]
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: 'general',
    label: '常规',
    icon: Settings2,
    members: ['model', 'chat', 'appearance', 'workspace']
  },
  {
    id: 'privacy',
    label: '安全与隐私',
    icon: ShieldLock,
    members: ['safety', 'browser', 'vault']
  },
  {
    id: 'connections',
    label: '连接',
    icon: Network,
    members: ['gateway', 'providers', 'keys', 'messaging']
  },
  {
    id: 'intelligence',
    label: '智能',
    icon: Brain,
    members: ['memory', 'voice', 'market']
  },
  {
    id: 'account',
    label: '账户',
    icon: Users,
    members: ['account', 'billing', 'notifications']
  },
  {
    id: 'system',
    label: '系统',
    icon: Cpu,
    members: ['about', 'sessions', 'keybinds', 'advanced']
  }
]

/** 分组 id → 大类 id（config:model → general） */
export function categoryOfGroup(groupId: string): string {
  const leaf = groupId.replace(/^config:/, '')
  for (const cat of SETTINGS_CATEGORIES) {
    if (cat.members.includes(leaf)) return cat.id
  }
  return 'system'
}

function CategoryTab({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: IconComponent
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent px-3 text-sm font-medium transition-colors',
        active
          ? 'border-(--ui-text-primary) text-foreground'
          : 'border-transparent text-(--ui-text-tertiary) hover:text-foreground'
      )}
      data-tour={`category-${label}`}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-foreground/80' : 'text-muted-foreground/80')} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
}

/** 顶部大类栏：一行 6 个大类 tab。 */
export const SettingsCategoryBar = memo(function SettingsCategoryBar({
  activeCategory,
  onSelect
}: {
  activeCategory: string
  onSelect: (categoryId: string) => void
}) {
  return (
    <div
      className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-(--ui-sidebar-border) px-1"
      data-tour="settings-categories"
    >
      {SETTINGS_CATEGORIES.map(cat => (
        <CategoryTab active={cat.id === activeCategory} icon={cat.icon} key={cat.id} label={cat.label} onClick={() => onSelect(cat.id)} />
      ))}
    </div>
  )
})

/** 窄屏降级：TabDropdown（大类粒度）。 */
export function SettingsNarrowNav({ footer, groups }: { footer?: ReactNode; groups: unknown[] }) {
  return (
    <>
      <TabDropdown
        align="start"
        items={groups.flatMap(group => [
          {
            active: (group as { active: boolean }).active,
            icon: (group as { icon: IconComponent }).icon,
            id: (group as { id: string }).id,
            label: (group as { label: string }).label,
            onSelect: (group as { onSelect: () => void }).onSelect
          }
        ])}
      />
      {footer}
    </>
  )
}
