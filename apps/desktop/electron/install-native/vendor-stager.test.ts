/**
 * install-native test suite (win32-only heavy path, idempotent-contract tests
 * run everywhere the fs shim is honest).
 *
 * crab 0.20.5-af (feat/install-native-ts).
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'vitest'

import {
  robocopy,
  stageVendorFiles,
  isVendorStagingComplete
} from './vendor-stager'
import { shouldUseNativeInstall } from './native-driver'
import { writePyvenvCfg, publishHermesLaunchers, writeInstallStamp } from './pyvenv-launchers'
import { fixUvTrampolines, publishEntryPoints, fixUvTrampolinesRecovery } from './trampoline-fix'

const WIN = process.platform === 'win32'

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'install-native-'))
}

/** Fake a full vendor tree (the six components) + install target. */
function fakeVendorTree(home: string): { vendorDir: string; hermesHome: string; installDir: string } {
  const vendorDir = path.join(home, 'vendor')
  const hermesHome = path.join(home, 'hermes-home')
  const installDir = path.join(hermesHome, 'hermes-agent')

  fs.mkdirSync(path.join(vendorDir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'bin', 'uv.exe'), 'uv-binary')
  fs.mkdirSync(path.join(vendorDir, 'git', 'bin'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'git', 'bin', 'bash.exe'), 'bash')
  fs.mkdirSync(path.join(vendorDir, 'node'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'node', 'node.exe'), 'node')
  fs.mkdirSync(path.join(vendorDir, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'tools', 'rg.exe'), 'rg')
  fs.mkdirSync(path.join(vendorDir, 'hermes-agent', 'hermes_cli'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'hermes-agent', 'hermes_cli', '__init__.py'), '')
  fs.writeFileSync(path.join(vendorDir, 'hermes-agent', 'hermes_cli', 'main.py'), '')
  fs.writeFileSync(path.join(vendorDir, 'hermes-agent', 'pyproject.toml'), '')
  fs.writeFileSync(path.join(vendorDir, 'vendor-runtime-stamp.json'), JSON.stringify({ commit: 'test123' }))
  fs.mkdirSync(path.join(vendorDir, 'python'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'python', 'python.exe'), 'real-python')
  fs.writeFileSync(path.join(vendorDir, 'python', 'pythonw.exe'), 'real-pythonw')
  fs.writeFileSync(path.join(vendorDir, 'python', 'python311.dll'), 'dll')
  fs.mkdirSync(path.join(vendorDir, 'site-packages'), { recursive: true })
  fs.writeFileSync(path.join(vendorDir, 'site-packages', 'some_pkg.py'), '')
  fs.mkdirSync(path.join(vendorDir, 'venv-scripts'), { recursive: true })
  // trampoline stubs: bytes carry the marker the recovery pass probes for
  fs.writeFileSync(
    path.join(vendorDir, 'venv-scripts', 'python.exe'),
    'uv\\python\\cpython-3.11-trampoline'
  )
  fs.writeFileSync(
    path.join(vendorDir, 'venv-scripts', 'hermes.exe'),
    'uv\\python\\cpython-3.11-trampoline'
  )

  return { vendorDir, hermesHome, installDir }
}

// ---------------------------------------------------------------------------
// Scope gate (runs everywhere)
// ---------------------------------------------------------------------------

describe('shouldUseNativeInstall', () => {
  test('win32 + vendorDir -> native', () => {
    assert.equal(shouldUseNativeInstall({ platform: 'win32', vendorDir: 'C:\\v' }), true)
  })
  test('posix -> never native', () => {
    assert.equal(shouldUseNativeInstall({ platform: 'linux', vendorDir: '/v' }), false)
    assert.equal(shouldUseNativeInstall({ platform: 'darwin', vendorDir: '/v' }), false)
  })
  test('no vendorDir -> never native (dev/online)', () => {
    assert.equal(shouldUseNativeInstall({ platform: 'win32', vendorDir: null }), false)
    assert.equal(shouldUseNativeInstall({ platform: 'win32', vendorDir: undefined }), false)
  })
})

// ---------------------------------------------------------------------------
// Pure helpers (run everywhere)
// ---------------------------------------------------------------------------

describe('pyvenv-launchers', () => {
  test('writePyvenvCfg writes home pointing at the same-tree python', () => {
    const home = tmpHome()
    try {
      const venv = path.join(home, 'venv')
      writePyvenvCfg({ managedVenv: venv, managedPython: path.join(home, 'python') })
      const cfg = fs.readFileSync(path.join(venv, 'pyvenv.cfg'), 'utf8')
      assert.ok(cfg.includes(`home = ${path.join(home, 'python')}`))
      assert.ok(cfg.includes('include-system-site-packages = false'))
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('publishHermesLaunchers writes both rungs, idempotent re-publish', () => {
    const home = tmpHome()
    try {
      const installDir = path.join(home, 'agent')
      const hermesHome = path.join(home, 'hermes-home')
      fs.mkdirSync(path.join(installDir, 'hermes_cli'), { recursive: true })
      fs.writeFileSync(path.join(installDir, 'hermes_cli', 'main.py'), '')
      fs.mkdirSync(path.join(installDir, 'venv', 'Scripts'), { recursive: true })
      fs.writeFileSync(path.join(installDir, 'venv', 'Scripts', 'python.exe'), 'py')

      publishHermesLaunchers({ installDir, hermesHome })
      const cmd = fs.readFileSync(path.join(installDir, '.hermes', 'bin', 'hermes.cmd'), 'utf8')
      assert.ok(cmd.includes('-m hermes_cli.main'))
      assert.ok(fs.existsSync(path.join(hermesHome, 'bin', 'hermes.cmd')))

      // AV ate it -> re-publish restores (0.20.5-ae refresh doctrine)
      fs.rmSync(path.join(installDir, '.hermes', 'bin', 'hermes.cmd'))
      publishHermesLaunchers({ installDir, hermesHome })
      assert.ok(fs.existsSync(path.join(installDir, '.hermes', 'bin', 'hermes.cmd')))
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('writeInstallStamp forces updateMechanism=external (B13)', () => {
    const home = tmpHome()
    try {
      const { vendorDir, hermesHome, installDir } = fakeVendorTree(home)
      writeInstallStamp({ installDir, vendorDir })
      const stamp = JSON.parse(fs.readFileSync(path.join(installDir, 'install-stamp.json'), 'utf8'))
      assert.equal(stamp.updateMechanism, 'external')
      void hermesHome
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('trampoline-fix', () => {
  test('fixUvTrampolines replaces python.exe and copies DLLs', () => {
    const home = tmpHome()
    try {
      const { vendorDir, hermesHome, installDir } = fakeVendorTree(home)
      const managedPython = path.join(installDir, 'python')
      const managedVenv = path.join(installDir, 'venv')
      // simulate: python staged, venv Scripts has trampolines
      fs.mkdirSync(managedPython, { recursive: true })
      fs.copyFileSync(path.join(vendorDir, 'python', 'python.exe'), path.join(managedPython, 'python.exe'))
      fs.copyFileSync(path.join(vendorDir, 'python', 'python311.dll'), path.join(managedPython, 'python311.dll'))
      fs.mkdirSync(path.join(managedVenv, 'Scripts'), { recursive: true })
      fs.copyFileSync(path.join(vendorDir, 'venv-scripts', 'python.exe'), path.join(managedVenv, 'Scripts', 'python.exe'))

      fixUvTrampolines({ managedPython, managedVenv })
      assert.equal(fs.readFileSync(path.join(managedVenv, 'Scripts', 'python.exe'), 'utf8'), 'real-python')
      assert.ok(fs.existsSync(path.join(managedVenv, 'Scripts', 'python311.dll')))
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('publishEntryPoints swaps hermes.exe trampoline for .bat wrapper', () => {
    const home = tmpHome()
    try {
      const { vendorDir, hermesHome, installDir } = fakeVendorTree(home)
      const managedPython = path.join(installDir, 'python')
      const managedVenv = path.join(installDir, 'venv')
      fs.mkdirSync(path.join(managedPython), { recursive: true })
      fs.writeFileSync(path.join(managedPython, 'python.exe'), 'real')
      fs.mkdirSync(path.join(managedVenv, 'Scripts'), { recursive: true })
      fs.copyFileSync(path.join(vendorDir, 'venv-scripts', 'hermes.exe'), path.join(managedVenv, 'Scripts', 'hermes.exe'))

      publishEntryPoints({ managedPython, managedVenv })
      assert.ok(!fs.existsSync(path.join(managedVenv, 'Scripts', 'hermes.exe')))
      const bat = fs.readFileSync(path.join(managedVenv, 'Scripts', 'hermes.bat'), 'utf8')
      assert.ok(bat.includes('-m hermes_cli.main'))
      void hermesHome
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('fixUvTrampolinesRecovery is a no-op on a fixed venv', () => {
    const home = tmpHome()
    try {
      const managedPython = path.join(home, 'python')
      const managedVenv = path.join(home, 'venv')
      fs.mkdirSync(managedPython, { recursive: true })
      fs.writeFileSync(path.join(managedPython, 'python.exe'), 'real')
      fs.mkdirSync(path.join(managedVenv, 'Scripts'), { recursive: true })
      fs.writeFileSync(path.join(managedVenv, 'Scripts', 'python.exe'), 'real') // not a trampoline
      // must not throw, must not touch anything
      fixUvTrampolinesRecovery({ managedPython, managedVenv, appData: path.join(home, 'appdata') })
      assert.equal(fs.readFileSync(path.join(managedVenv, 'Scripts', 'python.exe'), 'utf8'), 'real')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// robocopy + full stager (win32-only: robocopy.exe and git.exe are Windows
// binaries; on WSL the tests skip exactly like the ephemeral-lifecycle ones)
// ---------------------------------------------------------------------------

describe.skipIf(!WIN)('vendor-stager (win32)', () => {
  let home: string

  beforeEach(() => {
    home = tmpHome()
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  test('robocopy copies a tree and reports success', async () => {
    const src = path.join(home, 'rc-src')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'a.txt'), 'a')
    fs.mkdirSync(path.join(src, 'sub'), { recursive: true })
    fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'b')
    const dest = path.join(home, 'rc-dest')

    const ok = await robocopy(src, dest, { mt: 2 })
    assert.equal(ok, true)
    assert.equal(fs.readFileSync(path.join(dest, 'sub', 'b.txt'), 'utf8'), 'b')
  })

  test('stageVendorFiles lays down all six components', async () => {
    const { vendorDir, hermesHome, installDir } = fakeVendorTree(home + '-full')

    const logs: string[] = []
    const result = await stageVendorFiles({
      vendorDir,
      hermesHome,
      installDir,
      keepVendor: true,
      log: l => logs.push(l)
    })

    assert.equal(result.ok, true, JSON.stringify(result))
    // 1-4
    assert.ok(fs.existsSync(path.join(hermesHome, 'bin', 'uv.exe')))
    assert.ok(fs.existsSync(path.join(hermesHome, 'git', 'bin', 'bash.exe')))
    assert.ok(fs.existsSync(path.join(hermesHome, 'node', 'node.exe')))
    assert.ok(fs.existsSync(path.join(hermesHome, 'tools', 'rg.exe')))
    // 5
    assert.ok(fs.existsSync(path.join(installDir, 'hermes_cli', '__init__.py')))
    // 6 + trampoline fix
    assert.equal(
      fs.readFileSync(path.join(installDir, 'venv', 'Scripts', 'python.exe'), 'utf8'),
      'real-python'
    )
    assert.ok(fs.existsSync(path.join(installDir, 'venv', 'Scripts', 'python311.dll')))
    assert.ok(!fs.existsSync(path.join(installDir, 'venv', 'Scripts', 'hermes.exe')))
    assert.ok(fs.existsSync(path.join(installDir, 'venv', 'Scripts', 'hermes.bat')))
    // pyvenv.cfg / launchers / stamp
    assert.ok(fs.existsSync(path.join(installDir, 'venv', 'pyvenv.cfg')))
    assert.ok(fs.existsSync(path.join(installDir, '.hermes', 'bin', 'hermes.cmd')))
    assert.ok(fs.existsSync(path.join(installDir, 'install-stamp.json')))

    assert.ok(isVendorStagingComplete(installDir))
    // vendor tree NEVER gutted (ab+2 doctrine)
    assert.ok(fs.existsSync(path.join(vendorDir, 'bin', 'uv.exe')))
    assert.ok(fs.existsSync(path.join(vendorDir, 'hermes-agent', 'hermes_cli', '__init__.py')))
  }, 120_000)

  test('stageVendorFiles is idempotent — second run converges, no retire', async () => {
    const root = home + '-idem'
    const { vendorDir, hermesHome, installDir } = fakeVendorTree(root)

    const first = await stageVendorFiles({ vendorDir, hermesHome, installDir, keepVendor: true })
    assert.equal(first.ok, true)

    const second = await stageVendorFiles({ vendorDir, hermesHome, installDir, keepVendor: true })
    assert.equal(second.ok, true)
    assert.ok(isVendorStagingComplete(installDir))
    // no retired generation from an idempotent re-run (freshness guard)
    const gens = fs.readdirSync(hermesHome).filter(n => n.startsWith('hermes-agent.retired'))
    assert.equal(gens.length, 0)
  }, 120_000)

  test('stageVendorFiles retires a stale engine on stamp mismatch (upgrade-as-reinstall)', async () => {
    const root = home + '-upgrade'
    const { vendorDir, hermesHome, installDir } = fakeVendorTree(root)

    // First install, then simulate a stale upgrade: different vendor stamp.
    const first = await stageVendorFiles({ vendorDir, hermesHome, installDir, keepVendor: true })
    assert.equal(first.ok, true)

    fs.writeFileSync(path.join(vendorDir, 'vendor-runtime-stamp.json'), JSON.stringify({ commit: 'new456' }))

    const second = await stageVendorFiles({ vendorDir, hermesHome, installDir, keepVendor: true })
    assert.equal(second.ok, true)
    // old venv retired, exactly one generation kept
    const venvGens = fs
      .readdirSync(installDir)
      .filter(n => n.startsWith('venv.old'))
    assert.equal(venvGens.length, 1, `expected one retired venv, got ${venvGens.join(',')}`)
    assert.ok(isVendorStagingComplete(installDir))
  }, 120_000)
})
