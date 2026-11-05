import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpcView } from './index'

// react-router 的 useNavigate 打桩（OPC 在 jsdom 无 Router 环境）
vi.mock('react-router', () => ({ useNavigate: () => () => {} }))

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactElement) => <QueryClientProvider client={qc}>{ui}</QueryClientProvider>

describe('OpcView 渲染（#310 回归）', () => {
  afterEach(cleanup)

  it('技能 tab 渲染', () => {
    render(wrap(<OpcView />))
    expect(screen.getByText('OPC 智能体')).toBeTruthy()
  })

  it('切到专家 tab 后 RosterGrid 挂载不炸', async () => {
    render(wrap(<OpcView />))
    screen.getByRole('button', { name: '专家' }).click()
    await vi.waitFor(
      () => {
        const text = document.body.textContent ?? ''
        // 静态 useRoster：挂载即渲染（可能加载失败文案，但绝不 blank/boundary）
        expect(text).toMatch(/专家列表|没有专家|专家.*独立配置档案|failed to render/)
        expect(text).not.toMatch(/failed to render/)
      },
      { timeout: 5000 }
    )
  })
})
