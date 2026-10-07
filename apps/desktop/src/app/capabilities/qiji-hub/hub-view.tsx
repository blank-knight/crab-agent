import { useQuery } from '@tanstack/react-query'
// qiji 0.20.4: 「技能与工具」自研页 — 主视图。
//
// 对齐设置页的两级导航模式（用户认可的现役形态）：
//   顶部大类标签栏（4 大类，一行放下）+ 左 rail（当前大类内的分组，手风琴单开合）
//   + 右内容区（分组标题 + 行卡片 + 开关）。
//
// 与上游 CapabilitiesView 的关系：数据钩子/开关写入/刷新全部复用
// （useSkillsQuery / setSkillEnabled / refreshCapabilities），只重写视图层。
// 旧视图（skills-tab / toolsets-tab / catalog）代码保留，路由一处切换。
//
// 上游同步注意：qiji 隔离区组件（本目录），上游 merge 不触碰；接线点只在
// capabilities/index.tsx 的 qiji 标记块内。
import { memo, useCallback, useMemo, useState } from 'react'

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
// 分类 rail：技能按分类分组（中文），手风琴单开合由 SettingsSideRail 语义自带。
// 这里复刻 RailItem 视觉（不直接 import SettingsSideRail——它读
// --titlebar-height 的 padding 是设置页布局专属，本页由外层统一给）。
// ─────────────────────────────────────────────────────────────

interface RailEntry {
  id: string
  label: string
  icon?: IconComponent
  count: number
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
      className="flex w-[11.5rem] min-h-0 shrink-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-1.5 pb-3 pt-2"
      data-tour="hub-nav"
    >
      {entries.map((entry, index) => (
        <button
          aria-current={entry.id === activeId ? 'page' : undefined}
          className={cn(
            'row-hover flex h-8 w-full shrink-0 items-center justify-start gap-2 border border-transparent px-2.5 text-left transition-colors',
            index === 0 && entry.id === '__all' ? 'mt-0' : '',
            entry.id === activeId
              ? 'border-l-2 border-l-foreground bg-(--ui-row-active-background) text-foreground text-[0.9rem] font-semibold'
              : 'text-foreground/85 text-[0.9rem] font-semibold hover:bg-(--chrome-action-hover)'
          )}
          key={entry.id}
          onClick={() => onSelect(entry.id)}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          <span className="shrink-0 text-[0.7rem] font-normal text-(--ui-text-tertiary)">{entry.count}</span>
        </button>
      ))}
      {footer && <div className="mt-auto pt-2">{footer}</div>}
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────
// 内容区：分组标题（大而粗，用户偏好）+ 行卡片列表。
// ─────────────────────────────────────────────────────────────

function SkillRow({
  disabled,
  onToggle,
  profile,
  skill
}: {
  disabled: boolean
  onToggle: (enabled: boolean) => void
  profile?: ProfileScope
  skill: SkillInfo
}) {
  const [expanded, setExpanded] = useState(false)
  const zhName = skillNameZh(skill.name, skill.name)
  const zhDesc = skillDescZh(skill.name, skill.description || '')

  return (
    <div className="border-b border-(--ui-border)/40 last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-(--chrome-action-hover)/40"
        onClick={() => setExpanded(v => !v)}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.92rem] font-semibold text-(--ui-text-primary)">{zhName}</p>
          <p className="mt-0.5 truncate text-[0.75rem] text-(--ui-text-tertiary)">{zhDesc}</p>
        </div>
        {usageOf(skill) > 0 && (
          <span className="shrink-0 text-[0.7rem] text-(--ui-text-tertiary)">已用 {usageOf(skill)} 次</span>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-(--ui-border) bg-(--ui-bg-secondary)/40 px-3 py-2">
            <p className="text-[0.72rem] leading-relaxed text-(--ui-text-secondary)">
              {zhDesc || '暂无描述。'}
            </p>
            {zhDesc !== (skill.description || '') && (
              <p className="mt-1.5 text-[0.68rem] leading-relaxed text-(--ui-text-tertiary)">
                原文：{skill.description}
              </p>
            )}
          </div>
          {skill.enabled && usageOf(skill) >= 0 && <SkillFullBody name={skill.name} profile={profile} />}
        </div>
      )}
    </div>
  )
}

/** 详情展开区：完整 SKILL.md 正文（点开行才拉取；沿用 detail 的 frontmatter 剥离逻辑）。 */
function SkillFullBody({ name, profile }: { name: string; profile?: ProfileScope }) {
  const { t } = useI18n()

  const { data, isLoading } = useQuery({
    queryKey: ['skill-content', name, profileScopeKey(profile)],
    queryFn: () => getSkillContent(name, profile),
    staleTime: 60_000
  })

  const parsed = useMemo(() => (data ? parseFrontmatter(data.content) : null), [data])

  if (isLoading) {
    return <p className="mt-2 px-1 text-[0.7rem] text-(--ui-text-tertiary)">{t.skills.loading}</p>
  }

  if (!parsed?.body) {
    return null
  }

  return (
    <pre
      className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-(--ui-border)/60 bg-(--ui-bg-secondary)/30 px-3 py-2 font-mono text-[0.68rem] leading-relaxed text-(--ui-text-secondary)"
      data-selectable-text="true"
    >
      {parsed.body}
    </pre>
  )
}

function SkillRowWithSwitch({
  disabled,
  onToggle,
  profile,
  skill
}: {
  disabled: boolean
  onToggle: (enabled: boolean) => void
  profile?: ProfileScope
  skill: SkillInfo
}) {
  return (
    <div className="relative">
      <SkillRow disabled={disabled} onToggle={onToggle} profile={profile} skill={skill} />
      <div className="absolute right-3 top-1/2 -translate-y-1/2">
        <Switch
          aria-label={skillNameZh(skill.name, skill.name)}
          checked={skill.enabled}
          disabled={disabled}
          onCheckedChange={onToggle}
          size="xs"
        />
      </div>
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

  // 分类 rail：全部 + 已启用 + 各分类（中文，按数量降序）
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

  // 排序：已启用在前，再按使用次数降序，最后按中文名
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
      // 乐观更新：缓存先行，失败回滚（渲染层不假设成功）
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
        <div className="flex items-baseline gap-2 px-4 pb-1 pt-3">
          <h2 className="text-[1.05rem] font-bold text-(--ui-text-primary)">{heading}</h2>
          <span className="text-[0.75rem] text-(--ui-text-tertiary)">{ordered.length} 项</span>
        </div>
        {ordered.length === 0 ? (
          <p className="px-4 py-6 text-[0.8rem] text-(--ui-text-tertiary)">此分组暂无技能。</p>
        ) : (
          <div className="pb-4">
            {ordered.map(skill => (
              <SkillRowWithSwitch
                disabled={false}
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
// 外框：顶部大类栏（复刻 SettingsCategoryBar 视觉）+ 大类分发
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
        'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 bg-transparent px-3 text-sm font-medium transition-colors',
        active
          ? 'border-(--ui-text-primary) text-foreground'
          : 'border-transparent text-(--ui-text-tertiary) hover:text-foreground'
      )}
      data-tour={`hub-category-${label}`}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-foreground/80' : 'text-muted-foreground/80')} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  )
})

export function QijiCapabilitiesHub({
  activeCategory,
  onCategoryChange,
  skills,
  skillsPending,
  profile,
  onRefresh,
  marketEntry,
  fallbackContent
}: {
  activeCategory: HubCategory['id']
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
      <div className="shrink-0 px-1 pt-[calc(var(--titlebar-height)/2+0.375rem)]">
        <div
          className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-(--ui-sidebar-border) px-1"
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
        {activeCategory === 'skills' ? (
          skillsPending ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[0.85rem] text-(--ui-text-tertiary)">正在加载能力…</p>
            </div>
          ) : (
            <SkillsPane marketEntry={marketEntry} onRefresh={onRefresh} profile={profile} skills={skills} />
          )
        ) : (
          // qiji 0.20.4: 连接器/插件沿用旧 tab 组件，统一容器排版对齐新骨架
          //（页头留白 + 内容 inset，与技能大类视觉一致）。
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex min-h-0 flex-1 flex-col pt-2">{fallbackContent}</div>
          </div>
        )}
      </div>
    </div>
  )
}
