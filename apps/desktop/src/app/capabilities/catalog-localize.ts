// qiji 0.20.4: CatalogEntry 中文化投影——行/卡/详情的显示字段中文化。
// 未收录条目回退原值（新技能/插件自动免疫）。
//
// ⛔ 身份字段不可动：entry.name 是安装身份（installedByName/officialFor 的匹配键），
// 本层只写显示字段（nameZh/descZh），渲染层读显示字段、逻辑层读身份字段。
// （教训：首轮直接改 entry.name 导致 officialFor 的 name 回退匹配断链、Add 开关失效。）
//
// 真源也是 @/app/skills/translations.ts（catalog-card 同款 translateSkillField），
// 本层只补 categoryLabel/search 的目录侧投影。
import { CATEGORY_ZH } from './zh-catalog'
import { SKILL_ZH } from '@/app/skills/translations'
import { PLUGIN_ZH } from './plugins-zh'

import type { CatalogEntry } from './catalog/catalog-data'

/** 中文显示字段（加在条目上的可选中文化投影）。 */
export interface LocalizedFields {
  nameZh?: string
  descZh?: string
}

export type LocalizedEntry = CatalogEntry & LocalizedFields

/** 单条目录条目的中文投影（浅拷贝；无翻译返回原引用）。
 * 技能查 SKILL_ZH；插件目录条目查 PLUGIN_ZH（同一 CatalogBrowser 双 kind）。 */
export function localizeCatalogEntry<T extends CatalogEntry>(entry: T): T & LocalizedFields {
  const zh = SKILL_ZH[entry.name] ?? PLUGIN_ZH[entry.name]
  if (!zh) {
    return entry
  }
  return {
    ...entry,
    nameZh: zh.name,
    descZh: zh.description,
    // 线上目录的 overview 是长英文——详情页显示中文摘要优先。
    overview: zh.description ?? entry.overview,
    categoryLabel: CATEGORY_ZH[entry.category] ?? entry.categoryLabel,
    // 搜索索引带上中文，保证中文关键词能搜到（filterCatalog 读 search 字段）。
    search: `${entry.search} ${zh.name} ${zh.description}`
  }
}

/** 批量投影（保持顺序与引用稳定性）。 */
export function localizeCatalogEntries<T extends CatalogEntry>(entries: readonly T[]): (T & LocalizedFields)[] {
  return entries.map(localizeCatalogEntry)
}

/** 渲染层统一出口：显示名优先中文，身份字段永远原样。 */
export function displayName(entry: LocalizedEntry): string {
  return entry.nameZh ?? entry.name
}

export function displayDesc(entry: LocalizedEntry): string {
  return entry.descZh ?? entry.description
}
