import { describe, expect, it } from 'vitest'

import { SKILL_ZH, TOOLSET_ZH } from '@/app/skills/translations'

import { categoryZh, skillDescZh, skillNameZh, toolsetZh } from './zh-display'

// qiji 0.20.4: 中文映射层回归——真源 translations.ts（140 条技能 + 31 工具集 +
// brandText 品牌链），本测试断言薄壳正确转发 + 未收录 key 原样回退（新技能免疫）。
describe('zh-display 薄壳（真源 translations.ts）', () => {
  it('技能名/描述走真源翻译', () => {
    expect(skillNameZh('powerpoint', 'PowerPoint')).toBe(SKILL_ZH.powerpoint?.name ?? 'PowerPoint')
    expect(skillDescZh('powerpoint', 'old')).toBe(SKILL_ZH.powerpoint?.description ?? 'old')
  })

  it('hermes-agent 技能名带品牌链（不再裸 Hermes Agent）', () => {
    const name = skillNameZh('hermes-agent', 'Hermes Agent')
    expect(name).not.toBe('Hermes Agent')
    expect(name.length).toBeGreaterThan(0)
  })

  it('未收录技能回退英文原样', () => {
    expect(skillNameZh('brand-new-skill', 'Brand New Skill')).toBe('Brand New Skill')
    expect(skillDescZh('brand-new-skill', 'Some english desc')).toBe('Some english desc')
    expect(categoryZh('unknown-cat')).toBe('unknown-cat')
  })

  it('分类中文映射', () => {
    expect(categoryZh('productivity')).toBe('效率办公')
    expect(categoryZh('research')).toBe('调研')
  })

  it('工具集映射走 TOOLSET_ZH 真源', () => {
    const expected = TOOLSET_ZH.web?.label ?? 'Web Search & Scraping'
    expect(toolsetZh('web', 'Web Search & Scraping')).toBe(expected)
    expect(toolsetZh('custom-plugin-ts', 'Custom Plugin')).toBe('Custom Plugin')
  })
})
