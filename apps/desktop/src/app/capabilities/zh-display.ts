// qiji 0.20.4: 技能/工具集中文显示层——所有新UI从这里取名，未收录回退英文原样。
import { CATEGORY_ZH, SKILL_ZH, TOOLSET_ZH } from './zh-catalog'

export function categoryZh(category: string): string {
  return CATEGORY_ZH[category] ?? category
}

export function skillNameZh(name: string, fallback: string): string {
  return SKILL_ZH[name]?.name ?? fallback
}

export function skillDescZh(name: string, fallback: string): string {
  return SKILL_ZH[name]?.desc ?? fallback
}

export function toolsetZh(name: string, fallback: string): string {
  return TOOLSET_ZH[name] ?? fallback
}

/** 技能列表项的统一投影：原名保底，中文优先。 */
export interface SkillDisplay {
  id: string
  name: string
  desc: string
  category: string
}

export function projectSkill(id: string, rawName: string, rawDesc: string, rawCategory: string): SkillDisplay {
  return {
    id,
    name: skillNameZh(id, rawName),
    desc: skillDescZh(id, rawDesc),
    category: categoryZh(rawCategory)
  }
}
