// product-identity.ts — the typed build-time product identity.
//
// product-identity.cjs is the single derivation of every name-shaped
// value a variant owns (product name, appId, channel). Dev bundles and
// test runs import the .cjs itself so the derivation exists in exactly
// one place.

import { mkdirSync } from 'node:fs'
// without this rename it breaks due to some bundler injection of the same name
import { createRequire as nodeCreateRequire } from 'node:module'
import path from 'node:path'

import type devIdentity from '../product-identity.cjs'

/** Mirrors product-identity.cjs (see product-identity.d.cts). */
export type ProductIdentity = typeof devIdentity

declare const __HERMES_PRODUCT_IDENTITY__: ProductIdentity

/** The baked identity of this artifact (dev bundles derive it live). */
export const PRODUCT_IDENTITY: Readonly<ProductIdentity> =
  typeof __HERMES_PRODUCT_IDENTITY__ === 'undefined'
    ? Object.freeze(
        nodeCreateRequire(
          // crab 0.20.5o-r2: CJS 打包(esbuild QIJI_CJS_MAIN 分支)把 import.meta
          // 垫成空对象——createRequire(undefined) 直接炸；electron dev 的
          // argv[1] 又是 '.'(cwd 相对)。两级兜底后用 CJS 真实存在的
          // __filename（esbuild 保留），与 .cjs 同目录解析 ../product-identity.cjs。
          // ESM 分支(打包/dev 默认)不受影响，仍走 import.meta.url。
          typeof import.meta.url === 'string'
            ? import.meta.url
            : typeof __filename === 'string'
              ? __filename
              : process.argv[1]!
        )('../product-identity.cjs') as ProductIdentity
      )
    : Object.freeze(__HERMES_PRODUCT_IDENTITY__)

/** Pin before the first userData lookup and single-instance lock. Electron's
 * later display-name changes must not redirect an installed build's state.
 * Stable keeps its historical userData and runtime naming behavior.
 */
export function applyDesktopIdentity(
  app: {
    getPath(name: 'appData'): string
    setPath(name: 'userData', value: string): void
    setName(name: string): void
  },
  identity: Readonly<ProductIdentity> = PRODUCT_IDENTITY
): string | null {
  if (!identity.token && identity.appNamePascal === identity.artifactNamePascal) {
    return null
  }

  const userData: string = path.join(app.getPath('appData'), identity.appNamePascal)
  mkdirSync(userData, { recursive: true })
  app.setPath('userData', userData)
  app.setName(identity.displayName)

  return identity.displayName
}
