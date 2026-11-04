import { describe, expect, it } from 'vitest'

import { deriveDraftTitle } from './draft-title'

describe('deriveDraftTitle qiji slash localization (0.20.5h)', () => {
  it('bare slash command localizes to the Chinese skill name', () => {
    expect(deriveDraftTitle('/img-toolkit')).toBe('图片处理')
    expect(deriveDraftTitle('/pptx-maker')).toBe('PPT 制作')
  })

  it('unknown bare command keeps the placeholder (empty)', () => {
    expect(deriveDraftTitle('/totally-unknown-cmd')).toBe('')
  })

  it('slash with argument drops the prefix and titles from the argument', () => {
    expect(deriveDraftTitle('/img-toolkit 把这批照片压缩到500KB以下')).toBe('把这批照片压缩到500KB以下')
  })

  it('plain text still titles from itself', () => {
    expect(deriveDraftTitle('销售数据透视汇总')).toBe('销售数据透视汇总')
  })

  it('empty stays empty', () => {
    expect(deriveDraftTitle('')).toBe('')
  })
})
