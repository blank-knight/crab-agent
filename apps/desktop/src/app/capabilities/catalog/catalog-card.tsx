import './catalog.css'

import { type ReactNode, useState } from 'react'

import { RowButton } from '@/components/ui/row-button'
import { cn } from '@/lib/utils'

import { resolveSkillIconName, SkillIcon, skillIconTone } from '../../skills/skill-icon'
import { displayDesc, displayName } from '../catalog-localize'

import { type CatalogEntry, catalogLabel } from './catalog-data'
import { CatalogDates, CatalogHeaderMeta, CatalogMetadata } from './catalog-metadata'

export function catalogIcon(category: string) {
  const icons: Record<string, string> = {
    desktop: 'layout',
    tools: 'tools',
    memory: 'database',
    platform: 'plug',
    models: 'hubot',
    web: 'globe',
    automation: 'run-all',
    voice: 'mic',
    'software-development': 'code',
    'autonomous-ai-agents': 'hubot',
    productivity: 'checklist',
    creative: 'paintcan',
    research: 'beaker',
    science: 'beaker',
    security: 'shield',
    media: 'play',
    apple: 'device-desktop'
  }

  return icons[category] ?? 'extensions'
}

export function CatalogImage({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  return failed ? null : (
    <img
      alt=""
      className={cn('block w-full object-contain', className)}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
    />
  )
}

// Shared classes, not per-card inline custom properties: identical declarations
// let the style engine reuse computed styles across cards. catalog.css paints them.
const CARD_ACCENTS = [
  '[--catalog-accent:var(--ui-blue)]',
  '[--catalog-accent:var(--ui-orange)]',
  '[--catalog-accent:var(--ui-purple)]',
  '[--catalog-accent:var(--ui-green)]',
  '[--catalog-accent:var(--ui-red)]',
  '[--catalog-accent:var(--ui-cyan)]',
  '[--catalog-accent:var(--ui-yellow)]'
]

interface CatalogCardProps {
  entry: CatalogEntry
  action: ReactNode
  accentIndex: number
  onOpen: (entry: CatalogEntry) => void
  onCategory: (category: string) => void
  onTag: (tag: string) => void
  onSearch: (value: string) => void
}

export function CatalogCard({ entry, action, accentIndex, onOpen, onCategory, onTag, onSearch }: CatalogCardProps) {
  return (
    <article
      className={cn(
        // qiji 0.20.5: OPC 同款卡片语言——大圆角 + 软阴影 + 悬浮上浮（coral-overrides
        // 曾用 CSS 全局覆盖做同样的事；这里直接落到组件类，全皮肤生效）。
        'group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border',
        'shadow-[0_2px_12px_rgba(45,36,32,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(45,36,32,0.10)]',
        CARD_ACCENTS[accentIndex % CARD_ACCENTS.length]
      )}
      data-catalog-card
      data-entry-id={entry.id}
    >
      {entry.imageUrl && <CatalogImage className="aspect-[2/1]" key={entry.imageUrl} src={entry.imageUrl} />}
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Its ::after stretches over the whole card, so any empty spot opens the
              detail; real controls sit above it (`relative`). One focus stop per card. */}
          {/* qiji 0.19.4→0.20.5: 技能图标（名→类别→兜底三级 + 语义彩色底），中文环境名称走翻译层。
              0.20.5: 圆片升 size-9/rounded-xl，对齐 OPC 卡的图标位。 */}
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl border',
              skillIconTone(resolveSkillIconName(entry.name, entry.category))
            )}
          >
            <SkillIcon category={entry.category} name={entry.name} />
          </span>
          <RowButton
            aria-haspopup="dialog"
            aria-label={displayName(entry)}
            className="min-w-0 flex-1 cursor-pointer text-left font-bold leading-snug after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary focus-visible:after:-outline-offset-2"
            onClick={() => onOpen(entry)}
          >
            <span className="line-clamp-2 min-w-0 break-words text-[1.02rem]">{displayName(entry)}</span>
          </RowButton>
          {action && (
            <span className="relative shrink-0 opacity-[.66] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              {action}
            </span>
          )}
        </div>
        {/* In a fixed-height grid cell the description is what gives way. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <span className="flex w-full items-center gap-2 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
            <span className="min-w-0 flex-1 truncate">{entry.author || catalogLabel(entry.source)}</span>
            <CatalogHeaderMeta entry={entry} />
          </span>
          <span className="line-clamp-4 min-h-0 text-[length:var(--conversation-caption-font-size)] leading-relaxed text-(--ui-text-secondary)">
            {displayDesc(entry)}
          </span>
        </div>
      </div>
      <div className="px-4 pb-3 [&_button]:relative">
        <CatalogMetadata
          entry={entry}
          onCategory={onCategory}
          onOpen={() => onOpen(entry)}
          onSearch={onSearch}
          onTag={onTag}
        />
      </div>
      <div className="mt-auto px-4 pb-4">
        <CatalogDates entry={entry} />
      </div>
    </article>
  )
}
