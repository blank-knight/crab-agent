// qiji 0.20.4: CatalogEntry 中文化投影——自研「技能与工具」页所有行/卡/详情
// 的名字、描述、分类统一过这层。未收录条目回退原值（新技能/插件自动免疫）。
import { CATEGORY_ZH, SKILL_ZH } from './zh-catalog'

import type { CatalogEntry } from './catalog/catalog-data'

/** 单条目录条目的中文投影（浅拷贝，字段级替换）。 */
export function localizeCatalogEntry(entry: CatalogEntry): CatalogEntry {
  const zh = SKILL_ZH[entry.name]
  return {
    ...entry,
    name: zh?.name ?? entry.name,
    description: zh?.desc ?? entry.description,
    // 线上目录的 overview 是长英文——没有翻译表时也压掉，避免详情页大段英文。
    // 有中文描述的条目用中文描述同时充当 overview。
    overview: zh?.desc ?? entry.overview,
    categoryLabel: CATEGORY_ZH[entry.category] ?? entry.categoryLabel,
    // 搜索索引带上中文，保证中文关键词能搜到（search 字段被 filterCatalog 用）。
    search: zh ? `${entry.search} ${zh.name} ${zh.desc}` : entry.search
  }
}

/** 批量投影（保持顺序与引用稳定性：无翻译的条目返回原引用）。 */
export function localizeCatalogEntries(entries: readonly CatalogEntry[]): CatalogEntry[] {
  return entries.map(e => (SKILL_ZH[e.name] ? localizeCatalogEntry(e) : e))
}
