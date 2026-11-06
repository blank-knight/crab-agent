import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { isAuthenticated } from '@/store/auth'
import { $activeGatewayProfile, $profiles, normalizeProfileKey, profileLabel, refreshProfiles } from '@/store/profile'
import {
  $settingsScopeEditsNonDefault,
  $settingsScopeOverride,
  $settingsScopeProfile,
  setSettingsScope
} from '@/store/settings-scope'
import type { ProfileInfo } from '@/types/hermes'

/** crab 0.20.5p-r2: 专家档案（Bot Mode 成员，bot_title 非空）在设置作用域
 *  选择器里隐藏——专家是"人格"不是用户可配的工作区（用户拍板 10-22），
 *  "应用于算命专家"是概念泄漏。专家的配置走专家模板自带，不进设置页。
 *  bot_title 为空的档案（default + acc_*）全部保留。 */
function isExpertProfile(profile: ProfileInfo): boolean {
  return (profile.bot_title ?? '').trim() !== ''
}

/** crab 0.20.5p-r2: qiji 打包形态下整个"应用于"选择器隐藏——账号隔离场景
 *  用户只有自己一个账号档（acc_*），default 是本机档不跟账号走，让用户
 *  在两者间选"写到哪"没有正确答案（选 default = 换机/换号全丢），纯概念
 *  泄漏。登录后账号档 ≤1 时设置全部直写当前档案，所见即所得。上游 OSS
 *  形态（非 PROD 或未登录）不受影响，多 profile 用户照旧有选择器。
 *  prod/authed 参数化仅为可测性，调用点传真实值。 */
function isAccountProfile(profile: ProfileInfo): boolean {
  return profile.name.startsWith('acc_')
}

export function hideScopeSelectorEntirely(
  profiles: ProfileInfo[],
  opts: { prod?: boolean; authed?: boolean } = {}
): boolean {
  const { prod = import.meta.env.PROD, authed = isAuthenticated() } = opts

  if (!prod || !authed) {
    return false
  }

  return profiles.filter(isAccountProfile).length <= 1
}

/** Settings-chip label: the Bot Mode title the Bots roster shows when set
 * (ui_meta['hermes-bots'].title), else the app-wide profileLabel
 * (display_name → slug). Scoped to this selector on purpose — the profile
 * rail and Profiles page keep naming profiles by display_name. */
export function settingsScopeLabel(profile: Pick<ProfileInfo, 'bot_title' | 'display_name' | 'name'>): string {
  return (profile.bot_title ?? '').trim() || profileLabel(profile)
}

// The same chip affordance the Gateway page uses for its per-profile
// connection overrides (gateway-settings ScopeChip). That one stays local to
// gateway-settings — its `null` chip means "all profiles", while here every
// chip is a concrete profile whose config the page edits.
export function ScopeChip({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      className={cn(
        'rounded-full border px-3 py-1 text-[length:var(--conversation-caption-font-size)] transition',
        active
          ? 'border-(--ui-stroke-secondary) bg-(--ui-bg-tertiary) text-(--ui-text-primary)'
          : 'border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)'
      )}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  )
}

/** Shared "Applies to" profile selector for the config-backed settings pages
 *  (Model, Workspace, Safety, Memory & Context, Voice, Tools & Keys), Custom
 *  Endpoints, and the Messaging overlay. Backed by one nanostore
 *  ($settingsScopeOverride) so the selection persists across pages. Hidden with
 *  fewer than two profiles, so single-profile users never see it and every
 *  request keeps its unscoped default shape. */
export function SettingsProfileScope({ className }: { className?: string }) {
  const { t } = useI18n()
  const scope = t.settings.profileScope
  const override = useStore($settingsScopeOverride)
  const selected = useStore($settingsScopeProfile)
  const editingNonDefault = useStore($settingsScopeEditsNonDefault)
  // crab 0.20.5p-r2: 过滤专家档案（见 isExpertProfile 注释）——选择器只列
  // 账号工作区。若当前 scope 恰好停在专家档案上（历史遗留），selected 的
  // chip 找不到对应行，回落裸名显示，不额外跳转。
  const profiles = useStore($profiles).filter(p => !isExpertProfile(p))
  // The note names the edit target with the same presentation label as its
  // chip (Bot title → display_name → slug); the slug alone can name a bot the
  // user has never seen called that.
  const selectedLabel = profiles.find(profile => normalizeProfileKey(profile.name) === selected)
  const selectedName = selectedLabel ? settingsScopeLabel(selectedLabel) : selected

  // Refresh lazily so a profile created elsewhere shows up; the cached list
  // paints immediately. Best-effort — a failure keeps the cached roster.
  useEffect(() => {
    void refreshProfiles().catch(() => undefined)
  }, [])

  // qiji 螃蟹OPC: 默认收起为单行紧凑选择器（下拉展开），只有显式点开才见全量 chips
  // ——上游的常驻全量 chip 行在多身份场景下过于喧宾夺主。
  // crab 0.20.5p-r2: useState 必须在下方 early return 之前——专家过滤后
  // "仅剩 1 个账号档案"成为常态可达路径，条件返回后再调 hooks 违反
  // rules-of-hooks（lint 实抓）。
  const [open, setOpen] = useState(false)

  if (profiles.length < 2 || hideScopeSelectorEntirely(profiles)) {
    return null
  }

  const selectedChip = profiles.find(profile => normalizeProfileKey(profile.name) === selected)

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary)">
          {scope.appliesTo}
        </span>
        <button
          className={cn(
            'flex items-center gap-1 border border-transparent px-2 py-0.5 text-[length:var(--conversation-caption-font-size)] font-medium transition-colors',
            'text-foreground/85 hover:bg-(--chrome-action-hover)'
          )}
          onClick={() => setOpen(v => !v)}
          type="button"
        >
          {selectedChip ? settingsScopeLabel(selectedChip) : selected}
          <span aria-hidden className={cn('text-(--ui-text-tertiary) transition-transform', open && 'rotate-90')}>
            ›
          </span>
        </button>
      </div>
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          {profiles.map(profile => (
            <ScopeChip
              active={normalizeProfileKey(profile.name) === selected}
              key={profile.name}
              label={settingsScopeLabel(profile)}
              onSelect={() => setSettingsScope(profile.name)}
            />
          ))}
        </div>
      ) : null}
      {/* Note truth table (override × non-default target, per the store's
          $settingsScopeEditsNonDefault): non-default target → loud accented
          note whether or not an override is set (the bot-active misdirect);
          explicit override onto the default → quiet tertiary note; following
          the active DEFAULT profile → no note. */}
      {override !== null || editingNonDefault ? (
        <p
          className={cn(
            'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height)',
            editingNonDefault ? 'font-medium text-(--ui-accent)' : 'text-(--ui-text-tertiary)'
          )}
          data-scope-loud={editingNonDefault ? 'true' : undefined}
          role="status"
        >
          {scope.editsProfile(selectedName)}
        </p>
      ) : null}
    </div>
  )
}

/** Read-only note for Providers pages whose requests carry no settings-scope
 *  override and so always edit the app's ACTIVE profile (Local Models — the
 *  managed llama.cpp runtime is machine-scoped). Same string as the selector's
 *  note above; hidden with fewer than two profiles like the selector itself. */
export function ActiveProfileNote({ className }: { className?: string }) {
  const { t } = useI18n()
  const active = useStore($activeGatewayProfile)
  const profiles = useStore($profiles)

  if (profiles.length < 2) {
    return null
  }

  const key = normalizeProfileKey(active)
  const profile = profiles.find(candidate => normalizeProfileKey(candidate.name) === key)

  return (
    <p
      className={cn(
        'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
        className
      )}
      role="status"
    >
      {t.settings.profileScope.editsProfile(profile ? settingsScopeLabel(profile) : key)}
    </p>
  )
}
