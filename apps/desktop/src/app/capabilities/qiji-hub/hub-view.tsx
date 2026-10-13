import { useQuery } from '@tanstack/react-query'
// qiji 0.20.4: 「技能与工具」自研页 — 视觉 v2（design-preview 设计语言落地）。
//
// 设计语言 = 珊瑚螃蟹（暖黑窄栏 + 大圆角卡片 + 软阴影 + 悬浮上浮）。
// 全部颜色走主题 token（coral 皮肤下即预览稿效果，其他皮肤自动适配）。
// 数据钩子/开关写入/翻译层不变（v1 已验证），只换视图层。
//
// 上游同步注意：qiji 隔离区组件；接线点在 capabilities/index.tsx 的 qiji 标记块。
import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getSkillContent, type ProfileScope, profileScopeKey, setSkillEnabled } from '@/hermes'
import { useI18n } from '@/i18n'
import type { IconComponent } from '@/lib/icons'
import { queryClient } from '@/lib/query-client'
import { invalidateSlashCompletions } from '@/lib/slash-completion-cache'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { SkillInfo } from '@/types/hermes'

import { parseFrontmatter } from '../skills/frontmatter'
import { skillsQueryKey, usageOf } from '../skills/skills-data'
import { categoryZh, skillDescZh, skillNameZh } from '../zh-display'

import { HUB_CATEGORIES, type HubCategory } from './categories'

// ─────────────────────────────────────────────────────────────
// 左 rail：暖黑窄栏 + 图标分组（设计稿的侧栏语言）。
// ─────────────────────────────────────────────────────────────

interface RailEntry {
  id: string
  label: string
  icon?: IconComponent
  count: number
}

/** 分类的首字当"彩色头像"——稳定 hash 出暖色系色相。 */
function categoryHue(id: string): number {
  let h = 0

  for (const ch of id) {h = (h * 31 + ch.charCodeAt(0)) % 360}

  return h
}

function HubRail({
  activeId,
  entries,
  footer,
  onSelect
}: {
  activeId: string
  entries: RailEntry[]
  footer?: React.ReactNode
  onSelect: (id: string) => void
}) {
  return (
    <aside
      className="flex w-[10.5rem] min-h-0 shrink-0 flex-col gap-1 overflow-y-auto border-r border-(--ui-border)/50 bg-(--ui-sidebar-surface-background) px-2 pb-3 pt-3"
      data-tour="hub-nav"
    >
      {entries.map(entry => {
        const active = entry.id === activeId

        return (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex w-full items-center gap-2.5 px-2 py-2 text-left transition-all duration-150',
              active
                ? 'rounded-xl bg-(--ui-row-active-background) text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.06)]'
                : 'rounded-xl text-foreground/70 hover:bg-(--chrome-action-hover)/60 hover:text-foreground'
            )}
            key={entry.id}
            onClick={() => onSelect(entry.id)}
            type="button"
          >
            {/* 分类"头像"：首字圆片（快捷项用图标位） */}
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-[9px] text-[0.72rem] font-bold text-white transition-transform duration-150 group-hover:scale-105"
              style={{
                background:
                  entry.id === '__all'
                    ? 'var(--ui-primary)'
                    : entry.id === '__enabled'
                      ? 'color-mix(in srgb, var(--ui-primary) 55%, var(--ui-muted))'
                      : `hsl(${categoryHue(entry.id)} 42% 58%)`
              }}
            >
              {entry.label.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.84rem] font-semibold">{entry.label}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[0.66rem] font-medium tabular-nums',
                active ? 'bg-(--ui-primary)/15 text-(--ui-primary)' : 'text-(--ui-text-tertiary)'
              )}
            >
              {entry.count}
            </span>
          </button>
        )
      })}
      {footer && <div className="mt-auto pt-2">{footer}</div>}
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────
// 内容区：分类大标题 + 卡片网格（圆角/软阴影/悬浮上浮）。
// ─────────────────────────────────────────────────────────────

function SkillCard({
  onToggle,
  profile,
  skill
}: {
  onToggle: (enabled: boolean) => void
  profile?: ProfileScope
  skill: SkillInfo
}) {
  const [expanded, setExpanded] = useState(false)
  const zhName = skillNameZh(skill.name, skill.name)
  const zhDesc = skillDescZh(skill.name, skill.description || '')

  return (
    <div
      className={cn(
        'group flex flex-col rounded-2xl border border-(--ui-border)/70 bg-(--ui-card) p-4 transition-all duration-200',
        'shadow-[0_2px_12px_rgba(45,36,32,0.05)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(45,36,32,0.10)]',
        skill.enabled && 'border-(--ui-primary)/25'
      )}
    >
      <div className="flex items-start gap-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded(v => !v)}
          type="button"
        >
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.95rem] font-bold text-(--ui-text-primary)">{zhName}</p>
            {usageOf(skill) > 0 && (
              <span className="shrink-0 rounded-full bg-(--ui-muted) px-1.5 py-0.5 text-[0.64rem] font-medium text-(--ui-text-tertiary)">
                已用 {usageOf(skill)} 次
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[0.76rem] leading-relaxed text-(--ui-text-tertiary)">{zhDesc}</p>
        </button>
        <Switch
          aria-label={zhName}
          checked={skill.enabled}
          onCheckedChange={onToggle}
          size="xs"
        />
      </div>
      {expanded && (
        <div className="mt-3 border-t border-(--ui-border)/50 pt-3">
          <div className="rounded-xl bg-(--ui-muted)/60 px-3 py-2">
            <p className="text-[0.74rem] leading-relaxed text-(--ui-text-secondary)">
              {zhDesc || '暂无描述。'}
            </p>
          </div>
          <SkillFullBody name={skill.name} profile={profile} />
        </div>
      )}
    </div>
  )
}

/** 详情展开区：qiji 0.20.5f — 不再展示英文 SKILL.md 原文（它是给模型的操作
 * 手册，不是给用户的）。只留中文摘要 + 技能名/版本元数据 + 「使用」按钮
 * （预填 /技能名 到聊天输入框，用户补一句需求即可调用）。
 * getSkillContent 仅用于取 frontmatter 的版本号，正文丢弃。 */
function SkillFullBody({ name, profile }: { name: string; profile?: ProfileScope }) {
  const { t } = useI18n()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['skill-content', name, profileScopeKey(profile)],
    queryFn: () => getSkillContent(name, profile),
    staleTime: 60_000
  })

  const parsed = useMemo(() => (data ? parseFrontmatter(data.content) : null), [data])
  const version = parsed?.meta.find(([k]) => k === 'version')?.[1]

  const onUse = () => {
    navigate('/')
    window.dispatchEvent(
      new CustomEvent('qiji:insert-skill', { detail: { command: `/${name} `, label: skillNameZh(name, name) } })
    )
  }

  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-(--ui-muted)/60 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-(--ui-text-tertiary)">
          <span>
            {t.skills.skillMetaName}：<code className="font-mono">{name}</code>
          </span>
          {version ? (
            <span>
              {t.skills.skillMetaVersion}：{version}
            </span>
          ) : null}
        </div>
        <Button
          className="h-7 shrink-0 rounded-lg px-3 text-[0.74rem]"
          onClick={onUse}
          size="sm"
          type="button"
        >
          {t.skills.useSkill}
        </Button>
      </div>
      <p className="px-1 text-[0.68rem] leading-relaxed text-(--ui-text-quaternary)">
        {t.skills.useSkillHint.replace('{name}', name)}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 技能大类页
// ─────────────────────────────────────────────────────────────

function SkillsPane({
  profile,
  skills,
  onRefresh,
  marketEntry
}: {
  profile: ProfileScope
  skills: SkillInfo[]
  onRefresh: () => void
  marketEntry?: React.ReactNode
}) {
  const { t } = useI18n()
  const [activeCategory, setActiveCategory] = useState('__all')

  const entries = useMemo(() => {
    const byCategory = new Map<string, number>()

    for (const skill of skills) {
      const cat = skill.category || 'general'
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1)
    }

    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

    return [
      { id: '__all', label: '全部', count: skills.length },
      { id: '__enabled', label: '已启用', count: skills.filter(s => s.enabled).length },
      ...sorted.map(([cat, count]) => ({ id: cat, label: categoryZh(cat), count }))
    ]
  }, [skills])

  const visible = useMemo(() => {
    if (activeCategory === '__all') {return skills}

    if (activeCategory === '__enabled') {return skills.filter(s => s.enabled)}

    return skills.filter(s => (s.category || 'general') === activeCategory)
  }, [skills, activeCategory])

  const ordered = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          Number(b.enabled) - Number(a.enabled) ||
          usageOf(b) - usageOf(a) ||
          skillNameZh(a.name, a.name).localeCompare(skillNameZh(b.name, b.name), 'zh')
      ),
    [visible]
  )

  const applyEnabled = useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      const previous = queryClient.getQueryData<SkillInfo[]>(skillsQueryKey(profile)) ?? []
      queryClient.setQueryData(
        skillsQueryKey(profile),
        previous.map(s => (s.name === skill.name ? { ...s, enabled } : s))
      )

      try {
        await setSkillEnabled(skill.name, enabled, profile)
        invalidateSlashCompletions()
        notify({
          kind: 'success',
          title: enabled ? t.skills.skillEnabled : t.skills.skillDisabled,
          message: t.skills.appliesToNewSessions(skillNameZh(skill.name, skill.name))
        })
        onRefresh()
      } catch (err) {
        queryClient.setQueryData(skillsQueryKey(profile), previous)
        notifyError(err, skill.name)
      }
    },
    [profile, t, onRefresh]
  )

  const heading = entries.find(e => e.id === activeCategory)?.label ?? '全部'

  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <HubRail activeId={activeCategory} entries={entries} footer={marketEntry} onSelect={setActiveCategory} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-baseline gap-2.5 px-5 pb-2 pt-4">
          <h2 className="text-[1.15rem] font-bold tracking-tight text-(--ui-text-primary)">{heading}</h2>
          <span className="text-[0.75rem] font-medium text-(--ui-text-tertiary)">{ordered.length} 项</span>
        </div>
        {ordered.length === 0 ? (
          <p className="px-5 py-8 text-[0.8rem] text-(--ui-text-tertiary)">此分组暂无技能。</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2.5 px-5 pb-5">
            {ordered.map(skill => (
              <SkillCard
                key={skill.name}
                onToggle={enabled => void applyEnabled(skill, enabled)}
                profile={profile}
                skill={skill}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 外框：顶部大类栏（胶囊 tab 设计）+ 大类分发
// ─────────────────────────────────────────────────────────────

const CategoryTab = memo(function CategoryTab({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: IconComponent
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[0.85rem] font-semibold transition-all duration-150',
        active
          ? 'bg-(--ui-primary) text-(--ui-primary-foreground) shadow-[0_3px_12px_color-mix(in_srgb,var(--ui-primary)_35%,transparent)]'
          : 'text-(--ui-text-tertiary) hover:bg-(--ui-muted) hover:text-foreground'
      )}
      data-tour={`hub-category-${label}`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
})

export function QijiCapabilitiesHub({
  activeCategory,
  marketActive,
  onCategoryChange,
  skills,
  skillsPending,
  profile,
  onRefresh,
  marketEntry,
  fallbackContent
}: {
  activeCategory: HubCategory['id']
  /** qiji: market 模式（技能市场面板全幅渲染，覆盖 skills 分支） */
  marketActive?: boolean
  onCategoryChange: (id: HubCategory['id']) => void
  skills: SkillInfo[]
  skillsPending: boolean
  profile: ProfileScope
  onRefresh: () => void
  /** 「技能市场」入口（market 模式由外层持有，点它切过去） */
  marketEntry?: React.ReactNode
  /** 连接器/插件沿用现有 tab 组件（塞进同骨架） */
  fallbackContent: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className="shrink-0 px-4 pt-[calc(var(--titlebar-height)/2+0.375rem)]">
        <div
          className="flex shrink-0 items-center gap-1 overflow-x-auto pb-1"
          data-tour="hub-categories"
        >
          {HUB_CATEGORIES.map(cat => (
            <CategoryTab
              active={cat.id === activeCategory}
              icon={cat.icon}
              key={cat.id}
              label={cat.label}
              onClick={() => onCategoryChange(cat.id)}
            />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {activeCategory === 'skills' && !marketActive ? (
          skillsPending ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[0.85rem] text-(--ui-text-tertiary)">正在加载能力…</p>
            </div>
          ) : (
            <SkillsPane marketEntry={marketEntry} onRefresh={onRefresh} profile={profile} skills={skills} />
          )
        ) : (
          // qiji 0.20.4→0.20.5: 连接器/插件沿用旧 tab 组件——外套同款视觉壳
          // （大标题+卡片容器+计数，OPC 语言）；细粒度样式由 coral-overrides.css
          // 全局接管。0.20.5: 标题按实际大类取（不再硬编码二选一）。
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-5 mb-3 mt-4 flex min-h-0 flex-1 flex-col rounded-2xl border border-(--ui-border)/60 bg-(--ui-card)/60 p-4 shadow-[0_2px_12px_rgba(45,36,32,0.04)]">
              <div className="mb-3 flex items-baseline gap-2.5">
                <h2 className="text-[1.15rem] font-bold tracking-tight text-(--ui-text-primary)">
                  {HUB_CATEGORIES.find(cat => cat.id === activeCategory)?.label ?? '工具'}
                </h2>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">{fallbackContent}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
