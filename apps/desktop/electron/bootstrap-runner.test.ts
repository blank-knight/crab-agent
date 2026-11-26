import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import {
  buildPinArgs,
  buildPosixPinArgs,
  cachedScriptPath,
  cleanInstallerLogLine,
  hasExistingGitCheckout,
  installRefForStamp,
  isPinnedCommit,
  resolveInstallScript,
  resolveMarkerPinnedCommit,
  runBootstrap,
  cleanupEphemeralInstallScript,
  cleanupEphemeralInstallScriptsInDir,
  materializeEphemeralInstallScript
} from './bootstrap-runner'

const SCRIPT_NAME = process.platform === 'win32' ? 'install.ps1' : 'install.sh'
const ZERO_COMMIT = '0000000000000000000000000000000000000000'

function mkTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-bootstrap-test-'))
}

test('runBootstrap bails immediately when the signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()

  const events = []

  const result = await runBootstrap({
    installStamp: null,
    activeRoot: '/tmp/hermes-runner-test',
    sourceRepoRoot: null,
    hermesHome: '/tmp/hermes-runner-test',
    logRoot: '/tmp/hermes-runner-test',
    onEvent: ev => events.push(ev),
    abortSignal: controller.signal
  })

  // Cancelled before any install script is spawned.
  assert.deepEqual(result, { ok: false, cancelled: true })
  assert.ok(
    events.some(ev => ev.type === 'failed' && /cancelled/i.test(ev.error)),
    'should emit a cancelled failure event'
  )
})

test('existing checkout detection requires git metadata', () => {
  const home = mkTmpHome()

  try {
    const activeRoot = path.join(home, 'hermes-agent')
    assert.equal(hasExistingGitCheckout(activeRoot), false)

    fs.mkdirSync(path.join(activeRoot, '.git'), { recursive: true })
    assert.equal(hasExistingGitCheckout(activeRoot), true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('fresh bootstrap args include the packaged commit pin', () => {
  const installStamp = { commit: 'a'.repeat(40), branch: 'main' }

  assert.deepEqual(buildPinArgs(installStamp), ['-Commit', installStamp.commit, '-Branch', 'main'])
  assert.deepEqual(
    buildPosixPinArgs({
      installStamp,
      activeRoot: '/tmp/hermes-agent',
      hermesHome: '/tmp/hermes'
    }),
    ['--dir', '/tmp/hermes-agent', '--hermes-home', '/tmp/hermes', '--branch', 'main', '--commit', installStamp.commit]
  )
})

test('existing-checkout bootstrap args keep branch but skip the packaged commit pin', () => {
  const installStamp = { commit: 'a'.repeat(40), branch: 'main' }

  assert.deepEqual(buildPinArgs(installStamp, { pinCommit: false }), ['-Branch', 'main'])
  assert.deepEqual(
    buildPosixPinArgs({
      installStamp,
      activeRoot: '/tmp/hermes-agent',
      hermesHome: '/tmp/hermes',
      pinCommit: false
    }),
    ['--dir', '/tmp/hermes-agent', '--hermes-home', '/tmp/hermes', '--branch', 'main']
  )
})

test('fallback install stamps use an unpinned branch ref', () => {
  const stamp = { commit: ZERO_COMMIT, branch: 'main' }

  assert.equal(isPinnedCommit(ZERO_COMMIT), false)
  assert.deepEqual(installRefForStamp(stamp), {
    ref: 'main',
    cacheKey: 'branch-main',
    pinned: false
  })
  // Must NOT pass -Commit / --commit for the all-zero placeholder.
  assert.deepEqual(buildPinArgs(stamp), ['-Branch', 'main'])
  assert.deepEqual(
    buildPosixPinArgs({
      installStamp: stamp,
      activeRoot: '/tmp/hermes',
      hermesHome: '/tmp/home'
    }),
    ['--dir', '/tmp/hermes', '--hermes-home', '/tmp/home', '--branch', 'main']
  )
})

test('existing-checkout installer ref follows the branch instead of the packaged commit', () => {
  const stamp = { commit: 'a'.repeat(40), branch: 'main' }

  assert.deepEqual(installRefForStamp(stamp, { pinCommit: false }), {
    ref: 'main',
    cacheKey: 'branch-main',
    pinned: false
  })
  assert.deepEqual(installRefForStamp(stamp), {
    ref: stamp.commit,
    cacheKey: stamp.commit,
    pinned: true
  })
})

test('resolveMarkerPinnedCommit prefers installed checkout HEAD over the packaged artifact', () => {
  const realHead = 'c'.repeat(40)
  assert.equal(
    resolveMarkerPinnedCommit({ commit: ZERO_COMMIT, branch: 'main' }, '/tmp/checkout', {
      resolveHead: () => realHead
    }),
    realHead
  )
  assert.equal(
    resolveMarkerPinnedCommit({ commit: 'd'.repeat(40), branch: 'main' }, '/tmp/checkout', {
      resolveHead: () => realHead
    }),
    realHead,
    'the installed checkout owns source runtime identity'
  )
  assert.equal(
    resolveMarkerPinnedCommit({ commit: ZERO_COMMIT, branch: 'main' }, '/tmp/missing', {
      resolveHead: () => null
    }),
    null
  )
})

test('resolveInstallScript downloads fallback stamps by branch instead of zero commit', async () => {
  const home = mkTmpHome()

  try {
    const cached = cachedScriptPath(home, 'branch-main')
    fs.mkdirSync(path.dirname(cached), { recursive: true })
    fs.writeFileSync(cached, 'stale branch installer\n')

    const refs = []

    const result = await resolveInstallScript({
      installStamp: { commit: ZERO_COMMIT, branch: 'main' },
      sourceRepoRoot: null,
      hermesHome: home,
      emit: () => {},
      _download: async (ref, destPath) => {
        refs.push(ref)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.writeFileSync(destPath, '#!/bin/sh\necho fallback branch\n')

        return destPath
      }
    })

    assert.deepEqual(refs, ['main'])
    assert.equal(result.source, 'download')
    assert.equal(result.commit, null)
    assert.equal(result.path, cached)
    assert.match(fs.readFileSync(cached, 'utf8'), /fallback branch/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('resolveInstallScript refreshes the live branch for an existing checkout', async () => {
  const home = mkTmpHome()

  try {
    const commit = 'a'.repeat(40)
    const cached = cachedScriptPath(home, 'branch-main')
    fs.mkdirSync(path.dirname(cached), { recursive: true })
    fs.writeFileSync(cached, 'stale installer\n')

    const refs = []

    const result = await resolveInstallScript({
      installStamp: { commit, branch: 'main' },
      sourceRepoRoot: null,
      hermesHome: home,
      emit: () => {},
      pinCommit: false,
      _download: async (ref, destPath) => {
        refs.push(ref)
        fs.writeFileSync(destPath, 'fresh branch installer\n')

        return destPath
      }
    })

    assert.deepEqual(refs, ['main'])
    assert.equal(result.source, 'download')
    assert.equal(result.commit, null)
    assert.equal(result.path, cached)
    assert.equal(fs.readFileSync(cached, 'utf8'), 'fresh branch installer\n')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('resolveInstallScript refreshes an immutable-pin cache on a fresh install', async () => {
  const home = mkTmpHome()

  try {
    const commit = 'a'.repeat(40)
    const cached = cachedScriptPath(home, commit)
    fs.mkdirSync(path.dirname(cached), { recursive: true })
    fs.writeFileSync(cached, 'stale installer\n')

    const refs = []

    const result = await resolveInstallScript({
      installStamp: { commit, branch: 'main' },
      sourceRepoRoot: null,
      hermesHome: home,
      emit: () => {},
      _download: async (ref, destPath) => {
        refs.push(ref)
        fs.writeFileSync(destPath, 'fresh pinned installer\n')

        return destPath
      }
    })

    assert.deepEqual(refs, [commit])
    assert.equal(result.source, 'download')
    assert.equal(result.commit, commit)
    assert.equal(result.path, cached)
    assert.equal(fs.readFileSync(cached, 'utf8'), 'fresh pinned installer\n')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('resolveInstallScript fails closed instead of executing an installed stale script', async () => {
  const home = mkTmpHome()

  try {
    const commit = 'a'.repeat(40)
    const scriptsDir = path.join(home, 'hermes-agent', 'scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    fs.writeFileSync(path.join(scriptsDir, SCRIPT_NAME), 'stale installed script\n')

    await assert.rejects(
      resolveInstallScript({
        installStamp: { commit, branch: 'main' },
        sourceRepoRoot: null,
        hermesHome: home,
        emit: () => {},
        _download: async () => {
          throw new Error('Failed to download install script: HTTP 404')
        }
      }),
      /HTTP 404/
    )
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// #112675: install.sh colours its banners and curl/uv redraw progress with \r
// even into a pipe; the overlay renders lines as plain text, so the emitter
// must hand every consumer (log ring, Details panel, Copy output) the text a
// terminal would be left showing.
test('installer log lines reach the emitter without escape sequences; \\r redraws keep the last frame', () => {
  assert.equal(cleanInstallerLogLine('\u001b[0;32m✓\u001b[0m Detected: macos (macos)'), '✓ Detected: macos (macos)')
  assert.equal(cleanInstallerLogLine('\u001b[2K\u001b[1GCloning repository…\u001b[K'), 'Cloning repository…')
  assert.equal(cleanInstallerLogLine('\u001b]0;hermes\u0007Installing Hermes'), 'Installing Hermes')
  assert.equal(cleanInstallerLogLine('\r 12%\r 67%\r100%\u001b[K'), '100%')
  assert.equal(cleanInstallerLogLine('Resolving dependencies…\r'), 'Resolving dependencies…')
  // Only-escape frames drop entirely, so the caller emits nothing for them.
  assert.equal(cleanInstallerLogLine('\u001b[0m\r'), '')
  // Plain multi-byte text is untouched.
  assert.equal(cleanInstallerLogLine('Ready — café ✓ 中文'), 'Ready — café ✓ 中文')
})

test.skipIf(process.platform === 'win32')(
  'a manifest-step failure surfaces the installer tail without escape sequences',
  async () => {
    const home = mkTmpHome()
    fs.mkdirSync(path.join(home, 'scripts'))
    fs.writeFileSync(
      path.join(home, 'scripts', 'install.sh'),
      '#!/usr/bin/env bash\nprintf "\\033[0;31m\\xe2\\x9c\\x97\\033[0m manifest broke\\n" >&2\nexit 3\n'
    )

    const result = await runBootstrap({
      installStamp: null,
      activeRoot: home,
      sourceRepoRoot: home,
      hermesHome: home,
      logRoot: home,
      onEvent: () => {}
    })

    assert.equal(result.ok, false)
    assert.equal(result.error, 'install.sh --manifest failed: exit 3\n✗ manifest broke')
  }
)

// --- crab 0.20.5-ad+1 (feat/ps1-ephemeral): ephemeral script lifecycle ------

// The asar source (app.asar/scripts/install.ps1) only exists in a packaged
// Windows build; the lifecycle contract is still testable on any platform by
// pointing the resources layout at a temp tree with the same shape.
function fakePackageLayout(home: string) {
  // <home>/package/resources  (resourcesPath)
  // <home>/package/app.asar/scripts/install.ps1  (Electron fs shim reads here)
  const resourcesPath = path.join(home, 'package', 'resources')
  const asarScripts = path.join(home, 'package', 'app.asar', 'scripts')
  fs.mkdirSync(asarScripts, { recursive: true })
  fs.writeFileSync(path.join(asarScripts, 'install.ps1'), 'Write-Host "ephemeral"\n')
  return { resourcesPath, asarScripts }
}

test.skipIf(process.platform !== 'win32')(
  'materializeEphemeralInstallScript extracts the asar copy to a sha-keyed bootstrap-cache path',
  () => {
    const home = mkTmpHome()
    const { resourcesPath } = fakePackageLayout(home)

    try {
      const scriptPath = materializeEphemeralInstallScript(resourcesPath, home)
      assert.ok(scriptPath, 'extract should succeed against a fake asar layout')
      assert.match(scriptPath, /ephemeral-install-[0-9a-f]{12}\.ps1$/)
      assert.match(path.dirname(scriptPath), /bootstrap-cache$/)
      assert.equal(fs.readFileSync(scriptPath, 'utf8'), 'Write-Host "ephemeral"\n')

      // Deterministic: same bytes → same path (no copy accumulation).
      const again = materializeEphemeralInstallScript(resourcesPath, home)
      assert.equal(again, scriptPath)
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  }
)

test.skipIf(process.platform !== 'win32')(
  'materializeEphemeralInstallScript rewrites fresh bytes over a quarantined-tampered file',
  () => {
    const home = mkTmpHome()
    const { resourcesPath } = fakePackageLayout(home)

    try {
      const scriptPath = materializeEphemeralInstallScript(resourcesPath, home)
      // Simulate AV tampering: file present but content mangled.
      fs.writeFileSync(scriptPath, 'MANGLED')
      const again = materializeEphemeralInstallScript(resourcesPath, home)
      assert.equal(again, scriptPath)
      assert.equal(fs.readFileSync(scriptPath, 'utf8'), 'Write-Host "ephemeral"\n')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  }
)

test('cleanupEphemeralInstallScript removes only ephemeral paths, best-effort', () => {
  const home = mkTmpHome()

  try {
    const cacheDir = path.join(home, 'bootstrap-cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    const ephemeral = path.join(cacheDir, 'ephemeral-install-0123456789ab.ps1')
    fs.writeFileSync(ephemeral, 'x')

    // Standing install.sh (posix dev path) must never be deleted.
    const standing = path.join(home, 'scripts', 'install.sh')
    fs.mkdirSync(path.dirname(standing), { recursive: true })
    fs.writeFileSync(standing, '#!/bin/sh\n')

    cleanupEphemeralInstallScript(ephemeral)
    assert.equal(fs.existsSync(ephemeral), false, 'ephemeral script must be deleted')

    cleanupEphemeralInstallScript(standing)
    assert.equal(fs.existsSync(standing), true, 'standing (non-ephemeral) scripts are never deleted')

    // Absent / null paths are a no-op, not a throw.
    cleanupEphemeralInstallScript(null)
    cleanupEphemeralInstallScript(path.join(home, 'gone.ps1'))
    assert.ok(true)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test.skipIf(process.platform !== 'win32')(
  'runBootstrap deletes the ephemeral script in its finally — even when the manifest fails',
  async () => {
    const home = mkTmpHome()
    const { resourcesPath } = fakePackageLayout(home)

    try {
      // A packaged layout with no sourceRepoRoot: resolveInstallScript takes
      // the bundled path (ephemeral). The script content is not a real
      // installer, so -Manifest fails — which is exactly the failure path we
      // want: the finally must still clean up.
      const result = await runBootstrap({
        installStamp: null,
        activeRoot: path.join(home, 'hermes-agent'),
        sourceRepoRoot: null,
        hermesHome: home,
        logRoot: home,
        resourcesPath,
        onEvent: () => {}
      })

      assert.equal(result.ok, false)

      const cacheDir = path.join(home, 'bootstrap-cache')
      const leftovers =
        fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter(f => f.startsWith('ephemeral-install-')) : []
      assert.deepEqual(leftovers, [], 'no ephemeral script may outlive a bootstrap run')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  }
)

// crab 0.20.5-ad+2 (verifier finding #1): the finally must SWEEP the whole
// bootstrap-cache dir — an orphaned ephemeral file (written by an aborted
// materialize, a half-failed one, or a heal path the registry never saw)
// would otherwise be a standing PS file, exactly what this feature removes.
test('cleanupEphemeralInstallScriptsInDir sweeps orphans the registry never saw', () => {
  const home = mkTmpHome()

  try {
    const cacheDir = path.join(home, 'bootstrap-cache')
    fs.mkdirSync(cacheDir, { recursive: true })

    // Orphan patterns: every shape the registry could have missed.
    const orphans = [
      'ephemeral-install-aaaaaaaaaaaa.ps1',
      'ephemeral-install-0123456789ab.ps1'
    ]
    for (const o of orphans) {
      fs.writeFileSync(path.join(cacheDir, o), 'orphan')
    }

    // Foreign files in the same dir must survive (defensive contract).
    fs.writeFileSync(path.join(cacheDir, 'install-main.ps1'), 'downloaded-cache-script')
    fs.writeFileSync(path.join(cacheDir, 'ephemeral-install-short.ps1'), 'not-ephemeral-shape')
    fs.writeFileSync(path.join(cacheDir, 'ephemeral-install-0123456789ab.ps1.tmp'), 'temp')

    // An unregistered heal materialization (the third orphan window).
    const healMade = path.join(cacheDir, 'ephemeral-install-bbbbbbbbbbbb.ps1')
    fs.writeFileSync(healMade, 'heal-orphan')

    // cleanupEphemeralInstallScript(null, ...) style: sweep by dir only.
    // Direct function under test (exported):
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // (imported at top as cleanupEphemeralInstallScriptsInDir)

    assert.equal(fs.existsSync(healMade), true, 'precondition: orphan exists before sweep')

    // Trigger the sweep via the finally path with an unrelated scriptPath
    // (posix dev standing script — registry path is a no-op, sweep must run):
    // we call the dir-sweep directly to keep the test deterministic.
    cleanupEphemeralInstallScriptsInDir(home)

    assert.equal(fs.existsSync(path.join(cacheDir, orphans[0])), false, 'orphan a swept')
    assert.equal(fs.existsSync(path.join(cacheDir, orphans[1])), false, 'orphan b swept')
    assert.equal(fs.existsSync(healMade), false, 'heal orphan swept')
    assert.equal(fs.existsSync(path.join(cacheDir, 'install-main.ps1')), true, 'foreign file survives')
    assert.equal(fs.existsSync(path.join(cacheDir, 'ephemeral-install-short.ps1')), true, 'non-12-hex shape survives')
    assert.equal(fs.existsSync(path.join(cacheDir, 'ephemeral-install-0123456789ab.ps1.tmp')), true, '.tmp suffix survives')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
