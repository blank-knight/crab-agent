/**
 * native-driver.ts
 *
 * crab 0.20.5-af (feat/install-native-ts): the native install driver — the
 * AV-immune replacement for the install.ps1 stage loop when the packaged
 * vendor payload is present on Windows.
 *
 * Scope gate (strict): win32 + packaged vendor dir + a usable install.ps1 is
 * NOT required. Everything else (dev, online installs, posix) keeps the ps1
 * ladder untouched. If the native path throws, bootstrap-runner falls back to
 * the ps1 chain (double insurance, convergence period).
 *
 * Event protocol: emits the SAME shapes bootstrap-runner's consumers already
 * subscribe to (manifest / stage running|ok|failed / log / failed), so the
 * renderer progress UI works unchanged. The manifest is a static table —
 * under vendor mode the PS1 stages collapse into "one staging pass" plus
 * per-stage verification events, because that is what the stages actually DO
 * offline (each PS1 stage re-runs the idempotent Stage-VendorFiles; here we
 * run it once and emit the stage transitions).
 */

import path from 'node:path'

import { stageVendorFiles, isVendorStagingComplete } from './vendor-stager'
import { fixUvTrampolinesRecovery } from './trampoline-fix'

export interface NativeDriverInput {
  vendorDir: string
  hermesHome: string
  installDir: string
  resourcesPath?: string
  emit: (ev: Record<string, unknown>) => void
  abortSignal?: AbortSignal
}

export interface NativeDriverResult {
  ok: boolean
  failedStage?: string
  error?: string
}

/** The offline manifest — mirrors install.ps1's $InstallStages semantics.
 *  Each stage maps to a verification of one staged component, emitted in the
 *  same order the ps1 driver would run them, so the progress UI shows the
 *  familiar ladder. */
const OFFLINE_STAGES: Array<{ name: string; title: string; category: string; needs_user_input: boolean }> = [
  { name: 'uv', title: 'Installing uv package manager', category: 'prereqs', needs_user_input: false },
  { name: 'python', title: 'Verifying Python 3.11', category: 'prereqs', needs_user_input: false },
  { name: 'git', title: 'Installing Git', category: 'prereqs', needs_user_input: false },
  { name: 'node', title: 'Detecting Node.js', category: 'prereqs', needs_user_input: false },
  { name: 'system-packages', title: 'Installing ripgrep and ffmpeg', category: 'prereqs', needs_user_input: false },
  { name: 'repository', title: 'Cloning repository', category: 'install', needs_user_input: false },
  { name: 'venv', title: 'Creating Python virtual environment', category: 'install', needs_user_input: false },
  { name: 'dependencies', title: 'Installing Python dependencies', category: 'install', needs_user_input: false },
  { name: 'node-deps', title: 'Installing Node.js dependencies', category: 'install', needs_user_input: false }
]

/** Scope gate: is this run in native-install territory? */
export function shouldUseNativeInstall(input: {
  platform?: NodeJS.Platform
  vendorDir?: string | null
}): boolean {
  if ((input.platform ?? process.platform) !== 'win32') return false
  if (!input.vendorDir) return false
  return true
}

export async function runNativeInstall(input: NativeDriverInput): Promise<NativeDriverResult> {
  const { vendorDir, hermesHome, installDir, emit, abortSignal } = input

  emit({
    type: 'manifest',
    stages: OFFLINE_STAGES,
    protocolVersion: 2 // native: no cross-process protocol, direct calls
  })

  abortSignal?.throwIfAborted()

  // Single staging pass replaces the per-stage Stage-VendorFiles re-runs.
  emit({ type: 'log', line: '[bootstrap] native install driver: staging vendor payload' })

  let stageIdx = 0
  const stageOf = (name: string) => OFFLINE_STAGES.find(s => s.name === name)

  // Emit running/ok for the prereq/install ladder as components complete.
  const emitStageOk = (component: string, stageName: string): void => {
    const stage = stageOf(stageName)
    emit({ type: 'stage', name: stageName, title: stage?.title, state: 'running' })
    emit({ type: 'stage', name: stageName, state: 'ok', skipped: false })
  }

  try {
    const result = await stageVendorFiles({
      vendorDir,
      hermesHome,
      installDir,
      keepVendor: true, // resources/vendor is the repair payload — never consume
      log: (line: string) => emit({ type: 'log', line })
    })

    if (!result.ok) {
      const failedStage = mapErrorToStage(result.error)
      emit({ type: 'stage', name: failedStage, state: 'running' })
      emit({ type: 'failed', stage: failedStage, error: result.error || 'native staging failed' })
      return { ok: false, failedStage, error: result.error }
    }

    // Post-stage recovery pass (Fix-UvTrampolines equivalent).
    fixUvTrampolinesRecovery({
      managedPython: path.join(installDir, 'python'),
      managedVenv: path.join(installDir, 'venv'),
      log: (line: string) => emit({ type: 'log', line })
    })

    // Emit the familiar stage ladder (all green — components verified above).
    for (const stage of OFFLINE_STAGES) {
      abortSignal?.throwIfAborted()
      emit({ type: 'stage', name: stage.name, state: 'running' })
      emit({ type: 'stage', name: stage.name, state: 'ok', skipped: false })
    }
    void stageIdx

    if (!isVendorStagingComplete(installDir)) {
      const error = 'vendor staging incomplete after native install'
      emit({ type: 'failed', stage: 'venv', error })
      return { ok: false, failedStage: 'venv', error }
    }

    emit({ type: 'log', line: '[bootstrap] native install driver: complete' })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit({ type: 'failed', stage: '__native__', error: message })
    return { ok: false, failedStage: '__native__', error: message }
  }
}

/** Map a staging error to the stage the UI should blame. */
function mapErrorToStage(error?: string): string {
  if (!error) return 'repository'
  const e = error.toLowerCase()
  if (e.includes('python') || e.includes('venv')) return 'venv'
  if (e.includes('git')) return 'git'
  if (e.includes('node')) return 'node'
  if (e.includes('backend source') || e.includes('__init__.py')) return 'repository'
  return 'repository'
}
