// data-paths.mjs — the pure path-resolution core, shared by the desktop app
// (via data-paths.ts, a typed re-export) and the CI smoke driver (which runs
// under Node's type-stripping and therefore cannot import the app's
// extensionless TypeScript directly). No Electron imports here; only node:path.
//
// data-paths.ts re-exports these names and adds the TypeScript-facing
// `HermesHomeOptions` interface. Keep the two in lockstep: every behavior in
// this file is exercised by data-paths.test.ts through the re-export.

import path from 'node:path'

/** A HERMES_HOME rooted inside a `profiles/` directory names the profile's
 * parent (the home), not the profile directory itself. */
function normalizeHermesHomeRoot(hermesHome, pathModule) {
  if (!hermesHome) {
    return hermesHome
  }
  const resolved = pathModule.resolve(String(hermesHome))
  const parent = pathModule.dirname(resolved)
  if (pathModule.basename(parent).toLowerCase() === 'profiles') {
    return pathModule.dirname(parent)
  }
  return resolved
}

export function platformDefaultHermesHome(home, env = process.env, platform = process.platform) {
  const suffix = env.HERMES_DATA_DIR_SUFFIX || ''
  if (platform === 'win32') {
    const base = (env.LOCALAPPDATA || '').trim() || path.win32.join(home, 'AppData', 'Local')
    return path.win32.join(base, 'hermes') + suffix
  }
  return path.posix.join(home, '.hermes') + suffix
}

export function resolveDesktopUserData(defaultPath, env = process.env) {
  return env.HERMES_DESKTOP_USER_DATA_DIR
    ? path.resolve(env.HERMES_DESKTOP_USER_DATA_DIR)
    : defaultPath + (env.HERMES_DATA_DIR_SUFFIX || '')
}

export function resolveDesktopHermesHome({ home, env = process.env, platform = process.platform, directoryExists = () => false, readWindowsHome = () => null }) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  if (env.HERMES_HOME) {
    return normalizeHermesHomeRoot(env.HERMES_HOME, paths)
  }
  // Fresh-install rehearsals must not touch the real Hermes home.
  if (env.HERMES_DESKTOP_USER_DATA_DIR) {
    return paths.join(paths.resolve(env.HERMES_DESKTOP_USER_DATA_DIR), 'hermes-home')
  }
  // crab 0.20.5u (B1 fix): Windows legacy-home chain — CRAB_HOME → QIJI_HOME.
  // install.ps1 (D-tree, param block line ~30) resolves the install home through
  // CRAB_HOME → QIJI_HOME → HERMES_HOME → LOCALAPPDATA\hermes. August-era qiji
  // installs persist QIJI_HOME=%LOCALAPPDATA%\qiji as a User env var, so on
  // upgrade machines install.ps1 stages the engine under qiji\ while the
  // desktop resolver — which only honoured HERMES_HOME — kept looking in
  // hermes\. bootstrap complete → re-resolve finds nothing → bootstrap loops
  // forever (VM 2026-11-01 + Huawei user's 7 retries, bug B1).
  // Align the desktop chain with the installer's: prefer CRAB_HOME, then
  // QIJI_HOME, each only when the directory actually exists (a stale var
  // pointing at a deleted dir must not capture a fresh install), then the
  // HERMES_HOME registry fallback below, then the default. Process env first,
  // then the persisted User value via readWindowsHome, mirroring the
  // Explorer-can-miss-setx note below.
  if (platform === 'win32') {
    for (const legacyName of ['CRAB_HOME', 'QIJI_HOME']) {
      const fromProcess = (env[legacyName] || '').trim()
      if (fromProcess && directoryExists(fromProcess)) {
        return normalizeHermesHomeRoot(fromProcess, paths)
      }

      if (env[legacyName] === undefined) {
        const fromRegistry = readWindowsHome(legacyName)
        if (fromRegistry && directoryExists(fromRegistry)) {
          return normalizeHermesHomeRoot(fromRegistry, paths)
        }
      }
    }

    if (env.HERMES_HOME === undefined) {
      // Explorer can miss setx changes. An explicit empty value opts out of that fallback.
      const registryHome = readWindowsHome('HERMES_HOME')
      if (registryHome) {
        return normalizeHermesHomeRoot(registryHome, paths)
      }
    }
  }
  const defaultHome = platformDefaultHermesHome(home, env, platform)
  // Keep the legacy migration for ordinary installs, not isolated suffix runs.
  if (platform === 'win32' && !env.HERMES_DATA_DIR_SUFFIX) {
    const legacy = paths.join(home, '.hermes')
    if (!directoryExists(defaultHome) && directoryExists(legacy)) {
      return legacy
    }
  }
  return defaultHome
}
