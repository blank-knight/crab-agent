import { describe, expect, it } from 'vitest'

import { expertHue, toOpcExpertRows } from './experts'

// qiji 0.20.5: OPC 专家段桥接——roster 松类型投影的行为契约。
// 不测视觉，只测：字段映射优先级、缺字段回退、坏行剔除、色相稳定。
describe('toOpcExpertRows', () => {
  it('display_name 优先于 name，title 优先于 description', () => {
    const rows = toOpcExpertRows({
      profiles: [
        { name: 'geo', display_name: 'GEO 运营官', title: '品牌可见度专家', description: '落后备' }
      ]
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('GEO 运营官')
    expect(rows[0].desc).toBe('品牌可见度专家')
  })

  it('缺 display_name 回退 name；缺 title 回退 description；都缺则空串', () => {
    const [a, b] = toOpcExpertRows({
      profiles: [{ name: 'a', description: '备胎描述' }, { name: 'b', display_name: 'B' }]
    })
    expect(a.label).toBe('a')
    expect(a.desc).toBe('备胎描述')
    expect(b.desc).toBe('')
  })

  it('无名行/非字符串名剔除，不炸整表', () => {
    const rows = toOpcExpertRows({ profiles: [{ title: '孤儿' }, { name: 42 }, { name: 'ok' }] })
    expect(rows.map(r => r.name)).toEqual(['ok'])
  })

  it('worker_session.last_active 数值透传，非数值忽略', () => {
    const [a, b] = toOpcExpertRows({
      profiles: [{ name: 'a', worker_session: { last_active: 1700000000 } }, { name: 'b', worker_session: null }]
    })
    expect(a.lastActive).toBe(1700000000)
    expect(b.lastActive).toBeUndefined()
  })

  it('null/undefined/非数组 profiles → 空表', () => {
    expect(toOpcExpertRows(null)).toEqual([])
    expect(toOpcExpertRows(undefined)).toEqual([])
    expect(toOpcExpertRows({ profiles: 'oops' as unknown as [] })).toEqual([])
  })
})

describe('expertHue', () => {
  it('同名同色（稳定），不同名大概率异色', () => {
    expect(expertHue('geo')).toBe(expertHue('geo'))
    expect(expertHue('geo')).toBeLessThan(360)
    expect(expertHue('geo')).toBeGreaterThanOrEqual(0)
  })
})
