import { describe, expect, it } from 'vitest'

import { expertHue, toOpcExpertRows } from './experts'

// qiji 0.20.5: OPC 专家段桥接——roster 松类型投影的行为契约。
// 不测视觉，只测：字段映射优先级、缺字段回退、坏行剔除、色相稳定。
// crab 0.20.5k: 优先级链修订——CreateExpertDialog 把「专家名字」写进
// ui_meta['hermes-bots'].title，所以 label 链是 ui_meta.title > row.title >
// display_name > name；desc 只读人设（description），不再拿 title 凑数
// （旧链正是「专家名永远显示 pmv9im007」的根因）。
describe('toOpcExpertRows', () => {
  it('OPC 新建专家：ui_meta.title 是名字，description 是人设', () => {
    const rows = toOpcExpertRows({
      profiles: [
        {
          name: 'pmv9im007',
          ui_meta: { 'hermes-bots': { title: '增长顾问', description: '你是一位资深增长顾问…' } }
        }
      ]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('增长顾问')
    expect(rows[0].desc).toBe('你是一位资深增长顾问…')
  })

  it('无 ui_meta 时：row.title 次优，display_name 第三，name 兜底', () => {
    const [a, b, c] = toOpcExpertRows({
      profiles: [{ name: 'a', title: '行内名' }, { name: 'b', display_name: 'B' }, { name: 'c' }]
    })

    expect(a.label).toBe('行内名')
    expect(b.label).toBe('B')
    expect(c.label).toBe('c')
  })

  it('ui_meta.title 覆盖 display_name（title 链更高）', () => {
    const rows = toOpcExpertRows({
      profiles: [{ name: 'geo', display_name: 'GEO 运营官', title: '品牌可见度专家', description: '人设描述' }]
    })

    expect(rows[0].label).toBe('品牌可见度专家')
    expect(rows[0].desc).toBe('人设描述')
  })

  it('缺 description 则 desc 空串', () => {
    const [a, b] = toOpcExpertRows({
      profiles: [
        { name: 'a', description: '备胎描述' },
        { name: 'b', display_name: 'B' }
      ]
    })

    expect(a.desc).toBe('备胎描述')
    expect(b.desc).toBe('')
  })

  it('无名行/非字符串名剔除，不炸整表', () => {
    const rows = toOpcExpertRows({ profiles: [{ title: '孤儿' }, { name: 42 }, { name: 'ok' }] })
    expect(rows.map(r => r.name)).toEqual(['ok'])
  })

  it('worker_session.last_active 数值透传，非数值忽略', () => {
    const [a, b] = toOpcExpertRows({
      profiles: [
        { name: 'a', worker_session: { last_active: 1700000000 } },
        { name: 'b', worker_session: null }
      ]
    })

    expect(a.lastActive).toBe(1700000000)
    expect(b.lastActive).toBeUndefined()
  })

  it('null/undefined/非数组 profiles → 空表', () => {
    expect(toOpcExpertRows(null)).toEqual([])
    expect(toOpcExpertRows(undefined)).toEqual([])
    expect(toOpcExpertRows({ profiles: 'oops' as unknown as [] })).toEqual([])
  })

  // crab 0.20.5l: 创建竞态契约——roster 抓到裸行（ui_meta 未达）时叠查
  // 本地 $botMeta 快照，卡片首帧就是中文名，不闪 profile id。
  // 这是「创建专家第一时间显示 pmv9im007 之后才变 test」的回归锁。
  it('裸行（无 ui_meta）+ 本地快照有 title → 首帧中文名，不闪 id', () => {
    const rows = toOpcExpertRows(
      { profiles: [{ name: 'pmv9im007' }] },
      { pmv9im007: { title: '增长顾问', description: '资深增长人设' } }
    )

    expect(rows[0].label).toBe('增长顾问')
    expect(rows[0].desc).toBe('资深增长人设')
  })

  it('服务端 ui_meta 优先于本地快照（真源说了算）', () => {
    const rows = toOpcExpertRows(
      { profiles: [{ name: 'x', ui_meta: { 'hermes-bots': { title: '服务端名' } } }] },
      { x: { title: '本地旧名' } }
    )

    expect(rows[0].label).toBe('服务端名')
  })

  it('本地快照缺该行时不影响既有回退链', () => {
    const rows = toOpcExpertRows({ profiles: [{ name: 'fresh', display_name: '在线名' }] }, {})
    expect(rows[0].label).toBe('在线名')
  })
})

describe('expertHue', () => {
  it('同名同色（稳定），不同名大概率异色', () => {
    expect(expertHue('geo')).toBe(expertHue('geo'))
    expect(expertHue('geo')).toBeLessThan(360)
    expect(expertHue('geo')).toBeGreaterThanOrEqual(0)
  })
})
