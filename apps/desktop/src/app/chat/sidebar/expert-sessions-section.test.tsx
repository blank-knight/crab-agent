import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { $fleetRoster } from '@/store/fleet-roster'

import { SidebarExpertSessionsSection } from './expert-sessions-section'

// 一专家一线程（0.20.5o-r2）：只列专家名，点击开 canonical chat。

const { openBotCanonicalChat, refreshFleetRoster } = vi.hoisted(() => ({
  openBotCanonicalChat: vi.fn((_profile: string, _opts?: unknown) => Promise.resolve({ openedId: 's1', registryId: 'r1' })),
  refreshFleetRoster: vi.fn((_opts?: unknown) => Promise.resolve())
}))

vi.mock('@/plugins/hermes-bots/canonical-chat', () => ({ openBotCanonicalChat }))
vi.mock('@/store/fleet-roster', async () => {
  const { atom } = await import('nanostores')

  return {
    $fleetRoster: atom<{ agents: Array<Record<string, unknown>> } | null>(null),
    refreshFleetRoster
  }
})
vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))

const mount = (props: { open?: boolean } = { open: true }) =>
  render(
    <I18nProvider>
      <SidebarExpertSessionsSection onToggle={() => undefined} open={props.open ?? true} />
    </I18nProvider>
  )

beforeEach(() => {
  vi.clearAllMocks()
  $fleetRoster.set(null)
})

afterEach(cleanup)

describe('SidebarExpertSessionsSection（一专家一线程）', () => {
  it('roster 空时整个分组自隐藏', () => {
    const { container } = mount()
    expect(container.querySelector('button')).toBeNull()
  })

  it('本机专家渲染为单行中文名，点击开 canonical chat', async () => {
    $fleetRoster.set({
      sources: [],
      agents: [
        { connectionKind: 'local', profile: 'pmvho4cow', profileMetadata: { ui_meta: { 'hermes-bots': { title: '算命专家' } } } }
      ] as never
    })

    mount()
    const row = await screen.findByText('算命专家')
    fireEvent.click(row)

    await waitFor(() => {
      expect(openBotCanonicalChat).toHaveBeenCalledWith('pmvho4cow', { kickoffOnCreate: true })
    })
  })

  it('default 与远程档案不产生行（default 排除 + 远程同名去重）', async () => {
    $fleetRoster.set({
      sources: [],
      agents: [
        { connectionKind: 'local', profile: 'default' },
        { connectionKind: 'remote', profile: 'writer', profileMetadata: { display_name: '远程作家' } }
      ] as never
    })

    const { container } = mount()
    expect(container.querySelector('button')).toBeNull()
  })

  it('挂载时强刷 roster（新删专家立即可见）', async () => {
    $fleetRoster.set({ sources: [], agents: [{ connectionKind: 'local', profile: 'writer', profileMetadata: { display_name: '作家' } }] as never })
    mount()
    expect(refreshFleetRoster).toHaveBeenCalledWith({ force: true })
  })
})
