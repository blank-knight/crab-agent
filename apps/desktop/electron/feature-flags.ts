const featureFlags = {
  /** Local-models GUI surfaces (settings pane, pickers, statusbar, tips). */
  localModels: ({ argv }) => process.platform === 'win32' || process.platform === 'darwin' || argv.includes('--local'),
  /**
   * E2E bypass for the qiji login wall. Playwright drives the packaged app with
   * a fake backend that has no auth server; the login overlay would cover the
   * chat UI and every update-E2E "app becomes interactive" wait would time out.
   * Set via HERMES_DESKTOP_E2E_SKIP_LOGIN=1 in the harness env (never set for
   * real users; the flag only mutes the overlay, it grants no credentials).
   */
  e2eSkipLogin: ({ argv }) => process.env.HERMES_DESKTOP_E2E_SKIP_LOGIN === '1' || argv.includes('--e2e-skip-login')
} satisfies Record<string, (args: FeatureFlagInput) => boolean>

export type FeatureFlags = { [K in keyof typeof featureFlags]: boolean }

export function isCanaryTag(tag: string | null | undefined): boolean {
  return /\+canary\.20\d{6}T\d{6}Z$/.test(tag || '')
}

export interface FeatureFlagInput {
  /** desktop launch flags */
  argv: readonly string[]
  /** Whether this artifact is a canary-channel build. */
  canary: boolean
}

export function resolveFeatureFlags(input: FeatureFlagInput): FeatureFlags {
  return Object.fromEntries(Object.entries(featureFlags).map(([k, v]) => [k, v(input)])) as FeatureFlags
}
