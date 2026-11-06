interface FirstRunSetupBackend {
  activeRoot?: string
  kind?: string
  platform?: string
  /** What the local setup card represents: 'none' = installer offer, the rest = use existing. */
  local?: 'none' | 'installed' | 'bundled'
  /**
   * crab 0.20.5o: this bootstrap-needed sentinel is an ENGINE UPGRADE
   * re-stage of an existing install, not a first run — the gate must not
   * stop and ask (0.20.5n: upgrade users stalled on the choice card until
   * the renderer's 180s boot budget timed out with "couldn't start").
   */
  runtimeUpgrade?: boolean
}

// crab 0.20.5v (B15): branded builds auto-continue into local bootstrap on
// first run — the local/cloud choice card never shows. See qiji/brand.ts.
import { BRAND as QIJI_BRAND } from './qiji/brand'
const BRAND_AUTO_LOCAL_BOOTSTRAP = QIJI_BRAND.autoLocalBootstrap === true

interface FirstRunSetupGateOptions {
  /** crab 0.20.5v (B15): branded default — first run continues straight into local bootstrap. */
  autoLocal?: boolean
  hideChoice?: () => void
  log?: (message: string) => void
  onStuck?: (backend: FirstRunSetupBackend, stuckAfterMs: number) => void
  promptChoice?: (backend: FirstRunSetupBackend) => void
  stuckAfterMs?: number
}

export type FirstRunSetupDecision = 'continue-local' | 'remote-applied' | 'reset'

export function createFirstRunSetupGate({
  autoLocal = BRAND_AUTO_LOCAL_BOOTSTRAP,
  hideChoice,
  log,
  onStuck,
  promptChoice,
  stuckAfterMs = 120000
}: FirstRunSetupGateOptions = {}) {
  let localBootstrapConfirmed = false

  let waiter: {
    promise: Promise<FirstRunSetupDecision>
    resolve: (decision: FirstRunSetupDecision) => void
  } | null = null

  let stuckTimer: ReturnType<typeof setTimeout> | null = null

  const clearStuckTimer = () => {
    if (stuckTimer) {
      clearTimeout(stuckTimer)
      stuckTimer = null
    }
  }

  const armStuckTimer = (backend: FirstRunSetupBackend) => {
    clearStuckTimer()

    if (!Number.isFinite(stuckAfterMs) || stuckAfterMs <= 0 || typeof log !== 'function') {
      return
    }

    stuckTimer = setTimeout(() => {
      onStuck?.(backend, stuckAfterMs)
      log(
        `[bootstrap] still waiting for first-run setup choice after ${Math.round(stuckAfterMs / 1000)}s ` +
          `(platform=${backend?.platform || 'unknown'})`
      )
    }, stuckAfterMs)

    if (typeof stuckTimer.unref === 'function') {
      stuckTimer.unref()
    }
  }

  const shouldGate = (backend?: FirstRunSetupBackend | null) =>
    Boolean(
      backend &&
      backend.kind === 'bootstrap-needed' &&
      !backend.runtimeUpgrade &&
      !localBootstrapConfirmed &&
      // crab 0.20.5v (B15): branded default — a fresh install continues
      // straight into local bootstrap; the local/cloud choice card never
      // shows (unattended machines sat on it until the boot budget died).
      // autoLocal:false restores the upstream prompting semantics.
      !autoLocal
    )

  const wait = async (backend?: FirstRunSetupBackend | null) => {
    if (!shouldGate(backend)) {
      return 'continue-local' as const
    }

    if (waiter) {
      return waiter.promise
    }

    promptChoice?.(backend)
    armStuckTimer(backend)

    let resolveWaiter: (decision: FirstRunSetupDecision) => void = () => {}

    const promise = new Promise<FirstRunSetupDecision>(resolve => {
      resolveWaiter = resolve
    })

    waiter = { promise, resolve: resolveWaiter }

    return promise
  }

  const settleWaiter = (decision: FirstRunSetupDecision) => {
    clearStuckTimer()

    if (!waiter) {
      return false
    }

    const activeWaiter = waiter
    waiter = null
    activeWaiter.resolve(decision)

    return true
  }

  const continueLocal = () => {
    localBootstrapConfirmed = true
    settleWaiter('continue-local')
  }

  const resetForRetry = () => {
    // Reset paths are followed by a renderer reload / fresh startHermes() call.
    // Settle the old boot explicitly so it cannot fall through into local
    // bootstrap and cannot leak a forever-pending connection promise.
    settleWaiter('reset')
  }

  const resetForRepair = () => {
    resetForRetry()
    localBootstrapConfirmed = false
  }

  const abandonForRemoteApply = () => {
    // Resume the gated startHermes() with an explicit remote decision. The
    // caller re-resolves the newly-persisted remote config instead of falling
    // through into local bootstrap or leaking the original connection promise.
    const resumedWaiter = settleWaiter('remote-applied')

    if (!resumedWaiter) {
      return false
    }

    localBootstrapConfirmed = false
    hideChoice?.()

    return true
  }

  const isLocalBootstrapConfirmed = () => localBootstrapConfirmed
  const hasWaiter = () => Boolean(waiter)

  return {
    abandonForRemoteApply,
    continueLocal,
    hasWaiter,
    isLocalBootstrapConfirmed,
    resetForRepair,
    resetForRetry,
    shouldGate,
    wait
  }
}
