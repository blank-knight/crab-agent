import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { test } from 'vitest'

import {
  classifyEngineRetirement,
  classifyRuntimeHealth,
  classifyVenvRestaging,
  hasHealthyVenv
} from './engine-retirement-gate'

function mkTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-retirement-gate-'))
}

/** Lay out a fake install tree; every arg is a rel path to create. */
function touch(root: string, rels: string[]) {
  for (const rel of rels) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), 'x')
  }
}

function writeStamp(root: string, rel: string, commit: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), JSON.stringify({ commit }))
}

const HEALTHY_VENV = [
  'python/python.exe',
  'venv/Scripts/python.exe',
  'venv/Lib/site-packages'
]

// --- hasHealthyVenv: the 88cfeba42b double probe ----------------------------

test('hasHealthyVenv requires ALL three probes (python + venv Scripts + Lib)', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')

  try {
    touch(install, HEALTHY_VENV)
    assert.equal(hasHealthyVenv(install), true)

    // Corpse variant A: Scripts dug out, Lib remaining (the original 88cfeba
    // blind spot — retirement guard only probed Lib, so the corpse passed).
    fs.rmSync(path.join(install, 'venv', 'Scripts'), { recursive: true, force: true })
    assert.equal(hasHealthyVenv(install), false, 'corpse venv (no Scripts) must fail the probe')

    // Corpse variant B: Scripts present, Lib dug out (the 410 staging-gate
    // blind spot — staging gate only probed Scripts, so restaging was skipped).
    touch(install, ['venv/Scripts/python.exe'])
    fs.rmSync(path.join(install, 'venv', 'Lib', 'site-packages'), { recursive: true, force: true })
    assert.equal(hasHealthyVenv(install), false, 'corpse venv (no Lib) must fail the probe')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// --- Gate 1: engine retirement (upgrade-as-reinstall) ----------------------

test('fresh staging (healthy venv + install stamp + vendor engine) skips retirement', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, [...HEALTHY_VENV, 'hermes_cli/__init__.py', 'install-stamp.json'])
    touch(vendor, ['hermes-agent/hermes_cli/__init__.py'])

    const verdict = classifyEngineRetirement({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.retireEngine, false)
    assert.equal(verdict.freshStaging, true)
    assert.match(verdict.reason, /fresh vendor staging/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('healthy venv but NO vendor stamp still retires (ab+1 guard inverted honestly)', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, [...HEALTHY_VENV, 'hermes_cli/__init__.py'])
    touch(vendor, ['hermes-agent/hermes_cli/__init__.py'])

    const verdict = classifyEngineRetirement({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.retireEngine, true, 'no install-stamp.json → not our fresh staging → retire')
    assert.equal(verdict.freshStaging, false)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('corpse venv with vendor stamp retires (the 88cfeba residue case)', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    // stamp present but the venv is a corpse: Scripts dug out, Lib remaining.
    touch(install, ['python/python.exe', 'venv/Lib/site-packages', 'hermes_cli/__init__.py', 'install-stamp.json'])
    touch(vendor, ['hermes-agent/hermes_cli/__init__.py'])

    const verdict = classifyEngineRetirement({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.retireEngine, true, 'stamp + corpse venv must NOT skip retirement')
    assert.match(verdict.reason, /unhealthy venv/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('no existing engine or no vendor payload never retires from TS side', () => {
  const home = mkTmpHome()

  try {
    // Nothing installed at all.
    let verdict = classifyEngineRetirement({ installDir: path.join(home, 'none'), vendorDir: null })
    assert.equal(verdict.retireEngine, false)

    // Engine present but vendor payload absent (dev / online path): the PS1
    // gate stays authoritative — the TS side must not retire.
    const install = path.join(home, 'hermes-agent')
    touch(install, ['hermes_cli/__init__.py'])
    verdict = classifyEngineRetirement({ installDir: install, vendorDir: null })
    assert.equal(verdict.retireEngine, false)
    assert.match(verdict.reason, /PS1 gate remains authoritative/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// --- Gate 2: venv restaging (vendor runtime stamp) --------------------------

test('matching runtime stamps keep the installed venv', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, HEALTHY_VENV)
    writeStamp(install, 'vendor-runtime-stamp.json', 'abc123')
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'abc123')

    const verdict = classifyVenvRestaging({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.rebuildVenv, false)
    assert.match(verdict.reason, /matches/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('vendor runtime stamp mismatch forces a venv rebuild', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, HEALTHY_VENV)
    writeStamp(install, 'vendor-runtime-stamp.json', 'old')
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'new')

    const verdict = classifyVenvRestaging({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.rebuildVenv, true)
    assert.match(verdict.reason, /old -> new/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('venv residue (healthy probe fails) forces a rebuild — the 410 blind spot', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    // Scripts present + Lib missing: the PS1 410 staging gate would SKIP
    // restaging (it only probes Scripts\python.exe). The TS gate must catch it.
    touch(install, ['python/python.exe', 'venv/Scripts/python.exe'])
    writeStamp(install, 'vendor-runtime-stamp.json', 'same')
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'same')

    const verdict = classifyVenvRestaging({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.rebuildVenv, true, 'residue venv must be rebuilt even with matching stamps')
    assert.match(verdict.reason, /residue/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('unreadable stamps fail open to a rebuild (safe side)', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, HEALTHY_VENV)
    // installed stamp is garbage JSON
    fs.writeFileSync(path.join(install, 'vendor-runtime-stamp.json'), '{not json')
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'new')

    const verdict = classifyVenvRestaging({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.rebuildVenv, true)
    assert.match(verdict.reason, /unreadable/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('fresh install with no venv needs no rebuild', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'new')

    const verdict = classifyVenvRestaging({ installDir: install, vendorDir: vendor })
    assert.equal(verdict.rebuildVenv, false)
    assert.match(verdict.reason, /staging builds a fresh one/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

// --- combined pre-flight ----------------------------------------------------

test('classifyRuntimeHealth reports both gates together', () => {
  const home = mkTmpHome()
  const install = path.join(home, 'hermes-agent')
  const vendor = path.join(home, 'vendor')

  try {
    touch(install, [...HEALTHY_VENV, 'hermes_cli/__init__.py', 'install-stamp.json'])
    touch(vendor, ['hermes-agent/hermes_cli/__init__.py'])
    writeStamp(install, 'vendor-runtime-stamp.json', 'same')
    writeStamp(vendor, 'vendor-runtime-stamp.json', 'same')

    const gates = classifyRuntimeHealth({ installDir: install, vendorDir: vendor })
    assert.equal(gates.engine.freshStaging, true)
    assert.equal(gates.engine.retireEngine, false)
    assert.equal(gates.venv.rebuildVenv, false)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
