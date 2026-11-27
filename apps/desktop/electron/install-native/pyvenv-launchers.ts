/**
 * pyvenv-launchers.ts
 *
 * crab 0.20.5-af (feat/install-native-ts): pyvenv.cfg + hermes launchers +
 * install-stamp, migrated from install.ps1 Stage-VendorFiles steps e / B9 /
 * B13 (PS1 lines ~519-650).
 *
 * - pyvenv.cfg: home points at installDir\python (same tree) so the detached
 *   interpreter resolution in gateway_windows.py finds pythonw.exe.
 * - Launchers (B9): the desktop resolver only accepts hermes.exe/.cmd at
 *   .hermes\bin\ or hermesHome\bin\ — the offline path must publish them
 *   itself or the desktop re-resolves to null and loops bootstrap forever.
 *   Idempotent re-publish on every run: if the AV eats a launcher, the next
 *   bootstrap rewrites it (the 0.20.5-ae refresh doctrine, applied here).
 * - install-stamp.json (B13): updateMechanism=external so the engine's
 *   step_adopt_blessed_checkout never puts the PM self-update chain on the
 *   launch path.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface PyvenvOptions {
  managedVenv: string
  managedPython: string
}

export interface LauncherOptions {
  installDir: string
  hermesHome: string
  log?: (line: string) => void
}

/** Write pyvenv.cfg (home = installDir\python — same tree, no second hop). */
export function writePyvenvCfg(opts: PyvenvOptions): void {
  const { managedVenv, managedPython } = opts
  const cfg = [
    `home = ${managedPython}`,
    'implementation = CPython',
    'uv = 0.11.23',
    'version_info = 3.11.15',
    'include-system-site-packages = false',
    ''
  ].join('\n')
  fs.mkdirSync(managedVenv, { recursive: true })
  fs.writeFileSync(path.join(managedVenv, 'pyvenv.cfg'), cfg, 'utf8')
}

/**
 * Publish hermes.cmd launchers into .hermes\bin and hermesHome\bin (resolver
 * rungs 1 and 2). PYTHONPATH pinned to the install root; venv python runs
 * hermes_cli.main. Idempotent and AV-resilient: re-run on every bootstrap,
 * so a quarantined launcher self-heals on the next launch.
 */
export function publishHermesLaunchers(opts: LauncherOptions): void {
  const { installDir, hermesHome, log } = opts
  const pyLauncher = path.join(installDir, 'venv', 'Scripts', 'python.exe')
  if (!fs.existsSync(path.join(installDir, 'hermes_cli', 'main.py'))) return
  if (!fs.existsSync(pyLauncher)) return

  const body = `@echo off\r\nset "PYTHONPATH=${installDir}"\r\n"${pyLauncher}" -m hermes_cli.main %*\r\n`

  const targets = [path.join(installDir, '.hermes', 'bin'), path.join(hermesHome, 'bin')]
  for (const dir of targets) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'hermes.cmd'), body, 'utf8')
    } catch {
      /* non-fatal: other rung / next run republishes */
    }
  }
  log?.('[vendor] Published hermes launchers (.hermes\\bin + home\\bin)')
}

/** Write install-stamp.json (updateMechanism=external, B13). */
export function writeInstallStamp(opts: { installDir: string; vendorDir: string }): void {
  const { installDir, vendorDir } = opts
  let payload: Record<string, unknown>
  try {
    // Preserve the packaged stamp's fields (commit/branch/version) when the
    // vendor tree carries one; only the mechanism is forced to external.
    const packaged = path.join(vendorDir, 'hermes-agent', 'install-stamp.json')
    payload = fs.existsSync(packaged)
      ? (JSON.parse(fs.readFileSync(packaged, 'utf8')) as Record<string, unknown>)
      : {}
  } catch {
    payload = {}
  }
  payload.updateMechanism = 'external'
  payload.installedBy = 'install-native'
  try {
    fs.mkdirSync(installDir, { recursive: true })
    fs.writeFileSync(path.join(installDir, 'install-stamp.json'), JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    /* non-fatal */
  }
}
