/**
 * git-init.ts
 *
 * crab 0.20.5-af (feat/install-native-ts): git stub-init chain migrated from
 * install.ps1 Stage-VendorFiles (PS1 lines ~300-360).
 *
 * The offline engine checkout needs a git repo so `git rev-parse --verify
 * HEAD` (Install-Repository's probe) and future `hermes update` flows work.
 * Only a handful of key files are added (git add -A hashes 99,000 files and
 * adds 2-3 minutes under AV load); the stub commit's content is irrelevant —
 * update fetch+checkout later replaces the whole tree.
 *
 * Credential-GUI suppression (four layers, qiji 0.19.3) is preserved
 * verbatim: system-level pre-selections so git/GCM never pops a dialog on an
 * end-user machine.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface GitStubInitOptions {
  installDir: string
  log?: (line: string) => void
}

const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GCM_GUI_PROMPT: 'never'
}

function git(installDir: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const child = spawn('git', ['-c', 'credential.helper=', '-c', 'windows.appendAtomically=false', ...args], {
      cwd: installDir,
      env: { ...env, ...GIT_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let out = ''
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (out += d.toString()))
    child.on('error', () => resolve({ code: -1, out }))
    child.on('close', code => resolve({ code: typeof code === 'number' ? code : -1, out }))
  })
}

/**
 * Initialize the engine checkout as a git repo with a stub commit.
 * Mirrors the PS1 chain: init -> configs (autocrlf/identity/branch) -> remote
 * remove -> add key files -> commit. Failures are NON-FATAL (warning +
 * HTTP-fallback updates), exactly like PS1.
 */
export async function gitStubInit(opts: GitStubInitOptions): Promise<boolean> {
  const { installDir, log } = opts
  const env = process.env

  if (!fs.existsSync(path.join(installDir, 'hermes_cli', '__init__.py'))) {
    return false // nothing to init
  }

  // System-level credential GUI suppression (idempotent, ignore failures).
  await git(installDir, ['config', '--system', 'credential.guiPrompt', 'false'], env)
  await git(installDir, ['config', '--system', 'credential.helperselector.selected', 'none'], env)

  const init = await git(installDir, ['init'], env)
  if (init.code !== 0) {
    log?.(`[vendor] WARNING: git init failed (exit ${init.code})`)
    return false
  }

  await git(installDir, ['config', 'windows.appendAtomically', 'false'], env)
  await git(installDir, ['config', 'core.autocrlf', 'false'], env)
  await git(installDir, ['config', 'user.name', 'Qiji Installer'], env)
  await git(installDir, ['config', 'user.email', 'installer@local'], env)
  await git(installDir, ['config', 'init.defaultBranch', 'main'], env)

  // Rename master -> main if init created master (old git default)
  const branch = await git(installDir, ['symbolic-ref', '--short', 'HEAD'], env)
  if (branch.code === 0 && branch.out.trim() && branch.out.trim() !== 'main') {
    await git(installDir, ['branch', '-m', 'main'], env)
  }

  // 0.19.2: no origin remote on installed machines (GCM popups on private
  // mirrors); client updates ship as signed Setup.exe via fa_version.
  await git(installDir, ['remote', 'remove', 'origin'], env)

  const add = await git(
    installDir,
    ['add', 'pyproject.toml', 'hermes_cli/__init__.py', 'AGENTS.md', 'README.md'],
    env
  )
  if (add.code !== 0) {
    log?.(`[vendor] WARNING: git add failed (exit ${add.code})`)
    return false
  }
  const commit = await git(installDir, ['commit', '-m', 'vendor snapshot (offline install)'], env)
  if (commit.code !== 0) {
    log?.(`[vendor] WARNING: git commit failed (exit ${commit.code})`)
    return false
  }

  const head = await git(installDir, ['rev-parse', '--short', 'HEAD'], env)
  log?.(`[vendor] Git initialized: ${head.out.trim() || 'unknown'} on branch main`)
  return true
}
