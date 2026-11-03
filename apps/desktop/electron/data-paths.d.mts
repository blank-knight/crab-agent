export function platformDefaultHermesHome(
  home: string,
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string

export function resolveDesktopUserData(defaultPath: string, env?: NodeJS.ProcessEnv): string

export interface HermesHomeOptions {
  home: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  directoryExists?: (directory: string) => boolean
  /** crab 0.20.5u (B1 fix): resolves a persisted User-scope env var by name
   * (HERMES_HOME, or a legacy CRAB_HOME / QIJI_HOME from the installer's
   * home chain). Callers pass a reg-query-backed lookup on Windows. */
  readWindowsHome?: (name?: string) => string | null
}

export function resolveDesktopHermesHome(options: HermesHomeOptions): string
