#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { isMain, workspaceTool } from '../../../scripts/build/frontend-common.mjs'
import { environmentDefaultsBanner } from './bundle-env.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

// Evaluate the one identity module in a fresh process. Its CJS cache and the
// caller's environment must not carry a previous variant into this artifact.
function productIdentity(source, stamp) {
  const variant = stamp.updateMechanism === 'microsoft-store' ? 'store'
    : stamp.payload === 'bootstrap' ? '' : stamp.payload
  if (!['', 'bundled', 'light', 'store'].includes(variant)) {
    throw new Error(`Invalid desktop stamp payload: ${stamp.payload}`)
  }
  return execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(require(process.argv[1])))',
    join(source, 'apps/desktop/product-identity.cjs')], {
    env: { ...process.env, HERMES_DESKTOP_VARIANT: variant, HERMES_PAYLOAD_TAG: stamp.tag || '',
      // Commit builds stamp source='commit-build'; the display name carries
      // the short SHA (see product-identity.cjs). Tagged builds pass ''.
      HERMES_BUILD_COMMIT: stamp.source === 'commit-build' ? (stamp.commit || '') : '' },
    encoding: 'utf8',
  }).trim()
}

/** qiji: 去 TLA 的 entry 内容(CJS 打包用),经 esbuild stdin 虚拟入口——
 * 不落盘。旧实现写 electron/qiji-entry-cjs.gen.ts 到源树,Nix 纯函数式
 * 沙箱里源树被中途写入 = sourceHash 前后不一致,"Build inputs changed
 * during compilation" 必炸(freshness.mjs 的 generated 排除集不含
 * electron/ 下的散落文件)。stdin + resolveDir 指向 electron/ 源目录,
 * 相对 import('./main')/'./data-paths' 照常解析,产物与源树解耦。 */
function qijiCjsEntry(source) {
  const entryDir = join(source, 'apps/desktop/electron')
  let code = readFileSync(join(entryDir, 'entry.ts'), 'utf8')
  const tla = "await import('./main')"
  if (code.includes(tla)) {
    code = code.replace(tla, "import('./main').catch((e) => { console.error('[qiji-cjs] main import failed:', e); process.exit(1) })")
  }
  return { contents: code, resolveDir: entryDir, loader: 'ts' }
}

/** Bundle main/preload using only the prepared workspace's compiler. */
export async function bundleElectronMain({ source, out, stamp, dev = false }) {
  source = resolve(source)
  out = resolve(out)
  const { build } = await import(pathToFileURL(workspaceTool(source, 'apps/desktop', 'esbuild')).href)
  // Defaults must run before bundled modules resolve paths or onboarding flags.
  // Dev bundles leave the environment alone so source-tree resolution keeps working.
  const envBanner = dev ? '' : environmentDefaultsBanner(process.env.HERMES_BUNDLE_ENV_JSON || '{}')
  const define = {}
  if (!dev) {
    if (!stamp) throw new Error('A prepared install stamp is required')
    const raw = readFileSync(stamp, 'utf8')
    const metadata = JSON.parse(raw)
    define['process.env.HERMES_DESKTOP_IS_PACKAGED'] = JSON.stringify(true)
    define.__HERMES_INSTALL_STAMP__ = raw
    define.__HERMES_PRODUCT_IDENTITY__ = productIdentity(source, metadata)
  }
  mkdirSync(out, { recursive: true })
  const common = {
    absWorkingDir: join(source, 'apps/desktop'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    external: ['electron', 'node-pty', 'get-windows', 'fs'],
    define,
    logLevel: 'info',
  }
  await build({
    ...common,
    // entry.ts picks the Linux ozone platform (native Wayland/WSLg) and
    // relaunches before main.ts loads; Electron reads it only from argv.
    //
    // crab: CJS 是本产品链默认(package.json main = dist/electron-main.cjs,
    // qiji 加密链 afterpack-encrypt 的 bootstrap 走 Module._compile 需要 CJS)。
    // QIJI_CJS_MAIN=0 显式回退上游 ESM 形态;不设或=1 一律 CJS——CI/installer
    // 驱动的构建不再依赖外部注入 env,产物入口与 package.json 恒一致。
    ...(process.env.QIJI_CJS_MAIN === '0'
      ? {
          entryPoints: [join(source, 'apps/desktop/electron/entry.ts')],
          format: 'esm',
          outfile: join(out, 'electron-main.mjs'),
          banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" + envBanner }
        }
      : {
          // qiji: 加密链需要 CJS 主进程(afterpack-encrypt 的 bootstrap 走 Module._compile)。
          // entry.ts 唯一的 TLA(末尾 await import('./main'))在 CJS 下不可打包——
          // stdin 虚拟入口注入去 TLA 变换,不写源树(Nix 沙箱安全)。
          stdin: qijiCjsEntry(source),
          format: 'cjs',
          outfile: join(out, 'electron-main.cjs'),
          banner: { js: envBanner }
        }),
  })
  await build({
    ...common,
    entryPoints: [join(source, 'apps/desktop/electron/preload.ts')],
    format: 'cjs',
    outfile: join(out, 'electron-preload.js'),
  })
  // Preview-pane <webview> guest preload; main.ts hands this path to the
  // preview webview via will-attach-webview.
  await build({
    ...common,
    entryPoints: [join(source, 'apps/desktop/electron/preview-guest-preload-entry.ts')],
    format: 'cjs',
    outfile: join(out, 'preview-guest-preload.js'),
  })
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: {
    source: { type: 'string', default: repoRoot },
    out: { type: 'string' }, stamp: { type: 'string' }, dev: { type: 'boolean' },
  } })
  await bundleElectronMain({
    ...values,
    out: values.out || join(values.source, 'apps/desktop/dist'),
    stamp: values.stamp || join(values.source, 'apps/desktop/build/install-stamp.json'),
  })
}
