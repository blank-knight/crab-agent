import { beforeEach, describe, expect, test, vi } from 'vitest'

// qiji 0.20.5z+1 回归: 自定义Key权限后开不刷新 (zwttest 2026-11-18 实案)
// 红线9: 门禁"拦截前向/apikey要服务端真值二次判定"必须有调用级断言。

vi.mock('@/lib/backend', () => ({
  backendGet: vi.fn(),
  backendPost: vi.fn(),
  AUTH_API_KEY_STORE_KEY: 'qiji-auth-api-key',
  AUTH_AVATAR_KEY: 'qiji-auth-avatar',
  AUTH_IS_CUSTOM_KEY: 'qiji-auth-is-custom-key',
  AUTH_LOGIN_AT_KEY: 'qiji-auth-login-at',
  AUTH_MODE_KEY: 'qiji-auth-mode',
  AUTH_TOKEN_KEY: 'qiji-auth-token',
  AUTH_USERNAME_KEY: 'qiji-auth-username',
  TOKEN_TTL_MS: 7 * 24 * 3600 * 1000
}))

import { backendGet } from '@/lib/backend'
import { $auth, refreshCustomKeyStateFromBackend } from '@/store/auth'
import { clearOemBrand } from '@/store/oem-brand'

vi.mock('@/store/oem-brand', () => ({
  setOemBrand: vi.fn(),
  clearOemBrand: vi.fn()
}))

const mockedGet = vi.mocked(backendGet)

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  $auth.set({
    token: 'tok-1',
    username: 'u1',
    isCustomKey: false,
    allowModelSelect: true,
    platformModels: [],
    mode: 'formal',
    score: 0,
    loginAt: Date.now(),
    apiKey: null,
    avatar: null
  })
})

describe('refreshCustomKeyStateFromBackend', () => {
  test('服务端 is_custom_key=1: 同步进 store+localStorage, 返回 true', async () => {
    mockedGet.mockResolvedValueOnce({
      code: 1, msg: '', data: { is_custom_key: 1 }
    } as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(true)
    expect($auth.get().isCustomKey).toBe(true)
    expect(localStorage.getItem('qiji-auth-is-custom-key')).toBe('1')
    // 调用级断言: 必须打的是 /apikey
    expect(mockedGet).toHaveBeenCalledWith('/api/client/v1/apikey')
  })

  test('服务端 is_custom_key=0: 本地已过期的 true 快照被纠正回 false', async () => {
    $auth.set({ ...$auth.get(), isCustomKey: true })
    mockedGet.mockResolvedValueOnce({
      code: 1, msg: '', data: { is_custom_key: 0 }
    } as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(false)
    expect($auth.get().isCustomKey).toBe(false)
    expect(localStorage.getItem('qiji-auth-is-custom-key')).toBe('0')
  })

  test('网络失败: 静默保持现状, 返回当前本地值', async () => {
    $auth.set({ ...$auth.get(), isCustomKey: true })
    mockedGet.mockRejectedValueOnce(new Error('offline') as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(true)
    expect($auth.get().isCustomKey).toBe(true)
  })

  test('响应缺 is_custom_key 字段: 不动 store, 返回当前本地值', async () => {
    mockedGet.mockResolvedValueOnce({
      code: 1, msg: '', data: { base_url: 'x' }
    } as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(false)
    expect($auth.get().isCustomKey).toBe(false)
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
