import { describe, expect, it } from 'vitest'
import { toolsetDisplayLabel } from './helpers'

describe('qiji 工具集中文映射', () => {
  it('内置工具集显示中文名', () => {
    expect(toolsetDisplayLabel({ label: '🔍 Web Search & Scraping', name: 'web' })).toBe('网页搜索与抓取')
    expect(toolsetDisplayLabel({ label: '💻 Terminal & Processes', name: 'terminal' })).toBe('终端与进程')
    expect(toolsetDisplayLabel({ label: '', name: 'memory' })).toBe('记忆')
  })
  it('未收录 key 回退英文原样', () => {
    expect(toolsetDisplayLabel({ label: '🔌 My Plugin', name: 'my-plugin' })).toBe('My Plugin')
  })
})
