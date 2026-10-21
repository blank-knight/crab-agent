import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { $fleetRoster } from '@/store/fleet-roster'
import { $sidebarWorkspaceNodeOpen } from '@/store/layout'
import type { SessionInfo } from '@/types/hermes'

import { SidebarExpertSessionsSection } from './expert-sessions-section'

// Hoisted so the vi.mock factory (also hoisted) can close over them.
const { refreshFleetRoster, listAllProfileSessions } = vi.hoisted(() => ({
  refreshFleetRoster: vi.fn(),
  listAllProfileSessions: vi.fn()
}))

vi.mock('@/store/fleet-roster', async importOriginal => ({
  ...(await importOriginal<object>()),
  refreshFleetRoster
}))

vi.mock('@/hermes', async importOriginal => ({
  ...(await importOriginal<object>()),
  listAllProfileSessions
}))

const EXPERT = 'pmvho4cow'
const LABEL = '算命专家'

const LOCAL_ROSTER = {
  agents: [
    {
      connectionId: 'local-1',
      connectionKind: 'local',
      connectionLabel: '本机',
      handle: EXPERT,
      profile: EXPERT,
      profileMetadata: {
        display_name: '',
        title: '',
        ui_meta: { 'hermes-bots': { title: LABEL } }
      }
    },
    // default profile on the same box: NOT an expert.
    { connectionId: 'local-1', connectionKind: 'local', connectionLabel: '本机', handle: 'default', profile: 'default' },
    // Same profile name on a REMOTE box: not a local expert, must not duplicate.
    { connectionId: 'ssh-1', connectionKind: 'ssh', connectionLabel: 'vps', handle: EXPERT, profile: EXPERT }
  ],
  sources: []
} as never

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
  title: '八字排盘第一次'
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
  refreshFleetRoster.mockReset()
  listAllProfileSessions.mockReset()
  $sidebarWorkspaceNodeOpen.set({})
  $fleetRoster.set(null)
})

afterEach(() => {
  cleanup()
  $fleetRoster.set(null)
  $sidebarWorkspaceNodeOpen.set({})
})

describe('SidebarExpertSessionsSection', () => {
  // Contract: the section exists only for LOCAL expert profiles (fleet roster,
  // kind=local, non-default). No local experts → hidden entirely.
  it('renders nothing when the local roster has no experts', () => {
    $fleetRoster.set({ agents: [], sources: [] } as never)

    const { container } = renderSection()

    expect(container.innerHTML).toBe('')
  })

  it('lists local experts with their Chinese title (bot_title), skipping default and remote twins', async () => {
    $fleetRoster.set(LOCAL_ROSTER)

    renderSection()

    // English group header (pinned-locale convention; the en block's literal).
    expect(screen.getByText('Expert sessions')).toBeTruthy()

    // Chinese bot_title label, exactly one section for the expert.
    expect(await screen.findByText(LABEL)).toBeTruthy()
    expect(screen.getAllByText(LABEL)).toHaveLength(1)
  })

  // Mount forces one roster refresh so a freshly created expert shows up
  // without waiting for a window focus (10-21 install: new expert invisible).
  it('forces a roster refresh on mount', () => {
    $fleetRoster.set(LOCAL_ROSTER)

    renderSection()

    expect(refreshFleetRoster).toHaveBeenCalledWith({ force: true })
  })

  // Contract (#82527 family): session rows resume with the full ROW so the
  // open path can pin the owning profile/connection (see wiring notes).
  it('expands an expert, fetches its page, and resumes with the row', async () => {
    $fleetRoster.set(LOCAL_ROSTER)
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
    $fleetRoster.set(LOCAL_ROSTER)
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
