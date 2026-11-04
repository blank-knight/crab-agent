// qiji 0.20.4: 技能/工具集中文显示层（薄壳）——真源是 0.17 生产线移植的
// @/app/skills/translations.ts（140 条技能 + brandText 品牌链）。
// 本文件只提供自研 hub 视图用的便捷投影；后续技能翻译补 translations.ts 一处即可。
import { translateSkillField, translateToolsetField } from '@/app/skills/translations'
import { brandText } from '@/store/oem-brand'

import { CATEGORY_ZH } from './zh-catalog'

export interface SkillDisplay {
  id: string
  name: string
  desc: string
  category: string
}

export function categoryZh(category: string): string {
  // brandText：'qiji-knowledge-base' 的「奇计知识库」等含品牌占位的分类名
  // 跟随生效品牌（螃蟹OPC/贴牌名），此前直出漏替换。
  return brandText(CATEGORY_ZH[category] ?? category)
}

export function skillNameZh(name: string, fallback: string): string {
  return translateSkillField(name, 'name', fallback)
}

export function skillDescZh(name: string, fallback: string): string {
  return translateSkillField(name, 'description', fallback)
}

export function toolsetZh(name: string, fallback: string): string {
  return translateToolsetField(name, 'label', fallback)
}

/** 技能列表项的统一投影：原名保底，中文优先。 */
export function projectSkill(id: string, rawName: string, rawDesc: string, rawCategory: string): SkillDisplay {
  return {
    id,
    name: skillNameZh(id, rawName),
    desc: skillDescZh(id, rawDesc),
    category: categoryZh(rawCategory)
  }
}
