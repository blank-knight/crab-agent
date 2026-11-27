/**
 * trampoline-fix.ts
 *
 * crab 0.20.5-af (feat/install-native-ts): the uv trampoline fix chain
 * migrated from install.ps1 (Stage-VendorFiles d.2/d.3, PS1 lines ~437-505)
 * plus the post-stage recovery pass (Fix-UvTrampolines, PS1 ~650-770).
 *
 * uv trampoline .exe files hardcode the BUILD machine's Python path; on any
 * other machine they die with "entity not found (os error 2)". The fix:
 * overwrite the trampolines with real binaries and rewrite entry points as
 * .bat wrappers that call python.exe -m <module> directly.
 *
 * Pure fs operations — no processes, no scripts, AV-invisible.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface TrampolineFixOptions {
  managedPython: string // installDir\python
  managedVenv: string // installDir\venv
  log?: (line: string) => void
}

/** DLLs python.exe statically imports (OS loader resolves at spawn, before
 *  any Python code — see PS1 d.2 comment for the objdump evidence). */
const REQUIRED_DLLS = ['python311.dll', 'python.dll', 'VCRUNTIME140.dll', 'vcruntime140_1.dll']

/** Entry-point trampolines rewritten as .bat wrappers (module map from PS1 d.3). */
const ENTRY_POINTS: Record<string, string> = {
  'hermes': 'hermes_cli.main',
  'hermes-agent': 'hermes_cli.main',
  'hermes-acp': 'hermes_cli.acp',
  'fastapi': 'fastapi',
  'edge-tts': 'edge_tts',
  'edge-playback': 'edge_playback',
  'dotenv': 'dotenv',
  'httpx': 'httpx',
  'jsonschema': 'jsonschema',
  'markdown-it': 'markdown_it',
  'distro': 'distro',
  'google-oauthlib-tool': 'google_oauthlib'
}

function copyIfPresent(src: string, dest: string): boolean {
  try {
    if (!fs.existsSync(src)) return false
    fs.copyFileSync(src, dest)
    return true
  } catch {
    return false
  }
}

/**
 * d.2: replace the trampoline python.exe with the REAL interpreter and copy
 * the runtime DLLs alongside it. Also pythonw.exe (gateway's
 * _resolve_detached_python target).
 */
export function fixUvTrampolines(opts: TrampolineFixOptions): void {
  const { managedPython, managedVenv, log } = opts
  const venvScripts = path.join(managedVenv, 'Scripts')
  const realPython = path.join(managedPython, 'python.exe')

  if (!fs.existsSync(realPython)) return
  if (!fs.existsSync(venvScripts)) return

  copyIfPresent(realPython, path.join(venvScripts, 'python.exe'))
  copyIfPresent(path.join(managedPython, 'pythonw.exe'), path.join(venvScripts, 'pythonw.exe'))

  for (const dll of REQUIRED_DLLS) {
    copyIfPresent(path.join(managedPython, dll), path.join(venvScripts, dll))
  }
  log?.('[vendor] Replaced uv trampoline python.exe with real interpreter')
}

/**
 * d.3: rewrite entry-point trampolines as .bat wrappers. Cannot binary-patch
 * (path lengths differ); the wrapper calls the venv python with -m <module>.
 * The .exe trampolines are removed so stale ones never win.
 */
export function publishEntryPoints(opts: TrampolineFixOptions): void {
  const { managedPython, managedVenv, log } = opts
  const venvScripts = path.join(managedVenv, 'Scripts')
  if (!fs.existsSync(venvScripts)) return

  const pythonExe = path.join(managedPython, 'python.exe')

  for (const [name, module] of Object.entries(ENTRY_POINTS)) {
    const exe = path.join(venvScripts, `${name}.exe`)
    if (!fs.existsSync(exe)) continue
    const bat = path.join(venvScripts, `${name}.bat`)
    // CRLF batch wrapper, same shape the online path writes.
    const body = `@echo off\r\n"${pythonExe}" -m ${module} %*\r\n`
    try {
      fs.writeFileSync(bat, body, 'utf8')
      fs.rmSync(exe, { force: true })
    } catch {
      /* non-fatal: the trampoline exe remains, entry point still resolves */
    }
  }
  log?.('[vendor] Replaced entry-point trampolines with batch wrappers')
}

/**
 * Post-stage recovery pass (PS1 Fix-UvTrampolines): fires when vendor\python
 * was missing at stage time and the uv store on THIS machine has a usable
 * CPython. Mirrors the PS1 probe (trampoline marker bytes) so it is a no-op
 * once d.2 already fixed the venv.
 */
export function fixUvTrampolinesRecovery(opts: TrampolineFixOptions & { appData?: string }): void {
  const { managedPython, managedVenv, appData, log } = opts
  const realPython = path.join(managedPython, 'python.exe')
  const venvPythonExe = path.join(managedVenv, 'Scripts', 'python.exe')

  // Trampoline detection: uv trampolines embed the build-machine python path.
  function isTrampoline(p: string): boolean {
    try {
      const head = fs.readFileSync(p).subarray(0, 512 * 1024).toString('latin1')
      return head.includes('uv\\python\\cpython') || head.includes('trampoline')
    } catch {
      return false
    }
  }

  if (!fs.existsSync(venvPythonExe)) return

  if (!fs.existsSync(realPython)) {
    // Recovery: locate a real interpreter in the local uv managed store.
    const roots = [
      appData ? path.join(appData, 'uv', 'python') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'uv', 'python') : null,
      process.env.APPDATA ? path.join(process.env.APPDATA, 'uv', 'python') : null
    ].filter((r): r is string => Boolean(r))

    for (const root of roots) {
      let cands: fs.Dirent[]
      try {
        cands = fs.readdirSync(root, { withFileTypes: true })
      } catch {
        continue
      }
      const match = cands
        .filter(e => e.isDirectory() && /^cpython-3\.11.*windows.*x86_64/.test(e.name))
        .map(e => path.join(root, e.name))
        .sort()
        .reverse()[0]
      if (match && fs.existsSync(path.join(match, 'python.exe'))) {
        log?.(`[trampoline] InstallDir\\python missing, recovering from uv store: ${match}`)
        fs.mkdirSync(managedPython, { recursive: true })
        copyTree(match, managedPython)
        break
      }
    }
  }

  if (!fs.existsSync(path.join(managedPython, 'python.exe'))) return
  if (!isTrampoline(venvPythonExe)) return

  log?.('[trampoline] Detected uv trampolines, replacing with real interpreter...')
  fixUvTrampolines({ managedPython, managedVenv, log })
  publishEntryPoints({ managedPython, managedVenv, log })
}

/** Small recursive copy for the recovery path (robocopy is overkill for a
 *  single interpreter dir; pure fs keeps this synchronous and script-free). */
function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyTree(s, d)
    else {
      try {
        fs.copyFileSync(s, d)
      } catch {
        /* best effort, mirrors PS1 robocopy /R:1 semantics */
      }
    }
  }
}
