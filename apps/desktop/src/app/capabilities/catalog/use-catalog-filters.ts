import { useState } from 'react'

import type { CatalogKind } from './catalog-data'
import { type CatalogFacets, type CatalogSort, EMPTY_FACETS } from './catalog-query'

type ListFacet = 'sources' | 'categories' | 'tags'

const toggled = (list: string[], value: string) =>
  list.includes(value) ? list.filter(item => item !== value) : [...list, value]

/** Rail state for one catalog. `onChange` runs after every change so the
 *  browser can drop paging and selection that no longer apply. */
export function useCatalogFilters(kind: CatalogKind, onChange: () => void) {
  // qiji 0.20.4: 插件目录默认只看已安装——上游社区目录(数百个英文插件)不对
  // 客户默认展示;需要时点「所有来源」旁的已安装开关放开。
  const [facets, setFacets] = useState(kind === 'plugins' ? { ...EMPTY_FACETS, installedOnly: true } : EMPTY_FACETS)
  const [sort, setSortState] = useState<CatalogSort>(kind === 'plugins' ? 'stars' : 'discover')

  const update = (next: (current: CatalogFacets) => CatalogFacets) => {
    setFacets(next)
    onChange()
  }

  // `null` clears the facet (its "All" row).
  const toggle = (facet: ListFacet) => (value: string | null) =>
    update(current => ({ ...current, [facet]: value === null ? [] : toggled(current[facet], value) }))

  return {
    facets,
    sort,
    setSort: (value: CatalogSort) => {
      setSortState(value)
      onChange()
    },
    toggleSource: toggle('sources'),
    toggleCategory: toggle('categories'),
    toggleTag: toggle('tags'),
    toggleInstalled: () => update(current => ({ ...current, installedOnly: !current.installedOnly })),
    // Cards and "See all" drill into one category rather than toggling it.
    chooseCategory: (value: string) => update(current => ({ ...current, categories: [value], tags: [] })),
    clear: () => update(() => EMPTY_FACETS)
  }
}
