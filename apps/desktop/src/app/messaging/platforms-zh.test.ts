import { describe, expect, it } from 'vitest'

import { groupPlatformsByRegion, platformRegion } from './platforms-zh'

// qiji 0.20.5: 消息平台地域分组——国内置顶（产品主打国内）。
// 行为契约：分组顺序恒定 cn→overseas→other，空组不出列，未知 id 落「其他」。
describe('groupPlatformsByRegion', () => {
  const p = (id: string) => ({ id })

  it('国内平台在首位，海外其后，其余归「其他」', () => {
    const groups = groupPlatformsByRegion([p('telegram'), p('feishu'), p('api_server'), p('weixin'), p('discord')])

    expect(groups.map(g => g.id)).toEqual(['cn', 'overseas', 'other'])
    expect(groups[0].platforms.map(x => x.id)).toEqual(['feishu', 'weixin'])
    expect(groups[1].platforms.map(x => x.id)).toEqual(['telegram', 'discord'])
    expect(groups[2].platforms.map(x => x.id)).toEqual(['api_server'])
    expect(groups[0].label).toBe('国内平台')
    expect(groups[1].label).toBe('海外平台')
    expect(groups[2].label).toBe('其他接入')
  })

  it('组内顺序保持传入顺序（稳定分组，不重排）', () => {
    const groups = groupPlatformsByRegion([p('dingtalk'), p('weixin')])
    expect(groups[0].platforms.map(x => x.id)).toEqual(['dingtalk', 'weixin'])
  })

  it('空组不出列', () => {
    expect(groupPlatformsByRegion([p('weixin')]).map(g => g.id)).toEqual(['cn'])
    expect(groupPlatformsByRegion([])).toEqual([])
  })

  it('未知新平台落「其他」——上游新增不丢失', () => {
    const groups = groupPlatformsByRegion([p('brand-new-platform')])
    expect(groups[0].id).toBe('other')
    expect(groups[0].platforms[0].id).toBe('brand-new-platform')
  })

  it('platformRegion 单点判定', () => {
    expect(platformRegion('weixin')).toBe('cn')
    expect(platformRegion('qqbot')).toBe('cn')
    expect(platformRegion('telegram')).toBe('overseas')
    expect(platformRegion('webhook')).toBe('other')
  })
})
