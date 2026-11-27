/**
 * native-driver.test.ts — event-stream contract tests.
 *
 * crab 0.20.5-af (feat/install-native-ts): the native driver must emit the
 * SAME event shapes the ps1 ladder produces, because broadcastBootstrapEvent
 * (main.ts) and the renderer overlay consume them verbatim:
 *   - stage states come from 'pending'|'running'|'succeeded'|'skipped'|'failed'
 *     (NOT 'ok' — the 0.20.5-af 终审 catch)
 *   - a manifest is emitted before any stage event
 *   - the runner (not the driver) owns 'complete', but when the driver
 *     succeeds, bootstrap-runner must NOT return before emitting it (the
 *     premature-return bug the 终审 caught).
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test, vi } from 'vitest'

import { runNativeInstall, shouldUseNativeInstall, OFFLINE_STAGES } from './native-driver'
import * as vendorStager from './vendor-stager'

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'native-driver-'))
}


const VALID_STATES = new Set(['pending', 'running', 'succeeded', 'skipped', 'failed'])

describe('native-driver contract', () => {
  test('scope gate: win32+vendor native, posix/no-vendor never', () => {
    assert.equal(shouldUseNativeInstall({ platform: 'win32', vendorDir: 'C:\\v' }), true)
    assert.equal(shouldUseNativeInstall({ platform: 'linux', vendorDir: '/v' }), false)
    assert.equal(shouldUseNativeInstall({ platform: 'win32', vendorDir: null }), false)
  })

  test('event stream uses the canonical stage-state enum (no "ok")', async () => {
    // The REAL staging pass needs robocopy.exe/git.exe (win32 binaries that
    // hang when spawned from WSL); the event-stream CONTRACT does not. Mock
    // the stager — the driver's job here is event shapes, not file layout
    // (vendor-stager.test.ts owns that, win32-only).
    const stagerMock = vi.spyOn(vendorStager, 'stageVendorFiles').mockResolvedValue({
      ok: true,
      staged: ['uv', 'git', 'node', 'ripgrep', 'repository', 'python', 'venv']
    })
    const completeMock = vi.spyOn(vendorStager, 'isVendorStagingComplete').mockReturnValue(true)

    try {
      const home = tmpHome()
      const events: Array<Record<string, unknown>> = []

      const result = await runNativeInstall({
        vendorDir: path.join(home, 'vendor'),
        hermesHome: path.join(home, 'hh'),
        installDir: path.join(home, 'hh', 'agent'),
        emit: ev => events.push(ev)
      })

      assert.equal(result.ok, true)
      assert.equal(events[0]?.type, 'manifest')
      const manifest = events[0] as { stages: Array<{ name: string }> }
      assert.ok(manifest.stages.length >= 9)

      const stageEvents = events.filter(e => e.type === 'stage') as Array<{ state: string; name: string }>
      for (const ev of stageEvents) {
        assert.ok(
          VALID_STATES.has(ev.state),
          `stage state "${ev.state}" not in the canonical enum — the overlay would drop it`
        )
      }
      // every manifest stage reaches running then succeeded, in ladder order
      for (const stage of manifest.stages) {
        const mine = stageEvents.filter(e => e.name === stage.name).map(e => e.state)
        assert.deepEqual(mine, ['running', 'succeeded'], `stage ${stage.name}: ${mine.join(',')}`)
      }
      const lastLog = [...events].reverse().find(e => e.type === 'log') as { line: string } | undefined
      assert.ok(lastLog?.line.includes('native install driver: complete'))
    } finally {
      stagerMock.mockRestore()
      completeMock.mockRestore()
    }
  })

  test('failure maps to a stage and emits a terminal failed event', async () => {
    const home = tmpHome()
    try {
      const events: Array<Record<string, unknown>> = []
      // Empty vendor dir -> staging fails with "vendor dir not found".
      const result = await runNativeInstall({
        vendorDir: path.join(home, 'missing-vendor'),
        hermesHome: path.join(home, 'hh'),
        installDir: path.join(home, 'hh', 'hermes-agent'),
        emit: ev => events.push(ev)
      })

      assert.equal(result.ok, false)
      assert.ok(result.error)
      assert.ok(result.failedStage)
      const failedEv = events.find(e => e.type === 'failed') as { error: string } | undefined
      assert.ok(failedEv?.error, 'terminal failed event missing')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  test('OFFLINE_STAGES cover the ps1 ladder names the UI knows', () => {
    const names = OFFLINE_STAGES.map(s => s.name)
    for (const expected of ['uv', 'python', 'git', 'node', 'system-packages', 'repository', 'venv', 'dependencies', 'node-deps']) {
      assert.ok(names.includes(expected), `stage ${expected} missing from the static manifest`)
    }
  })
})
