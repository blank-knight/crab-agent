import { beforeEach, describe, expect, test, vi } from 'vitest'

// qiji 0.20.5z+1 review 加固回归（独立审查 B1-B4/S1 对应）:
// B1 in-flight 去重 / B3 会话代数守卫 / B4 401 不吞不双弹

vi.mock('@/lib/backend', () => {
  class BackendError extends Error {
    statusCode: number
    constructor(message: string, statusCode: number) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return {
    backendGet: vi.fn(),
    backendPost: vi.fn(),
    BackendError,
    AUTH_API_KEY_STORE_KEY: 'qiji-auth-api-key',
    AUTH_AVATAR_KEY: 'qiji-auth-avatar',
    AUTH_IS_CUSTOM_KEY: 'qiji-auth-is-custom-key',
    AUTH_LOGIN_AT_KEY: 'qiji-auth-login-at',
    AUTH_MODE_KEY: 'qiji-auth-mode',
    AUTH_TOKEN_KEY: 'qiji-auth-token',
    AUTH_USERNAME_KEY: 'qiji-auth-username',
    TOKEN_TTL_MS: 7 * 24 * 3600 * 1000
  }
})

import { BackendError, backendGet } from '@/lib/backend'
import {
  $auth,
  bumpAuthGeneration,
  refreshCustomKeyStateFromBackend
} from '@/store/auth'

vi.mock('@/store/oem-brand', () => ({
  setOemBrand: vi.fn(),
  clearOemBrand: vi.fn()
}))

const mockedGet = vi.mocked(backendGet)

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  $auth.set({
    token: 'tok-1', username: 'u1', isCustomKey: false, allowModelSelect: true,
    platformModels: [], mode: 'formal', score: 0, loginAt: Date.now(), apiKey: null, avatar: null
  } as never)
})

describe('review 加固: B1 in-flight 去重', () => {
  test('并发两次调用只发一条 /apikey(共享同一Promise)', async () => {
    let resolveFirst: (v: never) => void = () => {}
    mockedGet.mockImplementationOnce(() => new Promise(r => { resolveFirst = r as never }) as never)

    const p1 = refreshCustomKeyStateFromBackend()
    const p2 = refreshCustomKeyStateFromBackend()

    expect(mockedGet).toHaveBeenCalledTimes(1)

    resolveFirst({ code: 1, msg: '', data: { is_custom_key: 1 } })
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe(true)
    expect(r2).toBe(true)
    expect($auth.get().isCustomKey).toBe(true)
  })
})

describe('review 加固: B3 会话代数守卫', () => {
  test('请求在飞期间换号(bumpGeneration): 晚到响应不写入新会话 store', async () => {
    let resolveFirst: (v: never) => void = () => {}
    mockedGet.mockImplementationOnce(() => new Promise(r => { resolveFirst = r as never }) as never)

    const p = refreshCustomKeyStateFromBackend()

    // 在飞期间换号: 新会话是普通用户(isCustomKey=false)
    bumpAuthGeneration()
    $auth.set({ ...$auth.get(), username: 'user-B', isCustomKey: false } as never)

    // 旧账号响应晚到: is_custom_key=1(账号A是自定义Key用户)
    resolveFirst({ code: 1, msg: '', data: { is_custom_key: 1 } })
    const result = await p

    // 关键断言: 账号A的权限标志不得污染账号B的会话
    expect(result).toBe(false)
    expect($auth.get().isCustomKey).toBe(false)
    expect($auth.get().username).toBe('user-B')
  })
})

describe('review 加固: B4 401 不吞', () => {
  test('401: 返回false且不写store(clearAuth已由backendFetch处理,登录页接管)', async () => {
    mockedGet.mockRejectedValueOnce(new BackendError('登录已过期', 401) as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(false)
    // store 保持原样(真实场景clearAuth已清空,这里mock不模拟清空,断言函数自身不再写)
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })

  test('超时(TimeoutError非401): 静默返回本地当前值', async () => {
    $auth.set({ ...$auth.get(), isCustomKey: true } as never)
    mockedGet.mockRejectedValueOnce(new Error('The operation was aborted due to timeout') as never)

    const result = await refreshCustomKeyStateFromBackend()

    expect(result).toBe(true)
    expect($auth.get().isCustomKey).toBe(true)
  })
})
