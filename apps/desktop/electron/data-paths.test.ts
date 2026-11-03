import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

import { afterEach, test, vi } from 'vitest'

import { platformDefaultHermesHome, resolveDesktopHermesHome, resolveDesktopUserData } from './data-paths'
import { controlSocketPath } from './ssh-connection'

afterEach((): void => {
  vi.unstubAllEnvs()
})

test.skipIf(process.platform === 'win32')('local SSH sockets use the suffixed default root', (): void => {
  vi.stubEnv('HERMES_DATA_DIR_SUFFIX', 'magic-test')
  const socket: string = controlSocketPath('user', 'host', 22)

  assert.equal(path.dirname(socket), path.join(platformDefaultHermesHome(os.homedir()), 'desktop-ssh'))
})

test('default data roots append the suffix literally on each platform', (): void => {
  for (const platform of ['linux', 'darwin', 'win32'] as const) {
    const paths: typeof path = platform === 'win32' ? path.win32 : path.posix
    const home: string = platform === 'win32' ? 'C:\\Users\\test' : '/home/test'
    const local: string = paths.join(home, 'AppData', 'Local')
    const userData: string = paths.join(home, 'app-data', 'Hermes')
    const base: string = platform === 'win32' ? paths.join(local, 'hermes') : paths.join(home, '.hermes')

    for (const suffix of ['', '-asdfasdf', 'magic-test', ' spaced ']) {
      const env: NodeJS.ProcessEnv = { LOCALAPPDATA: local, HERMES_DATA_DIR_SUFFIX: suffix }

      assert.equal(platformDefaultHermesHome(home, env, platform), base + suffix)
      assert.equal(resolveDesktopUserData(userData, env), userData + suffix)
      assert.equal(
        resolveDesktopHermesHome({ home, env, platform, directoryExists: (): boolean => false }),
        base + suffix
      )
    }
  }
})

test('explicit homes and userData retain precedence, and suffixed Windows homes never use legacy state', (): void => {
  const home: string = '/home/test'

  const env: NodeJS.ProcessEnv = {
    HERMES_DATA_DIR_SUFFIX: 'magic-test',
    HERMES_HOME: '/explicit/home',
    HERMES_DESKTOP_USER_DATA_DIR: '/explicit/electron'
  }

  assert.equal(resolveDesktopUserData('/default/electron', env), path.resolve(env.HERMES_DESKTOP_USER_DATA_DIR!))
  assert.equal(resolveDesktopHermesHome({ home, env, platform: 'linux' }), env.HERMES_HOME)
  delete env.HERMES_HOME
  assert.equal(resolveDesktopHermesHome({ home, env, platform: 'linux' }), '/explicit/electron/hermes-home')

  const windowsHome: string = 'C:\\Users\\test'
  const windowsEnv: NodeJS.ProcessEnv = { HERMES_DATA_DIR_SUFFIX: 'magic-test' }
  const expected: string = path.win32.join(windowsHome, 'AppData', 'Local', 'hermesmagic-test')

  assert.equal(
    resolveDesktopHermesHome({
      home: windowsHome,
      env: windowsEnv,
      platform: 'win32',
      directoryExists: (): boolean => true
    }),
    expected
  )
  assert.equal(
    resolveDesktopHermesHome({
      home: windowsHome,
      env: windowsEnv,
      platform: 'win32',
      readWindowsHome: (): string => 'C:\\custom'
    }),
    'C:\\custom'
  )
})

// crab 0.20.5u (B1 fix): the Windows legacy-home chain must match install.ps1's
// CRAB_HOME → QIJI_HOME → HERMES_HOME order, or first-launch bootstrap stages
// the engine under qiji\ while the desktop keeps resolving hermes\ (bug B1:
// bootstrap-complete → re-resolve finds nothing → infinite bootstrap loop).
test('win32 legacy home chain: CRAB_HOME beats QIJI_HOME, missing dirs fall through to the default', (): void => {
  const home: string = 'C:\\Users\\test'
  const expectedDefault: string = path.win32.join(home, 'AppData', 'Local', 'hermes')

  // QIJI_HOME (process env) pointing at an existing dir captures the resolve.
  const qijiEnv: NodeJS.ProcessEnv = { QIJI_HOME: 'C:\\Users\\test\\AppData\\Local\\qiji' }
  const qijiDir: string = 'C:\\Users\\test\\AppData\\Local\\qiji'

  assert.equal(
    resolveDesktopHermesHome({
      home,
      env: qijiEnv,
      platform: 'win32',
      directoryExists: (dir: string): boolean => dir === qijiDir
    }),
    qijiDir
  )

  // CRAB_HOME wins over QIJI_HOME when both exist.
  const crabDir: string = 'C:\\Users\\test\\AppData\\Local\\crab'

  assert.equal(
    resolveDesktopHermesHome({
      home,
      env: { CRAB_HOME: crabDir, QIJI_HOME: qijiDir },
      platform: 'win32',
      directoryExists: (dir: string): boolean => dir === qijiDir || dir === crabDir
    }),
    crabDir
  )

  // A legacy var whose target directory no longer exists must NOT capture a
  // fresh install — fall through to the default.
  assert.equal(
    resolveDesktopHermesHome({
      home,
      env: { QIJI_HOME: 'C:\\gone\\qiji' },
      platform: 'win32',
      directoryExists: (): boolean => false
    }),
    expectedDefault
  )

  // Persisted User-scope values (registry) feed the same chain: QIJI_HOME from
  // the registry with an existing dir captures before the HERMES_HOME registry
  // fallback.
  assert.equal(
    resolveDesktopHermesHome({
      home,
      env: {},
      platform: 'win32',
      directoryExists: (dir: string): boolean => dir === qijiDir,
      readWindowsHome: (name: string): string | null => (name === 'QIJI_HOME' ? qijiDir : null)
    }),
    qijiDir
  )

  // Registry QIJI_HOME pointing at a missing dir falls through to the
  // HERMES_HOME registry fallback.
  assert.equal(
    resolveDesktopHermesHome({
      home,
      env: {},
      platform: 'win32',
      directoryExists: (): boolean => false,
      readWindowsHome: (name: string): string | null =>
        name === 'QIJI_HOME' ? 'C:\\gone\\qiji' : 'C:\\custom'
    }),
    'C:\\custom'
  )
})
