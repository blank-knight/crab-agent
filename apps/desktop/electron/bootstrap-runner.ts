/**
 * bootstrap-runner.ts
 *
 * Drives apps/desktop's first-launch install of Hermes Agent by spawning
 * scripts/install.ps1 stage-by-stage and streaming progress events back to
 * the renderer.
 *
 * Wired from electron/main.ts:
 *   import { runBootstrap }from './bootstrap-runner'
 *   const result = await runBootstrap({
 *     installStamp,        // INSTALL_STAMP from main.ts (may be null in dev)
 *     activeRoot,          // ACTIVE_HERMES_ROOT
 *     sourceRepoRoot,      // SOURCE_REPO_ROOT (for dev install.ps1 lookup)
 *     hermesHome,          // HERMES_HOME
 *     logRoot,             // HERMES_HOME/logs
 *     emit: ev => {...}    // event sink (sender.send or similar)
 *   })
 *
 * Emits events with shape:
 *   { type: 'manifest',  stages: [{name, title, category, needs_user_input}, ...] }
 *   { type: 'stage',     name, state: 'running'|'succeeded'|'skipped'|'failed',
 *                        json?, durationMs?, error? }
 *   { type: 'log',       stage?, line, stream: 'stdout'|'stderr' } // one installer line, escapes stripped
 *   { type: 'complete',  marker: <written marker payload> }
 *   { type: 'failed',    stage?, error }     // bootstrap aborted
 *
 * Resolves with the same shape as the final 'complete' or 'failed' event so
 * callers can await either way.
 *
 * NOT implemented yet (deferred to Phase 1E / 1F):
 *   - User-facing retry / cancel from the renderer (event channels exist;
 *     no UI consumes them yet)
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'

// Relative, not `@hermes/shared/ansi`: the electron bundle is built by esbuild
// with no tsconfig path resolution (see scripts/bundle-electron-main.mjs).
import { stripAnsi } from '../../shared/src/ansi'
import { pathEnvKey, storeFirstPath } from './backend-env'
import { classifyRuntimeHealth } from './engine-retirement-gate'
import { hiddenWindowsChildOptions } from './windows-child-options'
// crab 0.20.5-af (feat/install-native-ts): AV-immune native installer.
import { runNativeInstall, shouldUseNativeInstall } from './install-native/native-driver'

const IS_WINDOWS = process.platform === 'win32'

const STAMP_COMMIT_RE = /^[0-9a-f]{7,40}$/i
const FALLBACK_COMMIT_RE = /^0{7,40}$/
const FALLBACK_BRANCH = 'main'

function isPinnedCommit(commit) {
  return typeof commit === 'string' && STAMP_COMMIT_RE.test(commit) && !FALLBACK_COMMIT_RE.test(commit)
}

type ExecGitFn = (args: string[], cwd: string) => string
type ResolveHeadFn = (activeRoot: string | null | undefined) => string | null

/**
 * Read HEAD from a managed checkout. Used after bootstrap so fallback
 * (all-zero) install stamps still produce a marker that
 * isBootstrapComplete() accepts (pinnedCommit length >= 7).
 */
function resolveCheckoutHead(
  activeRoot: string | null | undefined,
  opts: { execGit?: ExecGitFn; gitBinary?: string } = {}
): string | null {
  if (!activeRoot) {
    return null
  }

  // Bare 'git' takes the first PATH hit, which can exist yet be unlaunchable
  // (Intel-only build on Apple Silicon); main.ts passes its probed binary.
  const run: ExecGitFn =
    opts.execGit ||
    ((args, cwd) =>
      execFileSync(opts.gitBinary || 'git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
        ...hiddenWindowsChildOptions()
      }).trim())

  try {
    const sha = run(['-c', 'windows.appendAtomically=false', 'rev-parse', 'HEAD'], activeRoot)

    return isPinnedCommit(sha) ? sha : null
  } catch {
    return null
  }
}

/** Prefer a real pin already written by install.ps1's bootstrap-marker stage. */
function readExistingPinnedCommit(activeRoot: string | null | undefined): string | null {
  if (!activeRoot) {
    return null
  }

  try {
    const raw = fs.readFileSync(path.join(activeRoot, '.hermes-bootstrap-complete'), 'utf8')
    const parsed = JSON.parse(raw)

    return parsed && isPinnedCommit(parsed.pinnedCommit) ? parsed.pinnedCommit : null
  } catch {
    return null
  }
}

/**
 * Pick the commit to store on the bootstrap-complete marker.
 * The installed checkout owns source runtime identity: its live HEAD wins, so
 * a repair/update bootstrap reports the commit the checkout is actually at,
 * never the older commit baked into the packaged app. Packaged fallback stamps
 * (all-zero) are not real pins and never win.
 */
function resolveMarkerPinnedCommit(
  installStamp: { commit?: string; branch?: string | null } | null | undefined,
  activeRoot: string | null | undefined,
  opts: { resolveHead?: ResolveHeadFn } = {}
): string | null {
  const resolveHead = opts.resolveHead || resolveCheckoutHead

  const head = resolveHead(activeRoot)

  if (head) {
    return head
  }

  if (installStamp && isPinnedCommit(installStamp.commit)) {
    return installStamp.commit
  }

  return readExistingPinnedCommit(activeRoot)
}

/**
 * Map an install stamp to the same source identity the installer stages use.
 * Fresh installs use the packaged immutable SHA. Existing checkouts
 * intentionally ignore that old app pin and follow the branch, so the script
 * must follow the branch too or old installer code can drive a newer tree.
 * Non-git fallback stamps also follow the branch (#50823).
 */
function installRefForStamp(installStamp, { pinCommit = true } = {}) {
  if (pinCommit && installStamp && isPinnedCommit(installStamp.commit)) {
    return {
      ref: installStamp.commit,
      cacheKey: installStamp.commit,
      pinned: true
    }
  }

  const validStamp =
    installStamp &&
    typeof installStamp.commit === 'string' &&
    (isPinnedCommit(installStamp.commit) || FALLBACK_COMMIT_RE.test(installStamp.commit))

  if (validStamp) {
    const ref = installStamp.branch || FALLBACK_BRANCH

    return {
      ref,
      cacheKey: `branch-${String(ref).replace(/[^0-9A-Za-z._-]/g, '_')}`,
      pinned: false
    }
  }

  return null
}

// Stages flagged needs_user_input=true in the manifest are skipped by the
// runner (passed -NonInteractive to install.ps1, which the install script
// itself handles by emitting skipped=true frames). The renderer / 1E onboarding
// overlay takes over for those concerns (API keys, model, persona, gateway).
// We let install.ps1's own -NonInteractive logic drive this rather than
// filtering client-side -- single source of truth.

// ---------------------------------------------------------------------------
// install.ps1 source resolution
// ---------------------------------------------------------------------------

function installScriptName() {
  return process.platform === 'win32' ? 'install.ps1' : 'install.sh'
}

function installScriptKind() {
  return process.platform === 'win32' ? 'powershell' : 'posix'
}

// crab 0.20.5-ad+1 (2026-11-26, feat/ps1-ephemeral): install.ps1 is no longer
// shipped as a standing resources/install.ps1 (extraResources removed — that
// bare PS file was the AV's favourite quarantine target). resolveBundled
// now EXTRACTS the asar copy to a short-lived file under
// HERMES_HOME/bootstrap-cache/ and bootstrap-runner deletes it in runBootstrap's
// finally (see ephemeral script lifecycle). Returns null when the asar copy is
// unreadable, falling back to the GitHub download ladder (behaviour never
// regresses below the pre-ac baseline).
function resolveBundledInstallScript(resourcesPath, hermesHome) {
  if (!resourcesPath || process.platform !== 'win32') {
    return null
  }

  return materializeEphemeralInstallScript(resourcesPath, hermesHome)
}

// Extract the asar copy (app.asar/scripts/install.ps1 — Electron's fs shim
// reads inside the archive) to a deterministic short-lived path. The path is
// stable per (appRoot, script sha) so a same-machine retry finds the same
// file instead of accumulating copies; each runBootstrap deletes it in its
// finally block.
// crab 0.20.5-ae (2026-11-27, GBJ-1094 field incident): app.asar lives INSIDE
// resources/ (electron-builder standard layout, verified against the real
// win-unpacked tree). The pre-ae code joined app.asar to the app ROOT
// (<install>/app.asar/...), which does not exist on a real install — every
// materialize silently failed, the runner fell to the GitHub ladder, and the
// company AV ate the downloaded .ps1 (field log bootstrap-2026-11-27:
// CommandNotFoundException on install-branch-main.ps1). The same wrong path
// had been silently disabling the b24ab344/1ae7f0ecdf asar heals all along —
// synthetic test layouts matched the wrong path, so the tests stayed green.
// Primary candidate = resources/app.asar; the legacy appRoot form is kept as
// a fallback for exotic layouts. readFileSync is the best-shimmed asar read
// (no accessSync — one less shim dependency).
function materializeEphemeralInstallScript(resourcesPath, hermesHome) {
  if (!resourcesPath || process.platform !== 'win32') {
    return null
  }

  let scriptBytes = null

  const asarCandidates = [
    path.join(resourcesPath, 'app.asar', 'scripts', 'install.ps1'),
    path.join(path.dirname(resourcesPath), 'app.asar', 'scripts', 'install.ps1')
  ]

  for (const candidate of asarCandidates) {
    try {
      const bytes = fs.readFileSync(candidate)

      if (bytes && bytes.length > 0) {
        scriptBytes = bytes
        break
      }
    } catch {
      void 0
    }
  }

  if (!scriptBytes) {
    return null
  }

  try {
    const cacheDir = path.join(hermesHome || path.join(resourcesPath, '..', '..'), 'bootstrap-cache')

    fs.mkdirSync(cacheDir, { recursive: true })

    const scriptSha = createHash('sha256').update(scriptBytes).digest('hex').slice(0, 12)
    const ephemeralPath = path.join(cacheDir, `ephemeral-install-${scriptSha}.ps1`)

    // Write fresh bytes every run: a previous run's file may have been
    // quarantined mid-write, and overwrite is cheaper than a stat round-trip.
    fs.writeFileSync(ephemeralPath, scriptBytes)
    fs.utimesSync(ephemeralPath, new Date(), new Date())

    return ephemeralPath
  } catch {
    return null
  }
}

// crab 0.20.5-ae (GBJ-1094 incident): re-materialize fresh bytes immediately
// before EVERY spawn of the ephemeral script. The company AV quarantines
// .ps1 files within ~100ms of creation; rewriting right before each spawn
// shrinks the exposure window to write→spawn (~10ms) and self-heals any
// stage-to-stage quarantine without waiting for the heal-retry path.
// Standing paths (posix dev / downloaded cache) pass through untouched.
function refreshEphemeralScript(scriptPath, resourcesPath, hermesHome) {
  if (
    !scriptPath ||
    !resourcesPath ||
    process.platform !== 'win32' ||
    !/ephemeral-install-[0-9a-f]{12}\.ps1$/.test(path.basename(scriptPath))
  ) {
    return scriptPath
  }

  return materializeEphemeralInstallScript(resourcesPath, hermesHome) || scriptPath
}

// crab 0.20.5-ad+2 (verifier finding #1): cleanup is a DIRECTORY SWEEP, not a
// registry — resolveInstallScript's materialize runs BEFORE
// scriptPathForCleanup is assigned (abort between the two leaves an orphan),
// a materialize can half-succeed (file written, utimes EPERM → catch null →
// never registered), and heal materializes a second path the registry never
// sees. Sweep every ephemeral-install-*.ps1 under HERMES_HOME/bootstrap-cache/
// at run end; the directory is app-owned so the sweep cannot hit foreign
// files. Best effort: locked files are inert (next run overwrites them).
function cleanupEphemeralInstallScriptsInDir(hermesHome) {
  try {
    const cacheDir = path.join(hermesHome, 'bootstrap-cache')
    const entries = fs.readdirSync(cacheDir)

    for (const entry of entries) {
      if (/^ephemeral-install-[0-9a-f]{12}\.ps1$/.test(entry)) {
        try {
          fs.unlinkSync(path.join(cacheDir, entry))
        } catch {
          void 0
        }
      }
    }
  } catch {
    void 0
  }
}

// Legacy single-path cleanup kept for API compatibility (tests): removes the
// file only when the basename matches the ephemeral pattern.
function cleanupEphemeralInstallScript(scriptPath) {
  try {
    if (scriptPath && /ephemeral-install-[0-9a-f]{12}\.ps1$/.test(path.basename(scriptPath))) {
      fs.unlinkSync(scriptPath)
    }
  } catch {
    void 0
  }
}

// crab 0.20.5-ac+1 (2026-11-26): restore install.ps1 to its expected path from
// the asar copy, for the vanish-then-spawn race (AV quarantines between
// resolve and spawn). crab 0.20.5-ad+1 (feat/ps1-ephemeral): the expected
// path is now the ephemeral file itself — re-extract fresh bytes from the
// asar copy rather than reviving a possibly-tampered standing file. Returns
// the re-materialized path or null.
// crab 0.20.5-ad+2 (verifier finding #2): heal only when the run's script IS
// the ephemeral one (basename matches) — a downloaded/pinned script that got
// quarantined must NOT be silently swapped for the asar copy (script version
// drift mid-run); its ladder is the GitHub re-download, not asar.
function healVanishedInstallScript(scriptPath, resourcesPath, hermesHome) {
  if (
    !scriptPath ||
    !resourcesPath ||
    process.platform !== 'win32' ||
    // Only the ephemeral script heals from the asar copy; downloaded/local
    // standing scripts fall through to null (original fallback ladder).
    !/ephemeral-install-[0-9a-f]{12}\.ps1$/.test(path.basename(scriptPath))
  ) {
    return null
  }

  return materializeEphemeralInstallScript(resourcesPath, hermesHome)
}

function resolveLocalInstallScript(sourceRepoRoot) {
  if (!sourceRepoRoot) {
    return null
  }

  const candidate = path.join(sourceRepoRoot, 'scripts', installScriptName())

  try {
    fs.accessSync(candidate, fs.constants.R_OK)

    return candidate
  } catch {
    return null
  }
}

function bootstrapCacheDir(hermesHome) {
  return path.join(hermesHome, 'bootstrap-cache')
}

function hasExistingGitCheckout(activeRoot) {
  if (!activeRoot) {
    return false
  }

  try {
    return fs.existsSync(path.join(activeRoot, '.git'))
  } catch {
    return false
  }
}

function cachedScriptPath(hermesHome, cacheKey) {
  return path.join(bootstrapCacheDir(hermesHome), `install-${cacheKey}.${process.platform === 'win32' ? 'ps1' : 'sh'}`)
}

function downloadInstallScript(ref, destPath) {
  // Fetch from GitHub raw at the install ref: the packaged SHA for a fresh
  // install, the branch for an existing checkout or a non-git fallback stamp
  // (never the all-zero placeholder, which is not a real GitHub commit).
  // crab 0.20.5-fix (2026-11-25, 公司机实锤): 源仓从上游 NousResearch/hermes-agent
  // 切到本产品仓 blank-knight/crab-agent —— 上游脚本没有 -VendorDir/-KeepVendor 私有
  // 参数,老用户升级通道拉上游脚本秒炸 NamedParameterNotFound → prerequisites 阶段
  // 失败 → 后端永不启动 → 登录页输入框永久禁用(用户报"点输入框没反应")。
  // 本仓是 fork,scripts/install.ps1 与包内 bundled 版同源;公司网络实测可直连
  // raw.githubusercontent.com(2026-11-25 验证 HTTP 200)。
  const scriptName = installScriptName()
  const url = `https://raw.githubusercontent.com/blank-knight/crab-agent/${ref}/scripts/${scriptName}`

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const tmpPath = destPath + '.tmp'
    const out = fs.createWriteStream(tmpPath)
    https
      .get(url, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // GitHub raw shouldn't redirect for a SHA URL, but follow once
          // defensively.
          out.close()
          fs.unlinkSync(tmpPath)
          https
            .get(res.headers.location, res2 => {
              if (res2.statusCode !== 200) {
                reject(
                  new Error(
                    `Failed to download ${scriptName}: HTTP ${res2.statusCode} from redirect ${res.headers.location}`
                  )
                )

                return
              }

              const out2 = fs.createWriteStream(tmpPath)
              res2.pipe(out2)
              out2.on('finish', () => {
                out2.close()
                fs.renameSync(tmpPath, destPath)
                resolve(destPath)
              })
              out2.on('error', reject)
            })
            .on('error', reject)

          return
        }

        if (res.statusCode !== 200) {
          out.close()

          try {
            fs.unlinkSync(tmpPath)
          } catch {
            void 0
          }

          reject(new Error(`Failed to download ${scriptName}: HTTP ${res.statusCode} from ${url}`))

          return
        }

        res.pipe(out)
        out.on('finish', () => {
          out.close()
          fs.renameSync(tmpPath, destPath)
          resolve(destPath)
        })
        out.on('error', err => {
          try {
            fs.unlinkSync(tmpPath)
          } catch {
            void 0
          }

          reject(err)
        })
      })
      .on('error', err => {
        try {
          fs.unlinkSync(tmpPath)
        } catch {
          void 0
        }

        reject(err)
      })
  })
}

async function resolveInstallScript({
  installStamp,
  sourceRepoRoot,
  hermesHome,
  emit,
  pinCommit = true,
  resourcesPath = null,
  _download = downloadInstallScript
}) {
  // 0. crab 0.20.5n: packaged build — use the install.ps1 shipped in the
  //    package (same bytes this build was built and QA'd with; works
  //    offline). crab 0.20.5-ad+1: it ships ONLY inside app.asar now and is
  //    extracted to a short-lived file (deleted when the run ends). Dev keeps
  //    the local-checkout shortcut below.
  if (!sourceRepoRoot) {
    const bundled = resolveBundledInstallScript(resourcesPath, hermesHome)

    if (bundled) {
      emit({ type: 'log', line: `[bootstrap] using ephemeral install.ps1 at ${bundled} (asar copy, deleted after run)` })

      return { path: bundled, source: 'bundled', kind: installScriptKind() }
    }
  }

  // 1. Dev shortcut: prefer a local checkout's installer so we can iterate
  //    without pushing. SOURCE_REPO_ROOT comes from main.ts (path.resolve
  //    of APP_ROOT/../..).
  const localScript = resolveLocalInstallScript(sourceRepoRoot)

  if (localScript) {
    emit({ type: 'log', line: `[bootstrap] using local ${installScriptName()} at ${localScript}` })

    return { path: localScript, source: 'local', kind: installScriptKind() }
  }

  // 2. Packaged path: download using the same identity policy as the stages.
  // Fresh installs use the packaged commit; existing checkouts and non-git
  // fallback builds follow the branch.
  const installRef = installRefForStamp(installStamp, { pinCommit })

  if (!installRef) {
    throw new Error(
      `Cannot resolve ${installScriptName()}: no SOURCE_REPO_ROOT and no install stamp. ` +
        'This packaged build was produced without a valid build-time stamp.'
    )
  }

  const cached = cachedScriptPath(hermesHome, installRef.cacheKey)
  const resolvedCommit = installRef.pinned ? installRef.ref : null

  // The cache is only this run's -File target, never a source of truth.
  // Refreshing also makes old Desktop builds pick up installer fixes instead
  // of repeatedly executing bytes cached before those fixes existed.
  emit({
    type: 'log',
    line:
      `[bootstrap] fetching ${installScriptName()} for ${installRef.ref.slice(0, 12)} from GitHub` +
      (installRef.pinned ? '' : ' (unpinned branch)')
  })

  await _download(installRef.ref, cached)
  emit({ type: 'log', line: `[bootstrap] saved to ${cached}` })

  return { path: cached, source: 'download', commit: resolvedCommit, kind: installScriptKind() }
}

// ---------------------------------------------------------------------------
// powershell wrapper
// ---------------------------------------------------------------------------

// Canonical PowerShell 5.1 location under a Windows root (%SystemRoot%).
function powershellUnderRoot(root) {
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

// Resolve the PowerShell interpreter to spawn.
//
// Spawning bare 'powershell.exe' trusts PATH to contain
// %SystemRoot%\System32\WindowsPowerShell\v1.0. On machines whose PATH was
// trimmed, truncated, or stored as a non-expanding REG_SZ (so %SystemRoot%
// never expands), that lookup fails and the spawn dies with ENOENT before
// install.ps1 ever runs — the installer stalls at "0 of 0 steps". Resolve by
// absolute path first, then fall back to PATH (powershell 5.1, then pwsh 7),
// then a bare name as a last resort.
function resolveWindowsPowerShell() {
  for (const v of ['SystemRoot', 'windir']) {
    const root = process.env[v]

    if (root) {
      const candidate = powershellUnderRoot(root)

      try {
        if (fs.statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        void 0
      }
    }
  }

  const pathDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean)

  for (const exe of ['powershell.exe', 'pwsh.exe']) {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, exe)

      try {
        if (fs.statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        void 0
      }
    }
  }

  return 'powershell.exe'
}

// install.sh (and the git/curl/uv children it drives) writes SGR colours,
// cursor/erase sequences, OSC titles and \r progress redraws into the pipe as
// if it were a TTY. The install overlay renders each line as plain text, so
// strip them ONCE here, at the emitter: the main-process log ring, the
// renderer's Details panel and "Copy output" all read the same clean line
// (#112675). \r redraws collapse to the last frame a terminal would show.
function cleanInstallerLogLine(raw: string): string {
  const frames = raw.split('\r').map(stripAnsi).filter(Boolean)

  return frames.length ? frames[frames.length - 1] : ''
}

// The installer drives Hermes's own toolchain (install.sh takes a uv from PATH
// when it is new enough), so store dirs already on PATH stay ahead of the
// login-shell entries shell-path.ts merged in front of them.
function installerEnv(hermesHome, desktopVersion = null) {
  const env: NodeJS.ProcessEnv = { ...process.env, HERMES_HOME: hermesHome || process.env.HERMES_HOME || '' }

  // crab 0.20.5n: install.ps1 stamps the bootstrap marker with this version
  // so the desktop's runtime-outdated gate can compare marker vs app.
  if (desktopVersion) {
    env.CRAB_DESKTOP_VERSION = desktopVersion
  }

  const key = pathEnvKey(env)

  env[key] = storeFirstPath(env[key] || '', { currentEnv: env })

  return env
}

function spawnPowerShell(scriptPath, args, { emit, stageName, abortSignal, hermesHome, desktopVersion }: any = {}) {
  return new Promise<any>((resolve, reject) => {
    const ps = process.platform === 'win32' ? resolveWindowsPowerShell() : 'pwsh'
    const fullArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args]

    const child = spawn(
      ps,
      fullArgs,
      hiddenWindowsChildOptions({
        stdio: ['ignore', 'pipe', 'pipe'],
        // Pass HERMES_HOME through so install.ps1 respects the caller's
        // choice rather than re-computing the default.
        env: installerEnv(hermesHome, desktopVersion)
      })
    )

    let stdout = ''
    let stderr = ''
    let killed = false

    const onAbort = () => {
      killed = true

      try {
        child.kill('SIGTERM')
      } catch {
        void 0
      }
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    // Stream stdout line-by-line so the renderer sees progress in real time.
    let stdoutBuf = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      stdoutBuf += chunk
      let nl

      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = cleanInstallerLogLine(stdoutBuf.slice(0, nl))
        stdoutBuf = stdoutBuf.slice(nl + 1)

        if (line) {
          emit && emit({ type: 'log', stage: stageName, line, stream: 'stdout' })
        }
      }
    })

    let stderrBuf = ''
    child.stderr.on('data', chunk => {
      stderr += chunk
      stderrBuf += chunk
      let nl

      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = cleanInstallerLogLine(stderrBuf.slice(0, nl))
        stderrBuf = stderrBuf.slice(nl + 1)

        if (line) {
          emit && emit({ type: 'log', stage: stageName, line, stream: 'stderr' })
        }
      }
    })

    child.on('error', err => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort)
      }

      reject(err)
    })

    child.on('close', (code, signal) => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort)
      }

      // Flush any trailing bytes
      const stdoutTail = cleanInstallerLogLine(stdoutBuf)
      const stderrTail = cleanInstallerLogLine(stderrBuf)

      if (stdoutTail) {
        emit && emit({ type: 'log', stage: stageName, line: stdoutTail, stream: 'stdout' } as any)
      }

      if (stderrTail) {
        emit && emit({ type: 'log', stage: stageName, line: stderrTail, stream: 'stderr' } as any)
      }

      resolve({ stdout, stderr, code, signal, killed } as any)
    })
  })
}

function spawnBash(scriptPath, args, { emit, stageName, abortSignal, hermesHome }: any = {}) {
  return new Promise<any>((resolve, reject) => {
    const child = spawn('bash', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: installerEnv(hermesHome)
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const onAbort = () => {
      killed = true

      try {
        child.kill('SIGTERM')
      } catch {
        void 0
      }
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort()
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    let stdoutBuf = ''
    child.stdout.on('data', chunk => {
      stdout += chunk
      stdoutBuf += chunk
      let nl

      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = cleanInstallerLogLine(stdoutBuf.slice(0, nl))
        stdoutBuf = stdoutBuf.slice(nl + 1)

        if (line) {
          emit && emit({ type: 'log', stage: stageName, line, stream: 'stdout' })
        }
      }
    })

    let stderrBuf = ''
    child.stderr.on('data', chunk => {
      stderr += chunk
      stderrBuf += chunk
      let nl

      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = cleanInstallerLogLine(stderrBuf.slice(0, nl))
        stderrBuf = stderrBuf.slice(nl + 1)

        if (line) {
          emit && emit({ type: 'log', stage: stageName, line, stream: 'stderr' })
        }
      }
    })

    child.on('error', err => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort)
      }

      reject(err)
    })

    child.on('close', (code, signal) => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort)
      }

      const stdoutTail = cleanInstallerLogLine(stdoutBuf)
      const stderrTail = cleanInstallerLogLine(stderrBuf)

      if (stdoutTail) {
        emit && emit({ type: 'log', stage: stageName, line: stdoutTail, stream: 'stdout' })
      }

      if (stderrTail) {
        emit && emit({ type: 'log', stage: stageName, line: stderrTail, stream: 'stderr' })
      }

      resolve({ stdout, stderr, code, signal, killed })
    })
  })
}

// ---------------------------------------------------------------------------
// Manifest + stage dispatch
// ---------------------------------------------------------------------------

// Build the installer branch/pin args from the install stamp. The commit pin
// is fresh-install only: once a managed checkout already exists, bootstrap is
// a repair/update path and must not let an old packaged app detach the checkout
// back to the commit baked into that app. All-zero fallback stamps are never
// passed as -Commit/--commit — only the branch is used (#50823 / #50864 review).
function buildPinArgs(installStamp, { pinCommit = true } = {}) {
  const args = []

  if (pinCommit && installStamp && isPinnedCommit(installStamp.commit)) {
    args.push('-Commit', installStamp.commit)
  }

  if (installStamp && installStamp.branch) {
    args.push('-Branch', installStamp.branch)
  }

  return args
}

function buildPosixPinArgs({ installStamp, activeRoot, hermesHome, pinCommit = true }) {
  const args = ['--dir', activeRoot, '--hermes-home', hermesHome]

  if (installStamp && installStamp.branch) {
    args.push('--branch', installStamp.branch)
  }

  if (pinCommit && installStamp && isPinnedCommit(installStamp.commit)) {
    args.push('--commit', installStamp.commit)
  }

  return args
}

async function fetchManifest({
  scriptPath,
  installerKind,
  emit,
  hermesHome,
  activeRoot,
  installStamp,
  pinCommit,
  abortSignal,
  resourcesPath = null
}) {
  abortSignal?.throwIfAborted()
  const isPosix = installerKind === 'posix'

  // crab 0.20.5-ae (GBJ-1094): refresh fresh bytes right before every spawn
  // — the AV's .ps1 quarantine window (~100ms after creation) must not span
  // materialize→spawn. No-op for standing (posix/downloaded) scripts.
  if (!isPosix) {
    scriptPath = refreshEphemeralScript(scriptPath, resourcesPath, hermesHome)
  }

  const args = isPosix
    ? ['--manifest', ...buildPosixPinArgs({ installStamp, activeRoot, hermesHome, pinCommit })]
    : ['-Manifest', ...buildPinArgs(installStamp, { pinCommit })]

  const result = await (isPosix ? spawnBash : spawnPowerShell)(scriptPath, args, {
    emit,
    stageName: '__manifest__',
    abortSignal,
    hermesHome
  })

  if (result.code !== 0) {
    // crab 0.20.5-ac+1 (2026-11-26): the AV can quarantine install.ps1 BETWEEN
    // resolve (accessSync passed) and spawn (CommandNotFound with the script
    // path in stderr). One heal-and-retry round: copy the asar copy back out,
    // re-spawn once. Still failing falls through to the original error.
    const raw = stripAnsi(result.stderr || result.stdout).trim()
    const pathVanished = /CommandNotFoundException|ObjectNotFound|\u65e0\u6cd5\u8bc6\u522b/.test(raw)

    if (!isPosix && pathVanished && scriptPath) {
      const healed = healVanishedInstallScript(scriptPath, resourcesPath, hermesHome)
      if (healed) {
        emit({ type: 'log', line: `[bootstrap] install.ps1 vanished (AV quarantine?); restored from asar copy, retrying manifest once` })
        const retry = await (spawnPowerShell)(healed, args, {
          emit,
          stageName: '__manifest__',
          abortSignal,
          hermesHome
        })
        if (retry.code === 0) {
          return parseManifestStdout(retry.stdout)
        }
        throw new Error(
          `install.ps1 -Manifest failed after heal-retry: exit ${retry.code}\n${stripAnsi(retry.stderr || retry.stdout).trim()}`
        )
      }
    }

    // The tail lands in the Setup failure banner, not the log ring, so strip
    // the installer's colour/OSC bytes here too (#112675).
    const tail = raw

    throw new Error(
      `${isPosix ? 'install.sh --manifest' : 'install.ps1 -Manifest'} failed: exit ${result.code}\n${tail}`
    )
  }

  return parseManifestStdout(result.stdout)
}

// crab 0.20.5-ac+1: manifest stdout parsing extracted so the AV heal-retry
// path above can reuse it.
function parseManifestStdout(stdout) {
  // The manifest is the LAST JSON line on stdout (install.ps1 may print
  // banner / info lines first depending on Console.OutputEncoding effects).
  // Find the last line that parses as JSON with a `stages` field.
  const lines = stdout.split(/\r?\n/).filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])

      if (parsed && Array.isArray(parsed.stages)) {
        return parsed
      }
    } catch {
      void 0
    }
  }

  throw new Error(
    `install.ps1 -Manifest produced no parseable JSON payload\n${stdout}`
  )
}

// Parse the JSON result frame from a stage run. The protocol guarantees
// exactly one JSON line per stage in -Json or -Stage mode (post #27224 fix
// for the double-emit bug we addressed in the install.ps1 PR).
function parseStageResult(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i])

      if (parsed && typeof parsed.ok === 'boolean' && typeof parsed.stage === 'string') {
        return parsed
      }
    } catch {
      void 0
    }
  }

  return null
}

async function runStage({
  scriptPath,
  installerKind,
  stage,
  emit,
  hermesHome,
  activeRoot,
  abortSignal,
  installStamp,
  pinCommit,
  vendorDir = null,
  keepVendor = false,
  desktopVersion = null,
  resourcesPath = null
}) {
  const startedAt = Date.now()
  emit({ type: 'stage', name: stage.name, state: 'running' })

  const isPosix = installerKind === 'posix'

  // crab 0.20.5-ae (GBJ-1094): same pre-spawn refresh as fetchManifest —
  // a stage-to-stage quarantine self-heals here instead of failing the run.
  if (!isPosix) {
    scriptPath = refreshEphemeralScript(scriptPath, resourcesPath, hermesHome)
  }

  // crab 0.20.5n: vendor args — point install.ps1 at the packaged vendor
  // tree (resources/vendor) so staging happens offline, keep the tree for
  // future repairs, and stamp the marker with this app's version so
  // isRuntimeOutdated() can gate future engine upgrades.
  const vendorArgs = []
  if (!isPosix && vendorDir) {
    vendorArgs.push('-VendorDir', vendorDir)
    if (keepVendor) {
      vendorArgs.push('-KeepVendor')
    }
  }

  const args = isPosix
    ? [
        '--stage',
        stage.name,
        '--non-interactive',
        '--json',
        ...buildPosixPinArgs({ installStamp, activeRoot, hermesHome, pinCommit })
      ]
    : [
        '-Stage',
        stage.name,
        '-NonInteractive',
        '-Json',
        ...buildPinArgs(installStamp, { pinCommit }),
        ...vendorArgs
      ]

  let result = await (isPosix ? spawnBash : spawnPowerShell)(scriptPath, args, {
    emit,
    stageName: stage.name,
    abortSignal,
    hermesHome,
    desktopVersion
  })

  // crab 0.20.5-ac+1 (2026-11-26): AV can quarantine install.ps1 mid-run (it
  // survived manifest, vanished by this stage's spawn). Same heal-retry as
  // fetchManifest: restore from the asar copy and re-spawn once.
  if (
    !isPosix &&
    result.code !== 0 &&
    /CommandNotFoundException|ObjectNotFound|\u65e0\u6cd5\u8bc6\u522b/.test(
      stripAnsi(result.stderr || result.stdout || '')
    )
  ) {
    const healed = healVanishedInstallScript(scriptPath, resourcesPath, hermesHome)

    if (healed) {
      emit({ type: 'log', line: `[bootstrap] install.ps1 vanished before stage ${stage.name} (AV quarantine?); restored, retrying once`, stage: stage.name })
      result = await spawnPowerShell(healed, args, {
        emit,
        stageName: stage.name,
        abortSignal,
        hermesHome,
        desktopVersion
      })
    }
  }

  const durationMs = Date.now() - startedAt

  if (result.killed) {
    const ev = { type: 'stage', name: stage.name, state: 'failed', durationMs, error: 'cancelled by user' }
    emit(ev)

    return ev
  }

  const json = parseStageResult(result.stdout)

  if (!json) {
    const ev = {
      type: 'stage',
      name: stage.name,
      state: 'failed',
      durationMs,
      error: `${isPosix ? 'install.sh --stage' : 'install.ps1 -Stage'} ${stage.name} produced no JSON result frame (exit=${result.code})`,
      json: null
    }

    emit(ev)

    return ev
  }

  if (json.ok && json.skipped) {
    const ev = { type: 'stage', name: stage.name, state: 'skipped', durationMs, json }
    emit(ev)

    return ev
  }

  if (json.ok) {
    const ev = { type: 'stage', name: stage.name, state: 'succeeded', durationMs, json }
    emit(ev)

    return ev
  }

  const ev = {
    type: 'stage',
    name: stage.name,
    state: 'failed',
    durationMs,
    json,
    error: json.reason || `exit code ${result.code}`
  }

  emit(ev)

  return ev
}

// ---------------------------------------------------------------------------
// Per-run log file
// ---------------------------------------------------------------------------

function openRunLog(logRoot) {
  fs.mkdirSync(logRoot, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(logRoot, `bootstrap-${ts}.log`)
  const stream = fs.createWriteStream(logPath, { flags: 'a' })

  return { path: logPath, stream }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

async function runBootstrap(opts) {
  const {
    installStamp,
    activeRoot,
    sourceRepoRoot,
    hermesHome,
    logRoot,
    onEvent,
    abortSignal,
    writeMarker, // callback to write the bootstrap-complete marker; main.ts provides
    gitBinary, // probed git path from main.ts; bare 'git' when absent
    // crab 0.20.5n: offline upgrade channel — resources paths + version stamp
    resourcesPath = null,
    vendorDir = null,
    desktopVersion = null
  } = opts

  // Bail before spawning anything if the user already cancelled — otherwise an
  // already-aborted signal would still fetch the manifest (a spawn) before the
  // in-loop abort check fires.
  if (abortSignal && abortSignal.aborted) {
    if (typeof onEvent === 'function') {
      try {
        onEvent({ type: 'failed', error: 'bootstrap cancelled by user' })
      } catch {
        void 0
      }
    }

    return { ok: false, cancelled: true }
  }

  const runLog = openRunLog(logRoot || path.join(hermesHome, 'logs'))

  // Tee every event to the runLog AND the caller's onEvent. This gives us a
  // forensic trail per bootstrap run AND lets the renderer subscribe live.
  const emit = ev => {
    try {
      runLog.stream.write(JSON.stringify(ev) + '\n')
    } catch {
      void 0
    }

    try {
      if (typeof onEvent === 'function') {
        onEvent(ev)
      }
    } catch (err) {
      // Don't let a subscriber bug crash the bootstrap
      runLog.stream.write(`emit error: ${err && err.message}\n`)
    }
  }

  emit({
    type: 'log',
    line:
      `[bootstrap] starting at ${new Date().toISOString()}; ` +
      `activeRoot=${activeRoot}; ` +
      `stamp=${installStamp ? installStamp.commit.slice(0, 12) : '<none>'}; ` +
      `runLog=${runLog.path}`
  })

  let scriptPathForCleanup: string | null = null

  try {
    const existingCheckout = hasExistingGitCheckout(activeRoot)
    const pinCommit = !existingCheckout

    if (existingCheckout && installStamp && installStamp.commit) {
      emit({
        type: 'log',
        line:
          `[bootstrap] existing checkout detected at ${activeRoot}; ` +
          `not pinning to packaged install stamp ${installStamp.commit.slice(0, 12)}`
      })
    }

    // 1. Resolve the platform installer.
    // crab 0.20.5-af (feat/install-native-ts): NATIVE fork — when the packaged
    // vendor payload is present on win32, run the AV-immune native driver
    // FIRST. Success completes the bootstrap with zero .ps1 spawns (the
    // GBJ-1094 Huorong policy kills any user-profile .ps1 within ~100ms, so
    // the ps1 ladder is dead weight there, not a fallback). Failure falls
    // THROUGH to the ps1 chain below (double insurance for non-AV machines).
    if (shouldUseNativeInstall({ platform: process.platform, vendorDir })) {
      emit({
        type: 'log',
        line: '[bootstrap] native install path: vendor payload present, running AV-immune driver'
      })

      const nativeResult = await runNativeInstall({
        vendorDir: vendorDir as string,
        hermesHome,
        installDir: activeRoot,
        resourcesPath,
        emit,
        abortSignal
      })

      if (nativeResult.ok) {
        // Same completion-marker path as the ps1 ladder below: the marker is
        // the source of truth for "bootstrap already done", not the driver.
        const pinnedNative = resolveMarkerPinnedCommit(installStamp, activeRoot, {
          resolveHead: root => resolveCheckoutHead(root, { gitBinary })
        })

        const markerNative = typeof writeMarker === 'function'
          ? writeMarker({ pinnedCommit: pinnedNative, pinnedBranch: installStamp ? installStamp.branch : null })
          : { pinnedCommit: pinnedNative, pinnedBranch: installStamp ? installStamp.branch : null }

        // crab 0.20.5-af 终审修: native 提前 return 不得跳过 ps1 路径在
        // 尾部发的 complete 事件(broadcastBootstrapEvent 靠它翻
        // active=false,否则安装 overlay 永挂"进行中")。
        emit({ type: 'complete', marker: markerNative })
        emit({ type: 'log', line: `[bootstrap] native install complete; marker commit=${(markerNative.pinnedCommit || '').slice(0, 12)}` })

        return { ok: true, marker: markerNative, driver: 'native' as const }
      }

      // Native failed: log and fall through to the ps1 ladder. On AV machines
      // the ps1 chain will fail the same way it did in 0.20.5-ad/ae (visible
      // diagnostics, no silent regression); everywhere else it is a genuine
      // second chance.
      emit({
        type: 'log',
        line: `[bootstrap] native install failed (${nativeResult.error}); falling back to ps1 chain`
      })
    }

    const scriptInfo = await resolveInstallScript({ installStamp, sourceRepoRoot, hermesHome, emit, pinCommit, resourcesPath })
    abortSignal?.throwIfAborted()

    // Track for the finally-cleanup below: the ephemeral script only lives
    // for this run.
    scriptPathForCleanup = scriptInfo.path

    const installerKind = scriptInfo.kind || 'powershell'

    // 1.5 crab 0.20.5-ad+1 (feat/ps1-ephemeral): AV-immune pre-flight. The
    // retirement-gate classification (migrated from install.ps1's
    // Stage-VendorFiles) runs in compiled JS before ANY spawn, so the
    // repair/restaging decision no longer depends on a quarantineable PS
    // file being healthy. install.ps1 keeps the same rules as
    // defense-in-depth; this verdict is logged for forensics.
    try {
      const gates = classifyRuntimeHealth({ installDir: activeRoot, vendorDir })
      emit({
        type: 'log',
        line: `[bootstrap] retirement-gate: engine=${gates.engine.reason}; venv=${gates.venv.reason}`
      })
    } catch {
      void 0
    }

    // 2. Fetch manifest
    const manifest = await fetchManifest({
      scriptPath: scriptInfo.path,
      installerKind,
      emit,
      hermesHome,
      activeRoot,
      installStamp,
      pinCommit,
      abortSignal,
      resourcesPath
    })

    abortSignal?.throwIfAborted()

    emit({
      type: 'manifest',
      stages: manifest.stages,
      protocolVersion: manifest.protocol_version || manifest.protocolVersion || null
    })

    // 3. Iterate stages in order. Stages flagged needs_user_input are still
    //    invoked -- install.ps1's own -NonInteractive handler in those stages
    //    emits skipped=true. We trust the protocol rather than filtering
    //    client-side.
    for (const stage of manifest.stages) {
      if (abortSignal && abortSignal.aborted) {
        emit({ type: 'failed', error: 'bootstrap cancelled by user' })

        return { ok: false, cancelled: true }
      }

      const ev = await runStage({
        scriptPath: scriptInfo.path,
        installerKind,
        stage,
        emit,
        hermesHome,
        activeRoot,
        abortSignal,
        installStamp,
        pinCommit,
        vendorDir,
        keepVendor: true, // resources/vendor is the repair payload — never consume it away
        desktopVersion,
        resourcesPath
      })

      if (ev.state === 'failed') {
        emit({ type: 'failed', stage: stage.name, error: (ev as any).error || 'stage failed' })

        return { ok: false, failedStage: stage.name, error: (ev as any).error }
      }
    }

    // 4. Write the bootstrap-complete marker. Fallback (all-zero) stamps are
    // not real pins -- resolve HEAD from the checkout we just installed so
    // isBootstrapComplete() (pinnedCommit.length >= 7) accepts the marker
    // instead of re-running bootstrap on every launch (#50823 review).
    const pinnedCommit = resolveMarkerPinnedCommit(installStamp, activeRoot, {
      resolveHead: root => resolveCheckoutHead(root, { gitBinary })
    })

    if (!pinnedCommit) {
      emit({
        type: 'log',
        line:
          '[bootstrap] WARNING: could not resolve a real pinnedCommit for the ' +
          'bootstrap-complete marker; subsequent launches may re-run bootstrap'
      })
    } else if (installStamp && !isPinnedCommit(installStamp.commit)) {
      emit({
        type: 'log',
        line: `[bootstrap] fallback stamp resolved marker pin to ${pinnedCommit.slice(0, 12)} from checkout`
      })
    }

    const markerPayload = {
      pinnedCommit,
      pinnedBranch: installStamp ? installStamp.branch : null
    }

    const marker = typeof writeMarker === 'function' ? writeMarker(markerPayload) : markerPayload
    emit({ type: 'complete', marker })

    return { ok: true, marker }
  } catch (err) {
    if (abortSignal?.aborted) {
      emit({ type: 'failed', error: 'bootstrap cancelled by user' })

      return { ok: false, cancelled: true }
    }

    emit({ type: 'failed', error: err.message || String(err) })

    return { ok: false, error: err.message || String(err) }
  } finally {
    // crab 0.20.5-ad+1 (feat/ps1-ephemeral): the bundled install.ps1 is
    // short-lived by design — remove it now that the run is over, so the
    // AV never sees a standing PS script to quarantine.
    // ad+2 (verifier #1): DIRECTORY SWEEP (registry path only missed
    // abort-window/half-failed-materialize/heal orphans).
    cleanupEphemeralInstallScriptsInDir(hermesHome)
    // Defensive single-path sweep too: a non-bundled scriptPath (posix dev)
    // is a no-op, a registered ephemeral path is covered twice, harmless.
    cleanupEphemeralInstallScript(scriptPathForCleanup)

    try {
      await new Promise<void>(resolve => runLog.stream.end(resolve))
    } catch {
      void 0
    }
  }
}

export {
  buildPinArgs,
  buildPosixPinArgs,
  cachedScriptPath,
  cleanInstallerLogLine,
  hasExistingGitCheckout,
  installRefForStamp,
  isPinnedCommit,
  // Exposed for testability
  parseStageResult,
  resolveCheckoutHead,
  resolveInstallScript,
  resolveLocalInstallScript,
  resolveMarkerPinnedCommit,
  runBootstrap,
  // crab 0.20.5-ad+1 (feat/ps1-ephemeral): ephemeral script lifecycle
  cleanupEphemeralInstallScript,
  cleanupEphemeralInstallScriptsInDir,
  materializeEphemeralInstallScript,
  refreshEphemeralScript
}
