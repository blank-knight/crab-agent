// crab 0.20.5n: engine-upgrade gate — decide whether the INSTALLED runtime
// at ACTIVE_HERMES_ROOT predates this app build and must be re-staged from
// the packaged vendor tree before it can be used.
//
// Why: the backend-resolution ladder prefers a "usable" active runtime and
// never looks at its version, so a runtime staged by an old installer
// survives every app upgrade (the "dual engine" bug: app 0.20.5i shipped a
// new vendor engine, the machine kept running the 0.17-line engine staged
// weeks earlier, and every engine-side fix had to be hot-patched into the
// home tree by hand). The 0.17.7 line had this gate in main.cjs
// (isRuntimeOutdated); the renderer-rebase rewrite dropped it. This module
// restores it as a pure, testable function.
//
// Signal: the bootstrap-complete marker's desktopVersion field, written by
// install.ps1 via CRAB_DESKTOP_VERSION (see bootstrap-runner installerEnv)
// or by the desktop's own writeBootstrapMarker. Old markers (pre-0.20.5n,
// including every marker written by the fielded installers) lack the field
// entirely — they are treated as outdated so the first launch after this
// fix re-stages once from the local vendor tree, writing a versioned marker.
//
// Deliberately conservative: any unreadable/malformed marker or non-string
// version is "outdated" (re-stage). Re-staging is idempotent
// (install.ps1), keeps user data (HERMES_HOME profiles/config untouched —
// only the hermes-agent checkout and venv are refreshed), and on failure
// the ladder still has the old runtime to fall back to... except the
// failure path throws a bootstrap failure, so the gate must only force a
// re-stage when a vendor payload actually exists to re-stage from
// (payload gating happens in main.ts, which knows IS_PACKAGED).

/** Semver-ish compare for display versions like "0.20.5-m" (letters compare by code point). */
export function compareDisplayVersions(a: string, b: string): number {
  const parts = (v: string) =>
    String(v || '')
      .split(/[.-]/)
      .map(p => (/^\d+$/.test(p) ? Number(p) : p))

  const norm = (p: (number | string)[]) =>
    p.map(x => (typeof x === 'number' ? { n: 1, num: x, s: '' } : { n: 0, num: -1, s: x }))

  const A = norm(parts(a))
  const B = norm(parts(b))
  const len = Math.max(A.length, B.length)

  for (let i = 0; i < len; i++) {
    const x = A[i] || { n: 0, num: -1, s: '' }
    const y = B[i] || { n: 0, num: -1, s: '' }

    // Numeric segments beat letter segments ("0.20.5" < "0.20.5-m" — a suffix is a newer build in our scheme).
    if (x.n !== y.n) {
      return x.n - y.n
    }

    if (x.n === 1) {
      if (x.num !== y.num) {
        return x.num - y.num
      }
    } else if (x.s !== y.s) {
      return x.s < y.s ? -1 : 1
    }
  }

  return 0
}

export interface RuntimeMarkerLike {
  desktopVersion?: unknown
  [key: string]: unknown
}

/**
 * True when the installed runtime must be re-staged from the vendor tree
 * before use: no marker, unreadable marker, marker without a version
 * (pre-gate installers), or marker version older than this app.
 */
export function isRuntimeOutdated(marker: RuntimeMarkerLike | null | undefined, appVersion: string): boolean {
  if (!marker || typeof marker !== 'object') {
    return true
  }
  const v = marker.desktopVersion

  if (typeof v !== 'string' || v.length === 0) {
    return true
  }

  return compareDisplayVersions(v, appVersion) < 0
}
