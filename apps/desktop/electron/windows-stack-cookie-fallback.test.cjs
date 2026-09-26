const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  alreadyHasDisableGpu,
  buildDisableGpuRelaunchArgs,
  decideWindowsGpuStackCookieLaunch,
  gpuStackCookieFallbackMarker,
  gpuStackCookieMarkerPath,
  isWindowsStackCookieExit,
  readGpuStackCookieMarker,
  shouldRelaunchForRendererStackCookieCrashLoop,
  shouldSurfaceErrorForRendererStackCookieCrashLoop,
  WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME,
  WINDOWS_STACK_COOKIE_EXIT,
  writeGpuStackCookieMarker
} = require('./windows-stack-cookie-fallback.cjs')

test('isWindowsStackCookieExit 识别有符号退出码', () => {
  assert.equal(isWindowsStackCookieExit(-1073740791), true)
  assert.equal(isWindowsStackCookieExit(WINDOWS_STACK_COOKIE_EXIT), true)
})

test('isWindowsStackCookieExit 识别无符号 STATUS_STACK_BUFFER_OVERRUN', () => {
  assert.equal(isWindowsStackCookieExit(0xc0000409), true)
})

test('isWindowsStackCookieExit 拒绝 STATUS_BREAKPOINT（sandbox 专属退出码）', () => {
  assert.equal(isWindowsStackCookieExit(-2147483645), false)
})

test('isWindowsStackCookieExit 拒绝无关值与非有限数', () => {
  assert.equal(isWindowsStackCookieExit(1), false)
  assert.equal(isWindowsStackCookieExit(Number.NaN), false)
  assert.equal(isWindowsStackCookieExit(Number.POSITIVE_INFINITY), false)
  assert.equal(isWindowsStackCookieExit('nope'), false)
  assert.equal(isWindowsStackCookieExit(undefined), false)
})

test('shouldRelaunchForRendererStackCookieCrashLoop 命中问题签名时触发', () => {
  assert.equal(
    shouldRelaunchForRendererStackCookieCrashLoop({
      platform: 'win32',
      reason: 'crashed',
      exitCode: -1073740791,
      alreadyGpuDisabled: false,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    true
  )
})

test('shouldRelaunchForRendererStackCookieCrashLoop 非 Windows 平台不触发', () => {
  const base = {
    reason: 'crashed',
    exitCode: -1073740791,
    alreadyGpuDisabled: false,
    relaunchAttempted: false,
    gpuOverrideOff: false
  }

  assert.equal(shouldRelaunchForRendererStackCookieCrashLoop({ ...base, platform: 'linux' }), false)
  assert.equal(shouldRelaunchForRendererStackCookieCrashLoop({ ...base, platform: 'darwin' }), false)
})

test('shouldRelaunchForRendererStackCookieCrashLoop oom/killed 不触发', () => {
  const base = {
    platform: 'win32',
    exitCode: -1073740791,
    alreadyGpuDisabled: false,
    relaunchAttempted: false,
    gpuOverrideOff: false
  }

  assert.equal(shouldRelaunchForRendererStackCookieCrashLoop({ ...base, reason: 'oom' }), false)
  assert.equal(shouldRelaunchForRendererStackCookieCrashLoop({ ...base, reason: 'killed' }), false)
})

test('shouldRelaunchForRendererStackCookieCrashLoop GPU 已禁时不触发', () => {
  assert.equal(
    shouldRelaunchForRendererStackCookieCrashLoop({
      platform: 'win32',
      reason: 'crashed',
      exitCode: -1073740791,
      alreadyGpuDisabled: true,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    false
  )
})

test('shouldRelaunchForRendererStackCookieCrashLoop 本进程已重启过不触发', () => {
  assert.equal(
    shouldRelaunchForRendererStackCookieCrashLoop({
      platform: 'win32',
      reason: 'crashed',
      exitCode: -1073740791,
      alreadyGpuDisabled: false,
      relaunchAttempted: true,
      gpuOverrideOff: false
    }),
    false
  )
})

test('shouldRelaunchForRendererStackCookieCrashLoop GPU 覆盖显式关闭时不触发', () => {
  assert.equal(
    shouldRelaunchForRendererStackCookieCrashLoop({
      platform: 'win32',
      reason: 'crashed',
      exitCode: -1073740791,
      alreadyGpuDisabled: false,
      relaunchAttempted: false,
      gpuOverrideOff: true
    }),
    false
  )
})

test('decideWindowsGpuStackCookieLaunch sticky/版本重探测/fail-open 全覆盖', () => {
  const sticky = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    env: {},
    appVersion: '1.2.3'
  })

  assert.equal(sticky.enable, true)
  assert.equal(sticky.nextMarker.state, 'fallback')

  const linux = decideWindowsGpuStackCookieLaunch({
    platform: 'linux',
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    env: {},
    appVersion: '1.2.3'
  })

  assert.equal(linux.enable, false)

  const overrideOff = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    env: { HERMES_DESKTOP_DISABLE_GPU: '0' },
    appVersion: '1.2.3'
  })

  assert.equal(overrideOff.enable, false)

  const reprobe = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    env: {},
    appVersion: '1.3.0'
  })

  assert.equal(reprobe.enable, false)
  marker_reprobe = reprobe.nextMarker
  assert.equal(marker_reprobe.state, 'booting')
  assert.equal(marker_reprobe.reprobe, true)

  const legacy = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    marker: { state: 'fallback' },
    env: {},
    appVersion: '1.3.0'
  })

  assert.equal(legacy.enable, true)
})

test('alreadyHasDisableGpu 尊重 argv 与 HERMES_DESKTOP_DISABLE_GPU', () => {
  assert.equal(alreadyHasDisableGpu(['--foo', '--disable-gpu'], {}), true)
  assert.equal(alreadyHasDisableGpu([], { HERMES_DESKTOP_DISABLE_GPU: '1' }), true)
  assert.equal(alreadyHasDisableGpu([], { HERMES_DESKTOP_DISABLE_GPU: 'true' }), true)
  assert.equal(alreadyHasDisableGpu(['--disable-gpu-compositing'], {}), false)
  assert.equal(alreadyHasDisableGpu(['--no-sandbox'], {}), false)
})

test('buildDisableGpuRelaunchArgs 追加唯一一份 GPU-off 参数对', () => {
  assert.deepEqual(buildDisableGpuRelaunchArgs(['--foo', '--disable-gpu', 'hermes://x']), [
    '--foo',
    'hermes://x',
    '--disable-gpu',
    '--disable-gpu-compositing'
  ])
})

test('decideWindowsGpuStackCookieLaunch 无 marker 时也尊重 argv --disable-gpu', () => {
  const viaArgs = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    argv: ['--disable-gpu'],
    env: {},
    marker: null,
    appVersion: '1.2.3'
  })

  assert.equal(viaArgs.enable, true)
  assert.equal(viaArgs.reason, 'already-enabled')
  assert.deepEqual(viaArgs.nextMarker, { state: 'booting' })

  const viaArgsKeepsSticky = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    argv: ['--disable-gpu'],
    env: {},
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    appVersion: '1.2.3'
  })

  assert.equal(viaArgsKeepsSticky.enable, true)
  assert.equal(viaArgsKeepsSticky.nextMarker.state, 'fallback')

  const overrideOffBeatsArgv = decideWindowsGpuStackCookieLaunch({
    platform: 'win32',
    argv: ['--disable-gpu'],
    env: { HERMES_DESKTOP_DISABLE_GPU: '0' },
    marker: { state: 'fallback', reason: 'renderer-crash-loop', version: '1.2.3' },
    appVersion: '1.2.3'
  })

  assert.equal(overrideOffBeatsArgv.enable, false)
})

test('shouldSurfaceErrorForRendererStackCookieCrashLoop GPU fallback 无法执行时为 true', () => {
  const signature = {
    platform: 'win32',
    reason: 'crashed',
    exitCode: -1073740791
  }

  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      ...signature,
      alreadyGpuDisabled: true,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    true
  )
  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      ...signature,
      alreadyGpuDisabled: false,
      relaunchAttempted: true,
      gpuOverrideOff: false
    }),
    true
  )
  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      ...signature,
      alreadyGpuDisabled: false,
      relaunchAttempted: false,
      gpuOverrideOff: true
    }),
    true
  )
  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      ...signature,
      alreadyGpuDisabled: false,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    false
  )
  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      ...signature,
      platform: 'linux',
      alreadyGpuDisabled: true,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    false
  )
  assert.equal(
    shouldSurfaceErrorForRendererStackCookieCrashLoop({
      platform: 'win32',
      reason: 'crashed',
      exitCode: -2147483645,
      alreadyGpuDisabled: true,
      relaunchAttempted: false,
      gpuOverrideOff: false
    }),
    false
  )
})

test('GPU stack-cookie marker 独立文件且可往返读写', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiji-stack-cookie-marker-'))

  try {
    assert.equal(gpuStackCookieMarkerPath(dir), path.join(dir, WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME))
    assert.equal(WINDOWS_GPU_STACK_COOKIE_MARKER_FILENAME, 'windows-gpu-stack-cookie-fallback.json')
    assert.equal(readGpuStackCookieMarker(dir), null)

    writeGpuStackCookieMarker(dir, gpuStackCookieFallbackMarker('renderer-crash-loop', '1.2.3'))
    assert.deepEqual(readGpuStackCookieMarker(dir), {
      state: 'fallback',
      reason: 'renderer-crash-loop',
      version: '1.2.3'
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
