import { describe, expect, it, vi } from 'vitest'

import { withInstallAwareTimeout } from './install-aware-timeout'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// crab 0.20.5o: 安装感知 boot 超时——bootstrap 事件续期窗口，停摆照常超时。
describe('withInstallAwareTimeout', (): void => {
  it('behaves exactly like withTimeout without a subscription', async (): Promise<void> => {
    const slow = delay(300).then(() => 'value')

    await expect(withInstallAwareTimeout(slow, 20, 'boom')).rejects.toThrow('boom')
  })

  it('passes through a fast promise with a subscription attached', async (): Promise<void> => {
    const fast = Promise.resolve('ok')
    const off = vi.fn()
    const sub = vi.fn(() => off)

    await expect(withInstallAwareTimeout(fast, 1000, 'boom', sub)).resolves.toBe('ok')
    expect(sub).toHaveBeenCalledOnce()
    expect(off).toHaveBeenCalledOnce()
  })

  it('re-arms the window on install activity instead of timing out', async (): Promise<void> => {
    // 承诺 120ms 后完成；无续期时 30ms 窗口必超时——活动信号每 15ms 一次
    const beats: Array<() => void> = []

    const sub = (onActivity: () => void) => {
      beats.push(onActivity)

      return () => undefined
    }

    const p = withInstallAwareTimeout(
      delay(120).then(() => 'installed'),
      30,
      'boom',
      sub
    )

    // 等订阅建立（同步 subscribe，但保险起见）
    await delay(1)

    const beat = setInterval(() => beats.forEach(fn => fn()), 15)

    await expect(p).resolves.toBe('installed')
    clearInterval(beat)
  })

  it('still times out when install activity goes silent', async (): Promise<void> => {
    // 订阅建立后再无事件——停摆，一个窗口后超时
    const sub = vi.fn((_onActivity: () => void) => () => undefined)

    await expect(
      withInstallAwareTimeout(
        delay(500).then(() => 'late'),
        30,
        'stalled',
        sub as unknown as () => () => void
      )
    ).rejects.toThrow('stalled')
  })

  it('forwards the underlying rejection', async (): Promise<void> => {
    const failing = Promise.reject(new Error('spawn failed'))
    const sub = vi.fn((_onActivity: () => void) => () => undefined)

    await expect(withInstallAwareTimeout(failing, 1000, 'boom', sub as unknown as () => () => void)).rejects.toThrow(
      'spawn failed'
    )
  })
})
