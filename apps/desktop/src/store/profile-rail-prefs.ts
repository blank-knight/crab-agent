import { Codecs, persistentAtom } from '@/lib/persisted'
import { modeBound } from '@/store/interface-mode'

// The colored profile strip at the sidebar foot. For someone who runs profiles
// as bots it duplicates the footer's gateway selector, so it can be switched
// off; while it is off the statusbar grows a profile dropdown beside the
// gateway switcher so switching profiles never loses its door.
// crab 0.20.5o-r2: 默认隐藏（10-21 产品决策）——OPC 用户眼里"专家"就是档案的
// 全部意义，这条技术条与专家会话分组/OPC 专家页三处重复（用户原话"没啥用"）。
// 隐藏后状态栏 profile-switcher 项自动接管（见 use-statusbar-items.tsx 的
// hidden: profileRailVisible 门），切档案的门不丢。已存 true 的老用户不受影响
// （persistentAtom 只写默认值），想开回来：筛选菜单 → 切换配置档案栏。
const $profileRailVisiblePref = persistentAtom('hermes.desktop.profileRailVisible', false, Codecs.bool)

export const $profileRailVisible = modeBound('profileRailVisible', $profileRailVisiblePref, value =>
  $profileRailVisiblePref.set(value)
)

export function toggleProfileRailVisible() {
  $profileRailVisible.set(!$profileRailVisible.get())
}
