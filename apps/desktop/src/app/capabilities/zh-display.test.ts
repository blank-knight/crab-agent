import { describe, expect, it } from 'vitest'

import { categoryZh, projectSkill, skillDescZh, skillNameZh, toolsetZh } from './zh-display'

// qiji 0.20.4: 中文映射层回归——未收录 key 必须原样回退（新技能/插件免疫）。
describe('zh-catalog 映射层', () => {
  it('技能取中文名与中文描述', () => {
    expect(skillNameZh('powerpoint', 'PowerPoint')).toBe('PPT 演示文稿')
    expect(skillDescZh('powerpoint', 'old')).toBe('创建、读取、编辑 .pptx：幻灯片、备注、模板。')
    expect(categoryZh('productivity')).toBe('效率办公')
  })

  it('Hermes 相关技能名被中文化且描述无 Hermes 字样', () => {
    expect(skillNameZh('hermes-agent', 'Hermes Agent')).toBe('客户端配置')
    expect(skillDescZh('hermes-agent', 'Configure Hermes Agent')).not.toMatch(/Hermes/)
    expect(skillNameZh('petdex', 'petdex')).toBe('桌面宠物')
  })

  it('未收录技能回退英文原样', () => {
    expect(skillNameZh('brand-new-skill', 'Brand New Skill')).toBe('Brand New Skill')
    expect(skillDescZh('brand-new-skill', 'Some english desc')).toBe('Some english desc')
    expect(categoryZh('unknown-cat')).toBe('unknown-cat')
  })

  it('projectSkill 统一投影', () => {
    const p = projectSkill('dogfood', 'dogfood', 'Exploratory QA', 'dogfood')
    expect(p).toEqual({
      id: 'dogfood',
      name: '网页应用探查',
      desc: '对网页应用做探索性测试：找 bug、留证据、出报告。',
      category: '应用测试'
    })
  })

  it('工具集映射与 helpers 同值', () => {
    expect(toolsetZh('web', 'Web Search & Scraping')).toBe('网页搜索与抓取')
    expect(toolsetZh('memory', 'Memory')).toBe('记忆')
    expect(toolsetZh('custom-plugin-ts', 'Custom Plugin')).toBe('Custom Plugin')
  })
})
