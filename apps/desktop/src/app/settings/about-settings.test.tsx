import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopVersionInfo } from '@/global'
import { I18nProvider } from '@/i18n'
import { $auth } from '@/store/auth'
import {
  $clientUpdate,
  checkClientUpdate,
  type ClientUpdateState
} from '@/store/client-update'
import { $desktopVersion, refreshDesktopVersion } from '@/store/updates'
import { submitReport } from '@/lib/client-report'

import { AboutSettings } from './about-settings'

// qiji 关于页测试：品牌 hero + 账户信息 + URL 通道更新卡片。
// 上游 source-updater 的 UpdateStatusCard 测试随整页替换废弃。

vi.mock('@/store/updates', async (): Promise<Record<string, unknown>> => {
  const { atom } = await import('nanostores')

  return {
    $desktopVersion: atom<DesktopVersionInfo | null>(null),
    refreshDesktopVersion: vi.fn<() => Promise<DesktopVersionInfo | null>>().mockResolvedValue(null)
  }
})

vi.mock('@/store/client-update', async (): Promise<Record<string, unknown>> => {
  const { atom } = await import('nanostores')
  const idle: ClientUpdateState = {
    status: 'idle',
    error: undefined,
    info: null,
    lastCheckedAt: undefined,
    progressPercent: 0,
    progressIndeterminate: false
  }

  return {
    $clientUpdate: atom<ClientUpdateState>(idle),
    checkClientUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startClientUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    installClientUpdate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    discardDownloadedInstaller: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    openClientUpdateDownloadPage: vi.fn(),
    runEnforcedClientUpdate: vi.fn(),
    isEnforcedUpdate: vi.fn(() => false),
    downloadedInstallerPath: vi.fn(() => null)
  }
})

vi.mock('@/lib/client-report', (): Record<string, unknown> => ({
  submitReport: vi.fn().mockResolvedValue({ ok: true, message: '上报成功' })
}))

vi.mock('@/lib/backend', (): Record<string, unknown> => ({
  backendPost: vi.fn().mockResolvedValue({}),
  backendFetch: vi.fn().mockResolvedValue({})
}))

function renderAbout(): ReturnType<typeof render> {
  return render(
    <I18nProvider configClient={null} initialLocale="zh">
      <AboutSettings />
    </I18nProvider>
  )
}

describe('AboutSettings（qiji 关于页）', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  beforeEach(async () => {
    const { $desktopVersion: versionAtom } = await import('@/store/updates')
    versionAtom.set(null)
    const { $clientUpdate: updateAtom } = await import('@/store/client-update')
    updateAtom.set({ status: 'idle', error: undefined, info: null, lastCheckedAt: undefined, progressPercent: 0, progressIndeterminate: false })
    $auth.set({ token: 't', username: 'u', isCustomKey: false, allowModelSelect: true, platformModels: [], mode: 'formal', score: 5, loginAt: Date.now(), apiKey: null, avatar: null })
  })

  it('渲染品牌标题/版本号/额度与更新卡片（螃蟹OPC 品牌）', async () => {
    const { $desktopVersion: versionAtom } = await import('@/store/updates')
    versionAtom.set({ appVersion: '0.20.0', channel: 'stable' } as DesktopVersionInfo)

    renderAbout()

    // 品牌 hero：标题经品牌层替换为螃蟹OPC
    expect(screen.getByText('螃蟹OPC Desktop')).toBeTruthy()
    expect(screen.getByText('版本 0.20.0')).toBeTruthy()
    // 账户信息
    expect(screen.getByText('剩余额度')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('正式')).toBeTruthy()
    // 更新卡片初始态
    expect(screen.getByText('点击检查更新')).toBeTruthy()
    // 手动更新检查在挂载时刷新版本号
    await waitFor(() => expect(refreshDesktopVersion).toHaveBeenCalled())
  })

  it('版本不可用时显示占位文案', () => {
    renderAbout()
    expect(screen.getByText('版本不可用')).toBeTruthy()
  })

  it('检查中状态渲染 spinner 文案', async () => {
    const { $clientUpdate: updateAtom } = await import('@/store/client-update')
    renderAbout()
    updateAtom.set({ status: 'checking', error: undefined, info: null, lastCheckedAt: undefined, progressPercent: 0, progressIndeterminate: false })
    await waitFor(() => expect(screen.getByText('检查中…')).toBeTruthy())
  })

  it('有新版本时显示版本号与升级文案', async () => {
    const { $clientUpdate: updateAtom } = await import('@/store/client-update')
    renderAbout()
    updateAtom.set({
      status: 'available',
      error: undefined,
      info: { newversion: '0.21.0', upgradetext: '修复若干问题' },
      lastCheckedAt: Date.now(),
      progressPercent: 0,
      progressIndeterminate: false
    } as unknown as ClientUpdateState)
    await waitFor(() => {
      expect(screen.getByText('有新版本 v0.21.0')).toBeTruthy()
      expect(screen.getByText('修复若干问题')).toBeTruthy()
    })
  })

  it('检查失败显示错误文案', async () => {
    const { $clientUpdate: updateAtom } = await import('@/store/client-update')
    renderAbout()
    updateAtom.set({ status: 'error', error: '无法连接更新服务器', info: null, lastCheckedAt: undefined, progressPercent: 0, progressIndeterminate: false })
    await waitFor(() => expect(screen.getByText('无法连接更新服务器')).toBeTruthy())
  })

  it('未登录（无 token）时账户区仍渲染（score=0）', () => {
    $auth.set({ token: null, username: null, isCustomKey: false, allowModelSelect: true, platformModels: [], mode: 'trial', score: 0, loginAt: null, apiKey: null, avatar: null })
    renderAbout()
    expect(screen.getByText('体验')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('一键上报走 submitReport 通道', async () => {
    const { fireEvent } = await import('@testing-library/react')
    renderAbout()
    fireEvent.click(screen.getByRole('button', { name: /一键上报日志/ }))
    const { submitReport: report } = await import('@/lib/client-report')
    await waitFor(() => expect(report).toHaveBeenCalledWith('manual', expect.any(String)))
  })

  it('检查更新按钮触发 checkClientUpdate', async () => {
    const { fireEvent } = await import('@testing-library/react')
    renderAbout()
    fireEvent.click(screen.getByRole('button', { name: /立即检查/ }))
    await waitFor(() => expect(checkClientUpdate).toHaveBeenCalledWith({ manual: true }))
  })
})
