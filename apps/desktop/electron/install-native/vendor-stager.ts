/**
 * vendor-stager.ts
 *
 * crab 0.20.5-af (2026-11-27, feat/install-native-ts): the DO half of offline
 * vendor staging, migrated from install.ps1 Stage-VendorFiles (lines ~194-650).
 *
 * Why: install.ps1 must land on disk to run, and the corporate AV policy on
 * GBJ-1094 (Huorong) quarantines ANY .ps1 that appears under the user profile
 * within ~100ms of write — ephemeral, renamed, or GitHub-fetched alike (three
 * rounds of field logs, 2026-11-26/27). The compiled, encrypted main process
 * is the only installer authority such a machine can never kill. This module
 * stages the six vendor components into their managed locations WITHOUT ever
 * writing a script file:
 *
 *   1. bin\uv.exe        -> hermesHome\bin\uv.exe          (file copy)
 *   2. git\              -> hermesHome\git\               (robocopy /E)
 *   3. node\             -> hermesHome\node\              (robocopy /E)
 *   4. tools\rg.exe      -> hermesHome\tools\rg.exe       (file copy)
 *   5. hermes-agent\     -> installDir (engine checkout) (robocopy /E, after
 *                            retirement gate + git stub-init)
 *   6. python\ + venv\   -> installDir\python + installDir\venv
 *                            (robocopy /E + trampoline fix + pyvenv.cfg)
 *
 * The DECISION half (when to retire, when to rebuild the venv) already lives
 * in engine-retirement-gate.ts (0.20.5-ad+1) — this module executes those
 * verdicts. Stage semantics mirror PS1's idempotent contract: every component
 * probes for its completion marker and skips work already done, so re-runs
 * converge to the same tree (the "runs once per stage" property bootstrap
 * relies on).
 *
 * robocopy.exe stays the copy engine: it is a signed Windows-system binary
 * the AV does not flag, and rewriting a 40k-file tree copier would re-tread
 * every perf/path bug the PS1 version already solved (/MT threading, retry
 * semantics, long paths).
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { classifyRuntimeHealth, hasHealthyVenv } from '../engine-retirement-gate'
import { gitStubInit } from './git-init'
import { fixUvTrampolines, publishEntryPoints } from './trampoline-fix'
import { writePyvenvCfg, publishHermesLaunchers, writeInstallStamp } from './pyvenv-launchers'

export interface StageVendorOptions {
  /** resources/vendor from the packaged app; the offline gold mine. */
  vendorDir: string
  /** Hermes home (= %LOCALAPPDATA%\hermes on win). */
  hermesHome: string
  /** Managed engine checkout dir (hermes-agent). */
  installDir: string
  /** true to keep resources/vendor intact (desktop always keeps it). */
  keepVendor?: boolean
  /** robocopy /MT thread count (Defender-aware callers lower it). */
  robocopyMT?: number
  /** Logger fed back into bootstrap-runner's emit('log'). */
  log?: (line: string) => void
}

const DEFAULT_MT = 16

// ---------------------------------------------------------------------------
// robocopy wrapper — the ONLY bulk copy primitive (system exe, AV-safe).
// ---------------------------------------------------------------------------

export async function robocopy(
  source: string,
  dest: string,
  opts: { mt?: number; extraArgs?: string[] } = {}
): Promise<boolean> {
  const args = [
    source,
    dest,
    '/E',
    '/NJH',
    '/NJS',
    '/NFL',
    '/NDL',
    '/NP',
    '/R:1',
    '/W:1',
    '/MT:' + (opts.mt ?? DEFAULT_MT)
  ]
  if (opts.extraArgs) args.push(...opts.extraArgs)

  return await new Promise(resolve => {
    const child = spawn('robocopy.exe', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    })
    child.on('error', () => resolve(false))
    child.on('close', code => {
      // robocopy exit codes: 0 = nothing copied, 1 = files copied, >=8 = failure
      resolve(typeof code === 'number' && code < 8)
    })
  })
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function copyFileIfMissing(src: string, dest: string, log?: (l: string) => void): boolean {
  if (!fs.existsSync(src)) return false
  if (fs.existsSync(dest)) return true // idempotent: already staged
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
  log?.(`[vendor] Staged ${path.basename(dest)}`)
  return true
}

// ---------------------------------------------------------------------------
// Retire helpers (execute the verdicts from engine-retirement-gate).
// Mirrors PS1: rename keeps one generation for post-mortem, older removed.
// ---------------------------------------------------------------------------

function retireDir(dir: string, prefix: string, log?: (l: string) => void): void {
  if (!fs.existsSync(dir)) return
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
  const retired = path.join(path.dirname(dir), `${prefix}-${ts}`)
  try {
    fs.renameSync(dir, retired)
    log?.(`[vendor] Retired ${path.basename(dir)} -> ${path.basename(retired)}`)
  } catch {
    return // rename failed (locked): leave in place, staging merges over it
  }
  pruneGenerations(path.dirname(dir), `${prefix}-`, 1)
}

function pruneGenerations(parent: string, prefix: string, keep: number): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true })
  } catch {
    return
  }
  const gens = entries
    .filter(e => e.isDirectory() && e.name.startsWith(prefix))
    .map(e => e.name)
    .sort()
    .reverse() // newest first
  for (const name of gens.slice(keep)) {
    try {
      fs.rmSync(path.join(parent, name), { recursive: true, force: true })
    } catch {
      /* non-fatal, next run prunes again */
    }
  }
}

// ---------------------------------------------------------------------------
// The six-component stager (PS1 Stage-VendorFiles, decision logic delegated
// to engine-retirement-gate; mutations live here).
// ---------------------------------------------------------------------------

export interface StageVendorResult {
  /** true when every present component staged (missing components skip). */
  ok: boolean
  /** Human-readable failure reason when ok is false. */
  error?: string
  /** Components that were staged or verified this run. */
  staged: string[]
}

export async function stageVendorFiles(opts: StageVendorOptions): Promise<StageVendorResult> {
  const { vendorDir, hermesHome, installDir } = opts
  const log = opts.log ?? (() => {})
  const mt = opts.robocopyMT ?? DEFAULT_MT
  const staged: string[] = []

  if (!fs.existsSync(vendorDir)) {
    return { ok: false, error: `vendor dir not found: ${vendorDir}`, staged }
  }

  // ---- retirement gates (DECISION from engine-retirement-gate, MUTATION here)
  const gates = classifyRuntimeHealth({ installDir, vendorDir })

  if (gates.engine.retireEngine) {
    retireDir(installDir, 'hermes-agent.retired', log)
  } else {
    log(`[vendor] engine gate: ${gates.engine.reason}`)
  }

  if (gates.venv.rebuildVenv) {
    log(`[vendor] venv gate: ${gates.venv.reason}`)
    retireDir(path.join(installDir, 'venv'), 'venv.old', log)
    const vendorStamp = path.join(vendorDir, 'vendor-runtime-stamp.json')
    if (fs.existsSync(vendorStamp)) {
      fs.copyFileSync(vendorStamp, path.join(installDir, 'vendor-runtime-stamp.json'))
    }
  }

  // ---- 1. uv.exe -> hermesHome\bin\uv.exe
  if (
    copyFileIfMissing(
      path.join(vendorDir, 'bin', 'uv.exe'),
      path.join(hermesHome, 'bin', 'uv.exe'),
      log
    )
  ) {
    staged.push('uv')
  }

  // ---- 2. PortableGit -> hermesHome\git (merge copy; vendor never gutted)
  const managedGit = path.join(hermesHome, 'git')
  if (fs.existsSync(path.join(vendorDir, 'git'))) {
    if (!fs.existsSync(path.join(managedGit, 'bin', 'bash.exe'))) {
      const ok = await robocopy(path.join(vendorDir, 'git'), managedGit, { mt })
      if (!fs.existsSync(path.join(managedGit, 'bin', 'bash.exe'))) {
        return { ok: false, error: 'git\\bin\\bash.exe missing after staging', staged }
      }
      log('[vendor] Staged PortableGit')
    }
    staged.push('git')
  }

  // ---- 3. Node.js -> hermesHome\node
  const managedNode = path.join(hermesHome, 'node')
  if (fs.existsSync(path.join(vendorDir, 'node'))) {
    if (!fs.existsSync(path.join(managedNode, 'node.exe'))) {
      const ok = await robocopy(path.join(vendorDir, 'node'), managedNode, { mt })
      if (!fs.existsSync(path.join(managedNode, 'node.exe'))) {
        return { ok: false, error: 'node\\node.exe missing after staging', staged }
      }
      log('[vendor] Staged Node.js')
    }
    staged.push('node')
  }

  // ---- 4. ripgrep -> hermesHome\tools\rg.exe
  if (
    copyFileIfMissing(
      path.join(vendorDir, 'tools', 'rg.exe'),
      path.join(hermesHome, 'tools', 'rg.exe'),
      log
    )
  ) {
    staged.push('ripgrep')
  }

  // ---- 5. engine repo -> installDir (robocopy /E merge over retired dir)
  const vendorRepo = path.join(vendorDir, 'hermes-agent')
  if (fs.existsSync(vendorRepo)) {
    ensureDir(path.dirname(installDir))
    const ok = await robocopy(vendorRepo, installDir, { mt })
    if (!fs.existsSync(path.join(installDir, 'hermes_cli', '__init__.py'))) {
      return {
        ok: false,
        error: 'Backend source copy incomplete: hermes_cli\\__init__.py not found',
        staged
      }
    }
    // git stub-init so update/rev-parse checks pass (see git-init.ts)
    const gitOk = await gitStubInit({ installDir, log })
    if (!gitOk) {
      log('[vendor] WARNING: git stub init failed; updates will use HTTP fallback')
    }
    log('[vendor] Staged hermes-agent repository')
    staged.push('repository')
  }

  // ---- 6. python + venv
  const vendorPython = path.join(vendorDir, 'python')
  const vendorSitePackages = path.join(vendorDir, 'site-packages')
  const vendorVenvScripts = path.join(vendorDir, 'venv-scripts')
  const managedPython = path.join(installDir, 'python')
  const managedVenv = path.join(installDir, 'venv')
  const venvComplete =
    fs.existsSync(path.join(managedVenv, 'Scripts', 'python.exe')) &&
    fs.existsSync(path.join(managedVenv, 'Lib', 'site-packages'))

  if (fs.existsSync(vendorPython) && fs.existsSync(vendorSitePackages) && !venvComplete) {
    // a) interpreter
    if (!fs.existsSync(path.join(managedPython, 'python.exe'))) {
      await robocopy(vendorPython, managedPython, { mt })
    }
    if (!fs.existsSync(path.join(managedPython, 'python.exe'))) {
      return { ok: false, error: 'Python interpreter copy failed: python.exe not found', staged }
    }
    if (!fs.existsSync(path.join(managedPython, 'python311.dll'))) {
      return { ok: false, error: 'Python interpreter copy failed: python311.dll not found', staged }
    }
    log(`[vendor] Staged Python 3.11.15 interpreter -> ${managedPython}`)

    // b) venv skeleton + site-packages
    ensureDir(path.join(managedVenv, 'Scripts'))
    ensureDir(path.join(managedVenv, 'Lib'))
    if (!fs.existsSync(path.join(managedVenv, 'Lib', 'site-packages'))) {
      await robocopy(vendorSitePackages, path.join(managedVenv, 'Lib', 'site-packages'), { mt })
    }
    if (fs.existsSync(vendorVenvScripts)) {
      await robocopy(vendorVenvScripts, path.join(managedVenv, 'Scripts'), { mt })
    }

    // c) trampoline fix (real python.exe + DLLs + entry-point .bat wrappers)
    fixUvTrampolines({ managedPython, managedVenv, log })
    publishEntryPoints({ managedPython, managedVenv, log })

    // d) pyvenv.cfg
    writePyvenvCfg({ managedVenv, managedPython })

    staged.push('python', 'venv')
  } else if (venvComplete) {
    staged.push('python', 'venv')
  }

  // ---- 7. launchers + install stamp (B9/B13 fixes, now AV-immune)
  publishHermesLaunchers({ installDir, hermesHome, log })
  writeInstallStamp({ installDir, vendorDir })

  return { ok: true, staged }
}

/** Completion probe bootstrap-runner can call before/after staging. */
export function isVendorStagingComplete(installDir: string): boolean {
  return (
    fs.existsSync(path.join(installDir, 'hermes_cli', '__init__.py')) &&
    hasHealthyVenv(installDir) &&
    fs.existsSync(path.join(installDir, 'install-stamp.json'))
  )
}
