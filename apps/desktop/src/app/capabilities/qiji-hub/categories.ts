// qiji 0.20.4: 「技能与工具」自研页 — 大类定义（对齐设置页 SettingsCategoryBar 形状）。
// SettingsCategoryBar 硬编码 SETTINGS_CATEGORIES，这里导出同构数据给本页自己的 CategoryTab 渲染。
import { Package, Plug, Sparkles, Wrench } from '@/lib/icons'
import type { IconComponent } from '@/lib/icons'

export interface HubCategory {
  id: 'skills' | 'toolsets' | 'connectors' | 'plugins'
  label: string
  icon: IconComponent
}

export const HUB_CATEGORIES: readonly HubCategory[] = [
  { id: 'skills', label: '技能', icon: Wrench },
  { id: 'toolsets', label: '工具集', icon: Package },
  { id: 'connectors', label: '连接器', icon: Plug },
  { id: 'plugins', label: '插件', icon: Sparkles }
]
