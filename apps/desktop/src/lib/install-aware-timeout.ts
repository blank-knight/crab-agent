import { TimeoutError, withTimeout } from './with-timeout'

/**
 * crab 0.20.5o: 安装感知的 boot 超时。
 *
 * 为什么：BACKEND_BOOT_WAIT_TIMEOUT_MS（180s）陪的是后端冷启动，不是
 * 安装。首装/引擎升级重铺期间主进程在跑 install.ps1（3-10 分钟），
 * getWindowBackend 不会返回——渲染层 180s 一刀切超时，把正在安装的
 * 用户弹到 "Timed out connecting to Hermes backend" 报错页（0.20.5n
 * 装机实锤）。安装覆盖层在展示进度，boot 不该在背后拆台。
 *
 * 语义：无订阅时行为与 withTimeout 完全一致；有订阅时——每收到一次
 * 活动信号（bootstrap 事件）就把超时窗口重置为一个完整窗口。安装
 * 正常推进（事件持续）→ 不超时；安装停摆（事件流静默一个完整窗口）
 * → 照常超时暴露故障。不会无限挂起。
 *
 * 契约：subscribeActivity(onActivity) 返回退订函数——与
 * desktop.onBootstrapEvent(cb) => () => void 同形，可直接传入。
 */
export async function withInstallAwareTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  subscribeActivity?: (onActivity: () => void) => () => void
): Promise<T> {
  if (!subscribeActivity) {
    return withTimeout(promise, timeoutMs, message)
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = (fn: () => void) => {
      if (settled) {
        return
      }

      settled = true

      if (timer) {
        clearTimeout(timer)
      }

      off?.()
      fn()
    }

    // 活动信号 → 续期一个完整窗口（幂等重置）
    const arm = () => {
      if (settled) {
        return
      }

      if (timer) {
        clearTimeout(timer)
      }

      timer = setTimeout(() => {
        settle(() => reject(new TimeoutError(message)))
      }, timeoutMs)

      if (typeof timer.unref === 'function') {
        timer.unref()
      }
    }

    const off = subscribeActivity(arm)

    promise.then(
      value => settle(() => resolve(value)),
      error => settle(() => reject(error))
    )

    arm()
  })
}
