import { describe, expect, it } from 'vitest'

import { isConnectorSlugVisible } from './desktop-toolsets'

// qiji 0.20.5: 高级功能开关对连接器可见性的影响——纯函数断言
describe('isConnectorSlugVisible + advancedFeatures', () => {
  it('开发者连接器默认隐藏（可用/关闭/未知态），开关打开后放出', () => {
    for (const slug of ['gitlab', 'jira', 'linear']) {
      expect(isConnectorSlugVisible(slug, 'available', false), `${slug} 可用态应默认隐藏`).toBe(false)
      expect(isConnectorSlugVisible(slug, 'off', false), `${slug} 关闭态应默认隐藏`).toBe(false)
      expect(isConnectorSlugVisible(slug, 'unknown', false), `${slug} 未知态应默认隐藏`).toBe(false)
      expect(isConnectorSlugVisible(slug, 'available', true), `${slug} 开关后应可见`).toBe(true)
    }
  })

  it('用户正在用的不藏——已连接系四种状态一律保留', () => {
    for (const state of ['connected', 'connecting', 'broken', 'expired'] as const) {
      expect(isConnectorSlugVisible('gitlab', state, false), `gitlab ${state} 态不应隐藏`).toBe(true)
    }
  })

  it('普通连接器不受影响', () => {
    expect(isConnectorSlugVisible('github', 'available', false)).toBe(true)
    expect(isConnectorSlugVisible('notion', 'available', false)).toBe(true)
  })
})
