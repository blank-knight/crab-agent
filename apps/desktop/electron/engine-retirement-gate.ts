/**
 * engine-retirement-gate.ts
 *
 * crab 0.20.5-ad+1 (2026-11-26, feat/ps1-ephemeral): the DECISION half of the
 * installer's retirement guards, moved from install.ps1 (Stage-VendorFiles)
 * into the compiled main process.
 *
 * Why: install.ps1 now runs ephemeral (bootstrap-runner extracts it from asar
 * to a short-lived file that is deleted when the run ends — see
 * bootstrap-runner.ts). A quarantined/corrupted ephemeral script must never be
 * the only thing standing between a broken install and a repair, so the gate
 * logic that decides "is this install healthy enough to skip restaging" is
 * migrated here, where the AV cannot touch it. install.ps1 keeps the same
 * probes as a defense-in-depth second opinion (byte-for-byte the same rules,
 * mirrored below); this module is the authority the main process consults
 * BEFORE ever spawning the installer.
 *
 * Migrated rules (source of truth: scripts/install.ps1 Stage-VendorFiles):
 *
 *  1. Engine retirement gate (PS1 lines ~266-283, "upgrade-as-reinstall"):
 *     A checkout carrying a HEALTHY venv AND a vendor install stamp is our own
 *     fresh staging, not a stale upgrade — skip the retire. Otherwise an
 *     existing engine checkout is retired (renamed hermes-agent.retired-*,
 *     one generation kept) before the vendor tree re-stages into a clean dir.
 *     Healthy venv = the 88cfeba42b DOUBLE probe: venv\Scripts\python.exe AND
 *     venv\Lib\site-packages (a corpse venv with Scripts dug out but Lib
 *     remaining must NOT pass — it would skip the retire and leave the backend
 *     unlaunchable).
 *
 *  2. Venv restaging gate (PS1 lines ~384-406, 0.17.7 vendor runtime stamp):
 *     vendor-runtime-stamp.json (vendor tree) vs the stamp beside the
 *     installed venv — mismatch means the vendor runtime changed and the old
 *     venv is retired (venv.old-*) so staging rebuilds it.
 *
 * This module only CLASSIFIES. It never moves, renames or deletes anything —
 * the mutation stays in install.ps1's Stage-VendorFiles, which remains
 * idempotent and re-runs per stage. The main process uses the verdicts to
 * (a) pre-flight the repair decision with AV-immune logic, and (b) decide
 * whether a bootstrap attempt is even worth starting.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface RetirementGatesInput {
  /** Install dir (= the managed engine checkout, ACTIVE_HERMES_ROOT on win). */
  installDir: string
  /** Vendor dir (packaged resources/vendor); null/absent in dev/CI runs. */
  vendorDir: string | null | undefined
}

export interface EngineRetirementVerdict {
  /** True when the existing engine dir must be retired before re-staging. */
  retireEngine: boolean
  /** True when this is our own fresh staging (healthy venv + stamp): skip. */
  freshStaging: boolean
  /** Human-readable reason for the log ring / emit line. */
  reason: string
}

export interface VenvRestagingVerdict {
  /** True when the installed venv must be rebuilt (stamp mismatch / absent). */
  rebuildVenv: boolean
  reason: string
}

// --- probe helpers (pure, fs-injected for testability) ---------------------

interface FsProbes {
  exists(p: string): boolean
  readJsonField(p: string, field: string): string | null
}

function defaultProbes(): FsProbes {
  return {
    exists: p => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    },
    readJsonField: (p, field) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))

        if (parsed && typeof parsed === 'object' && field in (parsed as Record<string, unknown>)) {
          const value = (parsed as Record<string, unknown>)[field]
          return typeof value === 'string' ? value : null
        }

        return null
      } catch {
        return null
      }
    }
  }
}

/**
 * The 88cfeba42b healthy-venv probe, mirrored from install.ps1:
 * python\python.exe AND venv\Scripts\python.exe AND venv\Lib\site-packages.
 * Scripts-only or Lib-only corpses fail — that is the whole point of the
 * double probe (the venv-residue blind spot this gate exists to close).
 */
export function hasHealthyVenv(installDir: string, probes: FsProbes = defaultProbes()): boolean {
  return (
    probes.exists(path.join(installDir, 'python', 'python.exe')) &&
    probes.exists(path.join(installDir, 'venv', 'Scripts', 'python.exe')) &&
    probes.exists(path.join(installDir, 'venv', 'Lib', 'site-packages'))
  )
}

/**
 * Gate 1: engine retirement decision.
 *
 * Mirrors the PS1 freshness guard: only a checkout that looks like OUR OWN
 * fresh staging (healthy venv per the double probe + install-stamp.json)
 * skips retirement. Everything else that already carries an engine
 * (hermes_cli present) gets retired so the vendor tree re-stages clean.
 * A missing/absent install dir never retires (nothing to retire).
 */
export function classifyEngineRetirement(
  input: RetirementGatesInput,
  probes: FsProbes = defaultProbes()
): EngineRetirementVerdict {
  const { installDir, vendorDir } = input

  if (!installDir) {
    return { retireEngine: false, freshStaging: false, reason: 'no install dir' }
  }

  const enginePresent = probes.exists(path.join(installDir, 'hermes_cli'))
  const vendorRepo = vendorDir ? path.join(vendorDir, 'hermes-agent') : null
  const vendorEngineAvailable = vendorRepo ? probes.exists(vendorRepo) : false

  if (!enginePresent) {
    return { retireEngine: false, freshStaging: false, reason: 'no existing engine to retire' }
  }

  if (!vendorEngineAvailable) {
    // No vendor payload (dev / online-only path): retirement is a vendor
    // staging concern and PS1's own gate stays authoritative offline-unsafe
    // decisions. Don't retire from here.
    return {
      retireEngine: false,
      freshStaging: false,
      reason: 'no vendor engine payload; PS1 gate remains authoritative'
    }
  }

  const hasVendorStamp = probes.exists(path.join(installDir, 'install-stamp.json'))

  if (hasHealthyVenv(installDir, probes) && hasVendorStamp) {
    return {
      retireEngine: false,
      freshStaging: true,
      reason: 'fresh vendor staging (python+venv+stamp present); skip retire (upgrade-as-reinstall guard)'
    }
  }

  return {
    retireEngine: true,
    freshStaging: false,
    reason: `existing engine checkout detected${hasVendorStamp ? ' with unhealthy venv' : ' without vendor stamp'}; retire before re-staging (upgrade-as-reinstall)`
  }
}

/**
 * Gate 2: venv restaging decision.
 *
 * Mirrors the 0.17.7 vendor-runtime-stamp gate: installed stamp vs the
 * packaged vendor stamp. Mismatch (or installed stamp missing while a venv
 * exists) → rebuild. Equal stamps + a healthy venv → keep.
 */
export function classifyVenvRestaging(
  input: RetirementGatesInput,
  probes: FsProbes = defaultProbes()
): VenvRestagingVerdict {
  const { installDir, vendorDir } = input

  if (!installDir || !vendorDir) {
    return { rebuildVenv: false, reason: 'no vendor payload; nothing to compare' }
  }

  const vendorStamp = path.join(vendorDir, 'vendor-runtime-stamp.json')
  const venvPython = path.join(installDir, 'venv', 'Scripts', 'python.exe')
  const venvSitePackages = path.join(installDir, 'venv', 'Lib', 'site-packages')
  const installedStamp = path.join(installDir, 'vendor-runtime-stamp.json')

  if (!probes.exists(vendorStamp)) {
    return { rebuildVenv: false, reason: 'no vendor runtime stamp; PS1 gate remains authoritative' }
  }

  // Fresh install (no venv at all): nothing to retire; staging will build it.
  if (!probes.exists(venvPython) && !probes.exists(venvSitePackages)) {
    return { rebuildVenv: false, reason: 'no installed venv; staging builds a fresh one' }
  }

  // Corpse venv (88cfeba42b blind spot): Scripts or Lib half-missing. The PS1
  // 410 staging gate would skip restaging because Scripts\python.exe exists,
  // while the retirement guard's double probe already failed — the classic
  // residue deadlock. Force the rebuild from here so no single PS1 path can
  // leave the corpse in place.
  if (!probes.exists(venvPython) || !probes.exists(venvSitePackages)) {
    return {
      rebuildVenv: true,
      reason: 'venv residue detected (Scripts or site-packages half-missing); rebuild'
    }
  }

  const installedCommit = probes.readJsonField(installedStamp, 'commit')
  const vendorCommit = probes.readJsonField(vendorStamp, 'commit')

  if (installedCommit === null || vendorCommit === null) {
    // Unreadable stamps fail OPEN to a rebuild: an unreadable stamp is
    // indistinguishable from a broken one, and the venv rebuild is the safe
    // side (idempotent staging, one retired generation kept).
    return { rebuildVenv: true, reason: 'vendor/installed runtime stamp unreadable; rebuild venv' }
  }

  if (installedCommit !== vendorCommit) {
    return {
      rebuildVenv: true,
      reason: `vendor runtime changed (${installedCommit} -> ${vendorCommit}); rebuild venv`
    }
  }

  return { rebuildVenv: false, reason: 'vendor runtime stamp matches installed venv; keep venv' }
}

/** Combined pre-flight: the AV-immune "should we even spawn the installer" check. */
export function classifyRuntimeHealth(input: RetirementGatesInput): {
  engine: EngineRetirementVerdict
  venv: VenvRestagingVerdict
} {
  return {
    engine: classifyEngineRetirement(input),
    venv: classifyVenvRestaging(input)
  }
}

// Exposed for testability (matches the repo convention of the FsProbes-free
// public surface: tests inject via a temp dir instead).
export { defaultProbes as __defaultProbes }
