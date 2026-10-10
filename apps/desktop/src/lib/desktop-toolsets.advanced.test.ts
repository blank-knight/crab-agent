import { describe, expect, it } from 'vitest'

import { isDesktopToolsetVisible } from './desktop-toolsets'

// qiji 0.20.5: 高级功能开关对工具集可见性的影响——纯函数断言
// （dev 后端不可达时列表类 UI 无法 CDP 实测，降级为单测，见技能档案纪律）
describe('isDesktopToolsetVisible + advancedFeatures', () => {
  it('任何状态下上游隐藏集都不可见', () => {
    expect(isDesktopToolsetVisible('discord', true)).toBe(false)
    expect(isDesktopToolsetVisible('yuanbao', true)).toBe(false)
    expect(isDesktopToolsetVisible('context_engine', true)).toBe(false)
    expect(isDesktopToolsetVisible('moa', true)).toBe(false)
  })

  it('普通工具集两种状态都可见', () => {
    expect(isDesktopToolsetVisible('web', false)).toBe(true)
    expect(isDesktopToolsetVisible('web', true)).toBe(true)
    expect(isDesktopToolsetVisible('terminal', false)).toBe(true)
    expect(isDesktopToolsetVisible('file', true)).toBe(true)
  })

  it('开发者工具集默认隐藏，开关打开后放出', () => {
    for (const name of ['api', 'editor', 'safe', 'debugging', 'homeassistant', 'spotify', 'browser-real-profile']) {
      expect(isDesktopToolsetVisible(name, false), `${name} 应默认隐藏`).toBe(false)
      expect(isDesktopToolsetVisible(name, true), `${name} 开关后应可见`).toBe(true)
    }
  })

  it('默认参数=关（老调用点行为不变的部分：普通集可见）', () => {
    expect(isDesktopToolsetVisible('web')).toBe(true)
    expect(isDesktopToolsetVisible('api')).toBe(false)
  })
})
