// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileInfo } from '@/types/hermes'

// Keep store/profile's side-effecting imports inert — same seam as
// store/profile.test.ts / profile-tag.test.tsx.
vi.mock('@/store/gateway', () => ({
  $gateway: atom<unknown>(null),
  ensureGatewayForAgent: vi.fn(async () => undefined),
  ensureGatewayForProfile: vi.fn(async () => undefined),
  openGatewayForProfile: vi.fn(async () => undefined)
}))
vi.mock('@/hermes', () => ({
  getProfiles: vi.fn(async () => ({ profiles: [] })),
  setApiRequestProfile: vi.fn()
}))
vi.mock('@/lib/query-client', () => ({ invalidateProfileScopedQueries: vi.fn() }))
vi.mock('@/store/starmap', () => ({ resetStarmapGraph: vi.fn() }))

const { $activeGatewayProfile, $profiles } = await import('@/store/profile')
const { $settingsScopeOverride } = await import('@/store/settings-scope')
const { ActiveProfileNote, SettingsProfileScope } = await import('./profile-scope')

const profile = (name: string, isDefault = false, extra: Partial<ProfileInfo> = {}): ProfileInfo =>
  ({ has_env: false, is_default: isDefault, model: null, name, ...extra }) as ProfileInfo

beforeEach(() => {
  $activeGatewayProfile.set('default')
  $settingsScopeOverride.set(null)
  $profiles.set([])
})

afterEach(cleanup)

describe('SettingsProfileScope', () => {

// qiji: scope 选择器默认收起为内联下拉——先展开再点 chip
function expandChips() {
  // 折叠态按钮的 accessible name = "<当前选中项>"(aria-hidden 的 › 不计入 name)。
  // 通过排除法点它：它带有 hover:bg-(--chrome-action-hover) 类（chip 没有）。
  const toggle = screen.getAllByRole('button').find(b => b.className.includes('chrome-action-hover'))
  expect(toggle).toBeTruthy()
  fireEvent.click(toggle!)
}
  it('renders nothing with fewer than two profiles', () => {
    $profiles.set([profile('default', true)])

    const { container } = render(<SettingsProfileScope />)
    expect(container.textContent).toBe('')
  })

  it('selecting another profile sets the shared override; re-selecting the active clears it', () => {
    $profiles.set([profile('default', true), profile('coder')])

    render(<SettingsProfileScope />)

    expandChips()
    fireEvent.click(screen.getByRole('button', { name: 'coder' }))
    expect($settingsScopeOverride.get()).toBe('coder')

    // 选中 coder 后：折叠按钮名=coder，default 名只剩 chip（chips 仍展开）
    fireEvent.click(screen.getAllByRole('button', { name: 'default' }).at(-1)!)
    expect($settingsScopeOverride.get()).toBeNull()
  })

  // #89190/#89162 class: after opening a Bot Mode chat, the ACTIVE profile is
  // the bot's — so with no override the settings pages silently edit the bot's
  // config. The target must be stated (accented) whenever it isn't the default
  // profile, override or not.
  it('states the edit target when the active profile is a non-default bot (no override)', () => {
    $activeGatewayProfile.set('scout')
    $profiles.set([profile('default', true), profile('scout')])

    const { container } = render(<SettingsProfileScope />)

    expect($settingsScopeOverride.get()).toBeNull()
    expect(container.textContent).toContain('scout')
    // The note is present and flagged loud (data-scope-loud marks the accented variant).
    const note = container.querySelector('[role="status"]')
    expect(note).toBeTruthy()
    expect(note?.getAttribute('data-scope-loud')).toBe('true')
  })

  it('shows no note when following the active DEFAULT profile', () => {
    $activeGatewayProfile.set('default')
    $profiles.set([profile('default', true), profile('coder')])

    const { container } = render(<SettingsProfileScope />)

    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('keeps the quiet note style for an explicit override onto the default profile', () => {
    $activeGatewayProfile.set('scout')
    $profiles.set([profile('default', true), profile('scout')])

    render(<SettingsProfileScope />)

    expandChips()
    fireEvent.click(screen.getByRole('button', { name: 'default' }))
    expect($settingsScopeOverride.get()).toBe('default')

    const note = document.querySelector('[role="status"]')
    expect(note).toBeTruthy()
    expect(note?.hasAttribute('data-scope-loud')).toBe(false)
  })

  it('labels chips with the bot title, else the display name, else the slug', () => {
    $profiles.set([
      profile('default', true, { bot_title: 'JordyV', display_name: 'JordieF' }),
      profile('default-2', false, { display_name: 'Copy' }),
      profile('weather-man')
    ])

    render(<SettingsProfileScope />)

    // Bot Mode title wins over display_name and the slug — same identity the
    // Bots roster shows.
    expandChips()
    // 折叠按钮与 chip 同名 JordyV —— getAllBy（两者都在 = 折叠态显示当前项 + chip）
    expect(screen.getAllByRole('button', { name: 'JordyV' }).length).toBeGreaterThanOrEqual(2)
    // display_name (profile.yaml) when no Bot Mode title exists.
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
    // Canonical slug when neither is set.
    expect(screen.getByRole('button', { name: 'weather-man' })).toBeTruthy()
  })

  it('keeps selection keyed on the canonical name while showing the presentation label', () => {
    $profiles.set([profile('default', true), profile('coder', false, { bot_title: 'JordyV' })])

    render(<SettingsProfileScope />)

    expandChips()
    fireEvent.click(screen.getByRole('button', { name: 'JordyV' }))
    // The label changed, the identity did not: the override stores the slug.
    expect($settingsScopeOverride.get()).toBe('coder')
    // The "applies to" note names the target the way its chip does.
    expect(document.querySelector('[role="status"]')?.textContent).toContain('JordyV')
    expect(document.querySelector('[role="status"]')?.textContent).not.toContain('coder')
  })
})

// Local Models sends unscoped requests, so it always edits the ACTIVE profile;
// the note must say which one — and stay silent for single-profile users, like
// the selector.
describe('ActiveProfileNote', () => {
  it('names the active profile (by its chip label) only with two or more profiles', () => {
    $activeGatewayProfile.set('setup')
    $profiles.set([profile('default', true)])
    const { container, rerender } = render(<ActiveProfileNote />)
    expect(container.textContent).toBe('')

    $profiles.set([profile('default', true), profile('setup', false, { display_name: 'Setup box' })])
    rerender(<ActiveProfileNote />)
    expect(screen.getByRole('status').textContent).toContain('Setup box')
    expect($settingsScopeOverride.get()).toBeNull()
  })
})
