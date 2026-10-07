import { useState } from 'react'

import { useI18n } from '@/i18n'
import { capitalize, normalize } from '@/lib/text'
import { brandText } from '@/store/oem-brand'

import introCopyJsonl from './intro-copy.jsonl?raw'
import { Wordmark } from './wordmark'

type IntroCopy = {
  headline: string
  body: string
}

type IntroCopyRecord = IntroCopy & {
  personality: string
}

export type QuickSkill = {
  name: string
  title: string
  desc: string
}

export type IntroExample = {
  title: string
  prompt: string
}

export type IntroProps = {
  personality?: string
  seed?: number
  quickSkills?: QuickSkill[]
  examples?: IntroExample[]
  onPickSkill?: (name: string) => void
  onPickExample?: (prompt: string) => void
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

const FALLBACK_COPY: IntroCopy[] = [
  {
    headline: 'What are we moving today?',
    body: "Send a bug, branch, plan, or rough idea. I'll inspect the repo and turn it into the next concrete step."
  },
  {
    headline: "What's on your mind?",
    body: "Bring the code, question, or stuck part. I'll read the room before making changes."
  },
  {
    headline: 'What should we look at?',
    body: "Send the task, failing path, or half-formed plan. I'll help turn it into action."
  },
  {
    headline: 'Where should we start?',
    body: "Bring the problem, goal, or file. I'll inspect first and keep the next step concrete."
  },
  {
    headline: 'What needs attention?',
    body: "Send the context you have. I'll help sort it into a plan or a fix."
  }
]

function normalizeKey(value?: string): string {
  return normalize(value)
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ')
}

function isIntroCopyRecord(value: unknown): value is IntroCopyRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.personality === 'string' &&
    typeof record.headline === 'string' &&
    typeof record.body === 'string' &&
    Boolean(record.personality.trim()) &&
    Boolean(record.headline.trim()) &&
    Boolean(record.body.trim())
  )
}

function parseIntroCopy(raw: string): Record<string, IntroCopy[]> {
  const byPersonality: Record<string, IntroCopy[]> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (!isIntroCopyRecord(parsed)) {
        continue
      }

      const key = normalizeKey(parsed.personality)
      byPersonality[key] ??= []
      byPersonality[key].push({
        headline: parsed.headline.trim(),
        body: parsed.body.trim()
      })
    } catch {
      // Bad generated copy should not break the whole desktop app.
    }
  }

  return byPersonality
}

const INTRO_COPY_BY_PERSONALITY = parseIntroCopy(introCopyJsonl)

function neutralCopy(): IntroCopy[] {
  return INTRO_COPY_BY_PERSONALITY.none || INTRO_COPY_BY_PERSONALITY.default || FALLBACK_COPY
}

function fallbackCopyForPersonality(personalityKey: string): IntroCopy[] {
  if (NEUTRAL_PERSONALITIES.has(personalityKey)) {
    return neutralCopy()
  }

  const label = titleize(personalityKey)

  return [
    {
      headline: `${label} mode is on. What should we work on?`,
      body: "Send the task, file, or rough idea. I'll use your configured voice and keep the work grounded in this repo."
    },
    {
      headline: `What does ${label} need to see?`,
      body: "Bring the context or the stuck part. I'll adapt to your configured personality."
    },
    {
      headline: `${label} mode is ready.`,
      body: "Send the problem, file, or idea. I'll follow the personality you've configured."
    },
    {
      headline: `What should ${label} tackle?`,
      body: "Drop the task here. I'll keep the work grounded in the repo."
    },
    {
      headline: 'Where should we begin?',
      body: `Give me the context and I'll answer in ${label} mode.`
    }
  ]
}

function pickCopy(copies: IntroCopy[], seed = 0): IntroCopy {
  return copies[Math.abs(seed) % copies.length] || FALLBACK_COPY[0]
}

// qiji: 空态大字走品牌链——brandText('奇计') 运行时替换为生效品牌(默认螃蟹AI/贴牌名)
const WORDMARK = brandText('奇计')

function resolveCopy(personality?: string, seed?: number): IntroCopy {
  const personalityKey = normalizeKey(personality)

  const copies = NEUTRAL_PERSONALITIES.has(personalityKey)
    ? INTRO_COPY_BY_PERSONALITY[personalityKey] || neutralCopy()
    : INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)

  return pickCopy(copies, seed)
}

export function Intro({ personality, seed, quickSkills, onPickSkill }: IntroProps) {
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const { t } = useI18n()
  const rotationSeed = mountSeed + (seed ?? 0)
  const copy = resolveCopy(personality, rotationSeed)
  const key = normalizeKey(personality)

  const bodies =
    t.intro.stock[key] ?? (NEUTRAL_PERSONALITIES.has(key) ? t.intro.stock.none : t.intro.custom(personality || ''))

  const body = bodies?.[Math.abs(rotationSeed) % bodies.length] ?? copy.body

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <Wordmark className="mb-1" text={WORDMARK} />

        <p className="m-0 text-center leading-normal tracking-tight">{body}</p>

        {quickSkills && quickSkills.length > 0 && onPickSkill ? (
          <div className="pointer-events-auto mt-3 w-full max-w-xl">
            <div className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">
              {t.intro.quickSkillsLabel}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {quickSkills.map(sk => (
                <button
                  aria-label={sk.desc}
                  className="group shrink-0 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                  key={sk.name}
                  onClick={() => onPickSkill(sk.name)}
                  type="button"
                >
                  <span className="text-[0.75rem] font-medium text-foreground">{sk.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** 最佳实践条：挂载在输入框下方（仅空会话主页显示） */
export function ExamplesStrip({ examples, onPick }: { examples: IntroExample[]; onPick: (prompt: string) => void }) {
  const { t } = useI18n()

  if (examples.length === 0) {return null}

  return (
    <div className="pointer-events-auto absolute top-[calc(42%+var(--composer-measured-height,160px)+0.75rem)] left-1/2 z-20 w-[min(var(--composer-width),calc(100%-2rem))] max-w-full -translate-x-1/2 px-1 pb-1">
      <div className="mb-1.5 text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-tertiary)">
        {t.intro.examplesLabel}
      </div>
      <div className="flex flex-col gap-1">
        {examples.map(ex => (
          <button
            aria-label={ex.prompt}
            className="w-full truncate rounded-lg border border-border/50 bg-transparent px-3 py-1.5 text-left text-[0.8rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            key={ex.title}
            onClick={() => onPick(ex.prompt)}
            type="button"
          >
            {ex.title}
          </button>
        ))}
      </div>
    </div>
  )
}
