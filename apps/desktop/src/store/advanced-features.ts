import { atom } from 'nanostores'

/**
 * qiji 0.20.5: 「高级功能」可见性开关（砍可见性不砍功能）。
 *
 * 面向普通用户的产品默认隐藏开发者向功能（高级分区子页、预热后端池、
 * 开发者工具集行）；在 设置→关于 打开本开关即全量放出。物理功能不动：
 * 后端照常加载，已有配置不受影响——与 Nous Portal 隐藏（渲染层过滤）
 * 同一纪律，可随时恢复。
 *
 * 默认关（普通用户）。localStorage 持久化，key 带版本号便于将来迁移。
 */
export const QIJI_ADVANCED_KEY = 'qiji.advanced-features-v1'

function readInitial(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(QIJI_ADVANCED_KEY) === '1'
  } catch {
    return false
  }
}

export const $advancedFeatures = atom<boolean>(readInitial())

export function setAdvancedFeatures(enabled: boolean): void {
  $advancedFeatures.set(enabled)

  try {
    window.localStorage.setItem(QIJI_ADVANCED_KEY, enabled ? '1' : '0')
  } catch {
    // localStorage 不可用（隐私模式等）——仅内存态，本会话内生效
  }
}
