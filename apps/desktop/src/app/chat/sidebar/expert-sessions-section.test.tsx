import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { $sidebarWorkspaceNodeOpen } from '@/store/layout'
import { $accountLockExceptions } from '@/store/profile'
import type { SessionInfo } from '@/types/hermes'

import { SidebarExpertSessionsSection } from './expert-sessions-section'

// Hoisted so the vi.mock factory (also hoisted) can close over them.
const { getProfiles, listAllProfileSessions } = vi.hoisted(() => ({
  getProfiles: vi.fn(),
  listAllProfileSessions: vi.fn()
}))

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<object>()),
  getProfiles,
  listAllProfileSessions
}))

const EXPERT = 'pmvagpyyc'
const LABEL = '作文老师'

const EXPERT_PROFILE = { name: EXPERT, display_name: '', bot_title: LABEL } as never

const EXPERT_SESSION = {
  connection_id: 'local',
  ended_at: null,
  id: 's-expert-1',
  input_tokens: 0,
  is_active: false,
  last_active: 1_700_000_000,
  message_count: 2,
  model: null,
  output_tokens: 0,
  profile: EXPERT,
  source: 'chat',
  title: '作文批改第一课'
} as SessionInfo

const TOGGLE = `Expand expert sessions for ${LABEL}`

function renderSection(props?: Partial<Parameters<typeof SidebarExpertSessionsSection>[0]>) {
  return render(
    <I18nProvider configClient={null} initialLocale="en">
      <SidebarExpertSessionsSection
        activeSessionId={null}
        onResumeSession={() => {}}
        onToggle={() => {}}
        open
        {...props}
      />
    </I18nProvider>
  )
}

beforeEach(() => {
  getProfiles.mockReset()
  listAllProfileSessions.mockReset()
  $sidebarWorkspaceNodeOpen.set({})
})

afterEach(() => {
  cleanup()
  $accountLockExceptions.set(new Set())
  $sidebarWorkspaceNodeOpen.set({})
})

describe('SidebarExpertSessionsSection', () => {
  // Contract: the section exists only for local expert profiles (the
  // account-lock exception set). No experts / no lock → hidden entirely.
  it('renders nothing when the exception set is empty', () => {
    $accountLockExceptions.set(new Set())

    const { container } = renderSection()

    expect(container.innerHTML).toBe('')
  })

  it('renders the group header and the expert display name (bot_title via profileLabel)', async () => {
    $accountLockExceptions.set(new Set([EXPERT]))
    getProfiles.mockResolvedValue({ profiles: [EXPERT_PROFILE] })

    renderSection()

    // English group header (pinned-locale convention; the en block's literal).
    expect(screen.getByText('Expert sessions')).toBeTruthy()

    // The expert row shows the Chinese bot_title display name.
    expect(await screen.findByText(LABEL)).toBeTruthy()
  })

  // Contract (#82527 family): session rows resume with the full ROW so the
  // open path can pin the owning profile/connection (see wiring notes).
  it('expands an expert, fetches its page, and resumes with the row', async () => {
    $accountLockExceptions.set(new Set([EXPERT]))
    getProfiles.mockResolvedValue({ profiles: [EXPERT_PROFILE] })
    listAllProfileSessions.mockResolvedValue({ sessions: [EXPERT_SESSION] })

    const onResumeSession = vi.fn()
    renderSection({ onResumeSession })

    await screen.findByText(LABEL)

    // Per-expert sections default to collapsed: first click expands.
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }))

    // One page, recent ordering, minMessages=1 (same budget as recents);
    // lock exemption is applied inside listAllProfileSessions itself.
    await waitFor(() => {
      expect(listAllProfileSessions).toHaveBeenCalledTimes(1)
    })
    expect(listAllProfileSessions).toHaveBeenCalledWith(expect.any(Number), 1, 'exclude', 'recent', EXPERT)

    const row = await screen.findByText(EXPERT_SESSION.title!)
    fireEvent.click(row)

    expect(onResumeSession).toHaveBeenCalledWith(EXPERT_SESSION.id, EXPERT_SESSION)
  })

  // Regression: per-expert collapse state lives on the shared workspace-node
  // atom; the header read must be a SUBSCRIBED read (useStore), or toggling
  // never re-renders (the plain workspaceNodeOpen() call doesn't subscribe).
  it('re-renders when a per-expert node toggles (subscribed collapse state)', async () => {
    $accountLockExceptions.set(new Set([EXPERT]))
    getProfiles.mockResolvedValue({ profiles: [EXPERT_PROFILE] })
    listAllProfileSessions.mockResolvedValue({ sessions: [] })

    renderSection()

    await screen.findByText(LABEL)

    const header = screen.getByRole('button', { name: TOGGLE })
    expect(header.getAttribute('aria-expanded')).toBe('false')

    // Click → atom write → subscribed component must flip aria-expanded.
    fireEvent.click(header)
    await waitFor(() => {
      expect(header.getAttribute('aria-expanded')).toBe('true')
    })
  })
})
