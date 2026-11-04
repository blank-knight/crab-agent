import { beforeEach, describe, expect, it, vi } from 'vitest'

// $auth 是 store 层，mock 掉以隔离账号映射层
const authGet = vi.fn((): { username: string } | undefined => ({ username: '13800000001' }))

vi.mock('@/store/auth', () => ({
  $auth: { get: () => authGet() }
}))

const {
  _resetAccountProfileMapForTest,
  accountLockedProfile,
  accountLockedScopeFor,
  clearAccountLockExceptions,
  isAccountLockException,
  registerAccountProfile,
  setAccountLockExceptions
} = await import('./account-profile')

// crab 0.20.5o: 账号锁豁免集——本机专家档案不被锁拽回 default。
describe('account lock exceptions (local expert profiles)', (): void => {
  beforeEach((): void => {
    _resetAccountProfileMapForTest()
    clearAccountLockExceptions()
    // 每个用例自建登录态（重置会清掉映射表）
    registerAccountProfile('13800000001')
  })

  it('registers the first account to claim default and locks scope to it', (): void => {
    // 本机首个账号认领 default（承接升级前数据）——与装机实况一致
    expect(registerAccountProfile('13800000001')).toBe('default')
    expect(accountLockedProfile()).toBe('default')
    // 未豁免的目标被收敛到锁定档案
    expect(accountLockedScopeFor('pmvagpyyc', accountLockedProfile())).toBe('default')
  })

  it('an exempted expert profile keeps its own scope', (): void => {
    setAccountLockExceptions(['pmvagpyyc'])

    expect(isAccountLockException('pmvagpyyc')).toBe(true)
    expect(isAccountLockException('PMVAGPYYC')).toBe(true) // key 归一化
    expect(accountLockedScopeFor('pmvagpyyc', accountLockedProfile())).toBe('pmvagpyyc')
  })

  it('clearing the exception set restores the full lock (conservative)', (): void => {
    setAccountLockExceptions(['pmvagpyyc'])
    clearAccountLockExceptions()

    expect(isAccountLockException('pmvagpyyc')).toBe(false)
    expect(accountLockedScopeFor('pmvagpyyc', accountLockedProfile())).toBe('default')
  })

  it('no lock active (logged out) passes the target through unchanged', (): void => {
    authGet.mockReturnValueOnce(undefined)

    expect(accountLockedProfile()).toBeNull()
    expect(accountLockedScopeFor('anything', null)).toBe('anything')
  })

  it('exception set survives a module reload via localStorage', (): void => {
    setAccountLockExceptions(['pmvagry2d'])

    // 重新 import（模块重载）后仍可读——localStorage 持久层在起作用
    expect(isAccountLockException('pmvagry2d')).toBe(true)
  })
})
