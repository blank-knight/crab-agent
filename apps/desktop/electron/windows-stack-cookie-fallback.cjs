/**
 * Windows 渲染进程 0xC0000409 崩溃循环自愈（上游 #108047，qiji 移植版）。
 *
 * 部分 Windows 主机上渲染进程以 STATUS_STACK_BUFFER_OVERRUN
 * (`0xC0000409` / 有符号退出码 `-1073740791`，FAST_FAIL_STACK_COOKIE_CHECK_FAILURE)
 * 反复死亡。共享崩溃预算 (3 次 / 60 秒) 耗尽后窗口只会留在白屏——
 * 本模块负责识别该签名并用「一次性禁 GPU 重启」替代死窗口。
 *
 * 恢复策略（全部限定 win32 + renderer `crashed` + 该退出码）：
 *
 * 1. 一次性带禁 GPU 参数重启（按应用版本 sticky）。下次启动在 app
 *    `ready` 之前读 marker，套用与远程显示路径相同的开关
 *    （disableHardwareAcceleration + disable-gpu-compositing）。
 * 2. 若 GPU 已禁、环境变量强制关闭、或本进程已尝试过重启——不再循环；
 *    由调用方决定后续（本 fork 保留死窗口兜底日志，见 main.cjs）。
 *
 * 应用更新会重新探测一次 GPU（新 Electron 可能已修复该主机问题）。
 * 同版本内成功启动则保持 sticky fallback。
 *
 * 纯逻辑全部可注入，测试无需启动 Electron。main.cjs 里的钩子负责接线。
 *
 * 来源：上游 hermes 2e36513ef9 + 085d9ee608（MIT），TS→CJS 手动移植，
 * 逻辑与上游逐行对齐；如上游再改此文件，按需重搬。
 */

const fs = require('fs')
const path = require('path')

const WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME = 'windows-gpu-stack-cookie-fallback.json'

/** STATUS_STACK_BUFFER_OVERRUN 的有符号 Win32 退出码（WER / Chromium）。 */
const WINDOWS_STACK_COOKIE_EXIT = -1073740791

const GPU_OVERRIDE_ON = new Set(['1', 'true', 'yes', 'on'])
const GPU_OVERRIDE_OFF = new Set(['0', 'false', 'no', 'off'])
const DISABLE_GPU_SWITCH = '--disable-gpu'
const DISABLE_GPU_COMPOSITING_SWITCH = '--disable-gpu-compositing'

function gpuStackCookieMarkerPath(userDataDir) {
  return path.join(String(userDataDir || ''), WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME)
}

function isWindowsStackCookieExit(exitCode) {
  const n = Number(exitCode)

  if (!Number.isFinite(n)) {
    return false
  }

  // 有符号 STATUS_STACK_BUFFER_OVERRUN，或同一 32 位模式的无符号形式。
  return n === WINDOWS_STACK_COOKIE_EXIT || n >>> 0 === 0xc0000409
}

function isHermesDesktopGpuOverrideOff(env = process.env) {
  const override = String((env && env.HERMES_DESKTOP_DISABLE_GPU) || '')
    .trim()
    .toLowerCase()

  return GPU_OVERRIDE_OFF.has(override)
}

/**
 * 本进程是否已带禁 GPU 启动——Chromium argv（`--disable-gpu`）或
 * HERMES_DESKTOP_DISABLE_GPU 开启。镜像 sandbox 的 `alreadyHasNoSandbox`：
 * 崩溃循环重启必须传递这些开关，保证 sticky marker 写失败时下一个
 * 进程仍受保护。
 */
function alreadyHasDisableGpu(argv = [], env = process.env) {
  if (Array.isArray(argv) && argv.some(arg => arg === DISABLE_GPU_SWITCH)) {
    return true
  }

  const override = String((env && env.HERMES_DESKTOP_DISABLE_GPU) || '')
    .trim()
    .toLowerCase()

  return GPU_OVERRIDE_ON.has(override)
}

/** 重启 argv：唯一一份 `--disable-gpu` + compositing 开关。 */
function buildDisableGpuRelaunchArgs(argv) {
  const args = (Array.isArray(argv) ? argv : []).filter(
    arg => arg !== DISABLE_GPU_SWITCH && arg !== DISABLE_GPU_COMPOSITING_SWITCH
  )

  args.push(DISABLE_GPU_SWITCH, DISABLE_GPU_COMPOSITING_SWITCH)

  return args
}

function parseGpuStackCookieMarker(raw) {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const record = raw
  const state = record.state

  if (state !== 'booting' && state !== 'fallback' && state !== 'ok') {
    return null
  }

  const marker = { state }

  if (record.reason === 'renderer-crash-loop') {
    marker.reason = 'renderer-crash-loop'
  }

  if (typeof record.version === 'string' && record.version) {
    marker.version = record.version
  }

  if (record.reprobe === true) {
    marker.reprobe = true
  }

  return marker
}

function readGpuStackCookieMarker(userDataDir, { readFileSync = fs.readFileSync } = {}) {
  try {
    const raw = JSON.parse(readFileSync(gpuStackCookieMarkerPath(userDataDir), 'utf8'))

    return parseGpuStackCookieMarker(raw)
  } catch {
    return null
  }
}

function writeGpuStackCookieMarker(
  userDataDir,
  marker,
  { mkdirSync = fs.mkdirSync, writeFileSync = fs.writeFileSync } = {}
) {
  const dir = String(userDataDir || '')

  if (!dir) {
    return
  }

  mkdirSync(dir, { recursive: true })
  writeFileSync(gpuStackCookieMarkerPath(dir), `${JSON.stringify(marker)}\n`, 'utf8')
}

function gpuStackCookieFallbackMarker(reason, appVersion) {
  const marker = { state: 'fallback', reason }

  if (appVersion) {
    marker.version = appVersion
  }

  return marker
}

/**
 * 主窗口到达 ready-to-show 后：本次启动若为 #108047 禁了 GPU 则保持
 * sticky fallback，否则标记干净启动，让下次应用更新可以重新探测硬件加速。
 */
function markerAfterSuccessfulGpuStackCookieBoot(options) {
  if (!options.fallbackActive) {
    return { state: 'ok' }
  }

  return gpuStackCookieFallbackMarker('renderer-crash-loop', options.appVersion)
}

/**
 * 渲染进程崩溃循环是否带 #108047 stack-cookie 签名、且应该用一次性
 * 禁 GPU 重启替换死窗口。按退出码门控，无关崩溃循环（sandbox 断点、
 * OOM）不会静默禁 GPU；显式 GPU-off 环境覆盖也会被尊重。
 */
function shouldRelaunchForRendererStackCookieCrashLoop(options) {
  if ((options.platform ?? process.platform) !== 'win32') {
    return false
  }

  if (options.alreadyGpuDisabled || options.relaunchAttempted || options.gpuOverrideOff) {
    return false
  }

  if (String(options.reason || '') !== 'crashed') {
    return false
  }

  return isWindowsStackCookieExit(options.exitCode)
}

/**
 * #108047 签名命中但 GPU fallback 无法执行（已禁、覆盖关闭、本进程已
 * 重启过）。上游此时加载可见错误页；本 fork 无该页面设施，调用方仅
 * 记日志后维持死窗口兜底（不新增 UI）。不触碰 Chromium sandbox。
 */
function shouldSurfaceErrorForRendererStackCookieCrashLoop(options) {
  if ((options.platform ?? process.platform) !== 'win32') {
    return false
  }

  if (String(options.reason || '') !== 'crashed') {
    return false
  }

  if (!isWindowsStackCookieExit(options.exitCode)) {
    return false
  }

  return Boolean(options.alreadyGpuDisabled || options.relaunchAttempted || options.gpuOverrideOff)
}

/**
 * 启动期决策：本次 Windows 启动是否为 sticky #108047 fallback 禁 GPU，
 * 以及 marker 的下一状态。
 *
 * - `fallback` 在同一应用版本内 sticky。版本变化重新探测一次 GPU，
 *   让已修复的主机回到硬件加速。
 * - 无版本号的 marker 保持 sticky（legacy / 无版本契约）。
 * - argv 已带 `--disable-gpu`（崩溃循环重启 / Chromium 开关）时即使
 *   sticky marker 写失败也尊重之，但不会仅凭 argv 变 sticky。
 * - `HERMES_DESKTOP_DISABLE_GPU` 显式关闭（`0`/`false`/`no`/`off`）
 *   fail-open：不禁 GPU。
 */
function decideWindowsGpuStackCookieLaunch(options = {}) {
  const appVersion = String(options.appVersion || '')
  const argv = options.argv ?? process.argv
  const env = options.env ?? process.env
  const marker = options.marker ?? null

  if ((options.platform ?? process.platform) !== 'win32') {
    return { enable: false, reason: null, nextMarker: { state: 'booting' } }
  }

  if (isHermesDesktopGpuOverrideOff(env)) {
    const nextMarker = marker?.state === 'fallback' ? marker : { state: 'booting' }

    return { enable: false, reason: null, nextMarker }
  }

  // 尊重进程内已有的 `--disable-gpu` 重启（或环境覆盖），即使 sticky
  // marker 写失败。仅凭 argv 不变 sticky——marker 生命周期与 sandbox
  // 的 already-enabled 路径保持一致。
  if (alreadyHasDisableGpu(argv, env)) {
    const nextMarker = marker?.state === 'fallback' ? marker : { state: 'booting' }

    return { enable: true, reason: 'already-enabled', nextMarker }
  }

  if (marker?.state === 'fallback') {
    if (marker.version && appVersion && marker.version !== appVersion) {
      return {
        enable: false,
        reason: null,
        nextMarker: { state: 'booting', reprobe: true }
      }
    }

    return {
      enable: true,
      reason: 'sticky-fallback',
      nextMarker: { ...marker, version: marker.version || appVersion || undefined }
    }
  }

  return { enable: false, reason: null, nextMarker: { state: 'booting' } }
}

module.exports = {
  WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME,
  WINDOWS_STACK_COOKIE_EXIT,
  gpuStackCookieMarkerPath,
  isWindowsStackCookieExit,
  isHermesDesktopGpuOverrideOff,
  alreadyHasDisableGpu,
  buildDisableGpuRelaunchArgs,
  parseGpuStackCookieMarker,
  readGpuStackCookieMarker,
  writeGpuStackCookieMarker,
  gpuStackCookieFallbackMarker,
  markerAfterSuccessfulGpuStackCookieBoot,
  shouldRelaunchForRendererStackCookieCrashLoop,
  shouldSurfaceErrorForRendererStackCookieCrashLoop,
  decideWindowsGpuStackCookieLaunch
}
