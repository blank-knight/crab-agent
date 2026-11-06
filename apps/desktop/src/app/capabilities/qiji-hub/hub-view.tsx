// qiji 0.20.4: 「技能与工具」自研页 — 视觉 v2（design-preview 设计语言落地）。
//
// 设计语言 = 珊瑚螃蟹（暖黑窄栏 + 大圆角卡片 + 软阴影 + 悬浮上浮）。
// 全部颜色走主题 token（coral 皮肤下即预览稿效果，其他皮肤自动适配）。
// 数据钩子/开关写入/翻译层不变（v1 已验证），只换视图层。
//
// 上游同步注意：qiji 隔离区组件；接线点在 capabilities/index.tsx 的 qiji 标记块。
import { memo, useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { type ProfileScope, setSkillEnabled } from '@/hermes'
import { useLaunchIntoFreshChat } from '@/hooks/use-launch-into-fresh-chat'
import { useI18n } from '@/i18n'
import type { IconComponent } from '@/lib/icons'
import { queryClient } from '@/lib/query-client'
import { invalidateSlashCompletions } from '@/lib/slash-completion-cache'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { pinNewChatProfile } from '@/store/profile'
import type { SkillInfo } from '@/types/hermes'

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

  for (const ch of id) {
    h = (h * 31 + ch.charCodeAt(0)) % 360
  }

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
  const { t } = useI18n()
  const launchIntoFreshChat = useLaunchIntoFreshChat()
  const zhName = skillNameZh(skill.name, skill.name)
  const zhDesc = skillDescZh(skill.name, skill.description || '')

  // crab 0.20.5s-r10 (10-28 用户拍板): 卡片去展开——展开区(详情+使用按钮)砍掉,
  // 「使用」固定在右下角,所有卡等高对齐(r9 的 items-start 后自然高度仍参差,
  // 用户嫌乱)。使用语义不变:点击=回聊天直发(与三入口语义表一致)。
  const onUse = () => {
    // 与 SkillFullBody.onUse 同链路(0.20.5q 闩锁队列,点了就算用)。
    // crab 0.20.5v-w: 先建会话再直跳(OPC 卡 r4 同款时序)——旧 navigate('/')
    // 先渲染空态主页,session.create 往返期间「新建会话」整页可见=两段式
    // 闪屏(2026-11-03 用户报障)。失败自动回退旧行为。
    pinNewChatProfile('default')
    void launchIntoFreshChat(`/${skill.name} `, zhName)
  }

  return (
    <div
      className={cn(
        'group flex flex-col rounded-2xl border border-(--ui-border)/70 bg-(--ui-card) p-4 transition-all duration-200',
        'shadow-[0_2px_12px_rgba(45,36,32,0.05)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(45,36,32,0.10)]',
        skill.enabled && 'border-(--ui-primary)/25'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <p className="truncate text-[0.95rem] font-bold text-(--ui-text-primary)">{zhName}</p>
            {usageOf(skill) > 0 && (
              <span className="shrink-0 rounded-full bg-(--ui-muted) px-1.5 py-0.5 text-[0.64rem] font-medium text-(--ui-text-tertiary)">
                已用 {usageOf(skill)} 次
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[0.76rem] leading-relaxed text-(--ui-text-tertiary)">{zhDesc}</p>
        </div>
        <Switch aria-label={zhName} checked={skill.enabled} onCheckedChange={onToggle} size="xs" />
      </div>
      <div className="mt-3 flex items-center justify-end border-t border-(--ui-border)/50 pt-2.5">
        <Button className="h-7 rounded-lg px-3 text-[0.74rem]" onClick={onUse} size="sm" type="button">
          {t.skills.useSkill}
        </Button>
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
  marketEntry,
  query = ''
}: {
  profile: ProfileScope
  skills: SkillInfo[]
  onRefresh: () => void
  marketEntry?: React.ReactNode
  /** qiji 0.20.5f: 顶部搜索词——hub 骨架此前不接收，搜索框是装饰品（装机实测失效） */
  query?: string
}) {
  const { t } = useI18n()
  const [activeCategory, setActiveCategory] = useState('__all')

  // qiji 0.20.5f: 搜索先于分类过滤——技能名(中/英)/描述/别名 匹配。
  // normalize 剥音标，中文原文直比；空串不过滤。
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) {
      return skills
    }

    return skills.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        skillNameZh(s.name, s.name).toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        skillDescZh(s.name, s.description || '')
          .toLowerCase()
          .includes(q)
    )
  }, [skills, query])

  const entries = useMemo(() => {
    const byCategory = new Map<string, number>()

    for (const skill of searched) {
      const cat = skill.category || 'general'
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1)
    }

    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

    return [
      { id: '__all', label: '全部', count: searched.length },
      { id: '__enabled', label: '已启用', count: searched.filter(s => s.enabled).length },
      ...sorted.map(([cat, count]) => ({ id: cat, label: categoryZh(cat), count }))
    ]
  }, [searched])

  const visible = useMemo(() => {
    if (activeCategory === '__all') {
      return searched
    }

    if (activeCategory === '__enabled') {
      return searched.filter(s => s.enabled)
    }

    return searched.filter(s => (s.category || 'general') === activeCategory)
  }, [searched, activeCategory])

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
          // crab 0.20.5s-r9: items-start——grid 默认 stretch 把同行卡拉等高,展开卡
          // 282px 时右侧未展开卡被拉到 282px 底部 172px 空白,用户看成"也跟着打开
          // 了但一片空白"(10-28 报)。items-start=各卡自然高度,展开只撑自己。
          <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] items-start gap-2.5 px-5 pb-5">
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
  fallbackContent,
  query = ''
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
  /** qiji 0.20.5f: 顶部搜索词（skills 分支过滤用） */
  query?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className="shrink-0 px-4 pt-[calc(var(--titlebar-height)/2+0.375rem)]">
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto pb-1" data-tour="hub-categories">
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
            <SkillsPane
              marketEntry={marketEntry}
              onRefresh={onRefresh}
              profile={profile}
              query={query}
              skills={skills}
            />
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
