/**
 * qiji 0.20.5b: OPC 技能段「用户自定义智能体」组件。
 *
 * 方案A（10-12 拍板）：本地启动器条目，不真建技能包。
 * - 用户卡：kind 'skill' 预填 `/技能名`；'prompt' 预填提示词全文
 * - 尾卡「＋新增」：弹层表单（Dialog），建完立即出现在墙里
 * - 编辑/删除：卡上 hover 显示（与内置卡视觉同语法，右上角小按钮组）
 * - 存储：localStorage `qiji-user-agents`（user-agents.ts）
 *
 * crab 0.20.5k（10-15 三连修）：
 * ① 技能输入框 → 搜索选择器：getSkills() 拉全量已装技能，输入关键字
 *   即时过滤（名称/描述/分类），点选回填；不再要求用户背技能名。
 *   无结果时给「去技能广场安装」入口（/skills?tab=market）。
 * ② 提示词一键生成：requestOneShot(llm.oneshot) 按一句话用途生成
 *   结构化提示词，填进 target textarea（可再手改）。智能体与专家两处
 *   弹层共用 GenerateButton 组件（expert-dialog 共用件，见 create-expert.tsx）。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { getSkills } from '@/api/skills'
import { translateSkillField } from '@/app/skills/translations'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { isZhLocale } from '@/i18n'
import { requestOneShot } from '@/lib/oneshot'
import { cn } from '@/lib/utils'

import {
  addUserAgent,
  loadUserAgents,
  removeUserAgent,
  updateUserAgent,
  type UserAgent,
  type UserAgentKind
} from './user-agents'

// ── 技能搜索选择器 ──────────────────────────────────────────

interface SkillOption {
  name: string
  description: string
  category: string
}

/** 拉全量已装技能（带 5 分钟缓存，与主页空态检测同策略）。失败返回 []。 */
async function fetchSkillOptions(): Promise<SkillOption[]> {
  try {
    const skills = await getSkills()

    return (skills || [])
      .filter(sk => sk && typeof sk.name === 'string' && sk.name.length > 0)
      .map(sk => ({
        name: sk.name,
        description: typeof sk.description === 'string' ? sk.description : '',
        category: typeof sk.category === 'string' ? sk.category : 'general'
      }))
  } catch {
    return []
  }
}

/** 关键字过滤：名称/描述/分类 全字段不区分大小写。 */
function filterSkills(list: SkillOption[], q: string): SkillOption[] {
  const query = q.trim().toLowerCase()

  if (!query) {return list}

  return list.filter(
    sk =>
      sk.name.toLowerCase().includes(query) ||
      sk.description.toLowerCase().includes(query) ||
      sk.category.toLowerCase().includes(query)
  )
}

/** 技能名选择器：输入框 + 下拉候选。选中即回填 form.target。 */
function SkillPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [all, setAll] = useState<SkillOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    void fetchSkillOptions().then(list => {
      if (alive) {
        setAll(list)
        setLoaded(true)
      }
    })

    return () => {
      alive = false
    }
  }, [])

  // 点外面收起下拉
  useEffect(() => {
    if (!open) {return undefined}

    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDown)

    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const candidates = useMemo(() => filterSkills(all, query), [all, query])
  const zh = isZhLocale()

  const pick = (sk: SkillOption) => {
    onChange(sk.name)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative flex flex-col gap-1" ref={boxRef}>
      <input
        autoComplete="off"
        className="w-full rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg) px-2.5 py-1.5 text-[0.85rem] text-(--ui-text-primary) outline-none transition-colors focus:border-(--ui-primary)/60"
        onChange={e => {
          // 输入即搜索：query 只驱动过滤，不直接改 form.target——
          // 用户可能只是想过滤看看，点选才落定技能名。
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || candidates.length === 0) {return}

          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlight(h => (h + 1) % candidates.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight(h => (h - 1 + candidates.length) % candidates.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(candidates[highlight] ?? candidates[0])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder={loaded ? '输入关键字搜索已装技能，点选技能' : '正在加载技能清单…'}
        value={query || value}
      />
      {open ? (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-card) shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          {!loaded ? (
            <p className="px-3 py-2.5 text-[0.78rem] text-(--ui-text-tertiary)">正在加载技能清单…</p>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col gap-1.5 px-3 py-2.5">
              <p className="text-[0.78rem] text-(--ui-text-tertiary)">没有匹配的已装技能</p>
              <button
                className="self-start rounded-md border border-(--ui-primary)/50 px-2 py-1 text-[0.75rem] font-medium text-(--ui-primary) transition-colors hover:bg-(--ui-primary)/10"
                onClick={() => {
                  setOpen(false)
                  navigate('/skills?tab=market')
                }}
                type="button"
              >
                去技能广场安装 →
              </button>
            </div>
          ) : (
            candidates.map((sk, i) => {
              const nameZh = zh ? translateSkillField(sk.name, 'name', sk.name) : sk.name
              const descZh = zh ? translateSkillField(sk.name, 'description', sk.description) : sk.description

              return (
                <button
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-(--ui-stroke-tertiary)/40 px-3 py-2 text-left last:border-b-0 transition-colors',
                    i === highlight ? 'bg-(--ui-primary)/10' : 'hover:bg-(--ui-muted)'
                  )}
                  key={sk.name}
                  onClick={() => pick(sk)}
                  onMouseEnter={() => setHighlight(i)}
                  type="button"
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-[0.82rem] font-semibold text-(--ui-text-primary)">{nameZh}</span>
                    <span className="shrink-0 rounded-sm bg-(--ui-muted) px-1 text-[0.66rem] text-(--ui-text-tertiary)">{sk.name}</span>
                  </span>
                  {descZh ? (
                    <span className="line-clamp-1 text-[0.72rem] text-(--ui-text-tertiary)">{descZh}</span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── 提示词一键生成 ──────────────────────────────────────────

/** 生成提示词的 one-shot 指令（结构化、可直接用）。 */
function buildPromptGenInstructions(hint: string): string {
  const clean = hint.trim().slice(0, 200)

  return [
    '你是提示词工程师。根据用户给出的一句话用途，写一段可直接使用的中文提示词。',
    '要求：',
    '1. 以「你是…」开头定义角色（身份+专长）；',
    '2. 3-6 条工作方式/输出要求（每条一行，用破折号或编号）；',
    '3. 语言简洁具体，不写空话（如“认真负责”）；',
    '4. 只输出提示词正文，不要任何解释、标题或代码块标记；',
    `5. 全文控制在 200 字以内。用户用途：${clean}`
  ].join('\n')
}

interface GenerateButtonProps {
  /** 收集生成依据的输入框当前值（如用途描述/标题）。 */
  hint: string
  /** 生成完成回填目标。 */
  onGenerated: (text: string) => void
  /** 按钮文案（两处弹层措辞不同）。 */
  label?: string
}

/** 「AI 生成」按钮：llm.oneshot 单次调用，不进会话、不碰缓存。 */
export function GeneratePromptButton({ hint, onGenerated, label = 'AI 生成' }: GenerateButtonProps) {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (busy) {return}
    setBusy(true)

    try {
      const text = await requestOneShot({
        instructions: buildPromptGenInstructions(hint || '通用智能助手'),
        // 走配置的辅助模型（title/摘要同款通道），与会话模型解耦。
        sessionId: null,
        temperature: 0.7
      })

      onGenerated(text.trim())
    } catch {
      // 静默降级：老后端/网关断开时按钮只闪一下，不打断填写。
      // 提示词手写路径完全不受影响。
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className="flex items-center gap-1 rounded-md border border-(--ui-primary)/50 px-2 py-1 text-[0.72rem] font-medium text-(--ui-primary) transition-colors hover:bg-(--ui-primary)/10 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={busy}
      onClick={() => void run()}
      type="button"
    >
      <Codicon className={cn(busy && 'animate-spin')} name={busy ? 'loading' : 'sparkle'} size="0.8rem" />
      {busy ? '生成中…' : label}
    </button>
  )
}

// ── 表单弹层 ────────────────────────────────────────────────

interface FormState {
  title: string
  desc: string
  kind: UserAgentKind
  target: string
}

const EMPTY_FORM: FormState = { title: '', desc: '', kind: 'skill', target: '' }

/** 新建/编辑弹层。editing 非空 = 编辑现有卡。 */
export function UserAgentDialog({
  editing,
  onClose,
  onSaved
}: {
  editing: UserAgent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    setForm(
      editing
        ? { title: editing.title, desc: editing.desc, kind: editing.kind, target: editing.target }
        : EMPTY_FORM
    )
  }, [editing])

  const valid = form.title.trim().length > 0 && form.target.trim().length > 0

  const submit = () => {
    if (!valid) {return}

    if (editing) {
      updateUserAgent(editing.id, {
        title: form.title.trim(),
        desc: form.desc.trim(),
        kind: form.kind,
        target: form.target.trim()
      })
    } else {
      addUserAgent({
        title: form.title.trim(),
        desc: form.desc.trim(),
        kind: form.kind,
        target: form.target.trim()
      })
    }

    onSaved()
    onClose()
  }

  const inputCls =
    'w-full rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg) px-2.5 py-1.5 text-[0.85rem] text-(--ui-text-primary) outline-none transition-colors focus:border-(--ui-primary)/60'

  return (
    <Dialog onOpenChange={open => !open && onClose()} open={true}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑智能体' : '新增智能体'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <label className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">名称（必填）</span>
            <input
              className={inputCls}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="如：周报生成器"
              value={form.title}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">一句话描述</span>
            <input
              className={inputCls}
              onChange={e => setForm({ ...form, desc: e.target.value })}
              placeholder="如：把本周 git 提交整理成周报"
              value={form.desc}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">类型</span>
            <div className="flex gap-1.5">
              {(
                [
                  ['skill', '调用已装技能'],
                  ['prompt', '提示词模板']
                ] as [UserAgentKind, string][]
              ).map(([kind, label]) => (
                <button
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[0.78rem] transition-colors',
                    form.kind === kind
                      ? 'border-(--ui-primary)/60 bg-(--ui-primary)/10 font-semibold text-(--ui-text-primary)'
                      : 'border-(--ui-stroke-tertiary) text-(--ui-text-secondary) hover:border-(--ui-primary)/40'
                  )}
                  key={kind}
                  onClick={() => setForm({ ...form, kind })}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">
              {form.kind === 'skill' ? '选择技能（点击卡片即预填 /技能名）' : '提示词（点击后预填到输入框）'}
            </span>
            {form.kind === 'skill' ? (
              <SkillPicker onChange={v => setForm({ ...form, target: v })} value={form.target} />
            ) : (
              <div className="flex flex-col gap-1.5">
                <textarea
                  className={cn(inputCls, 'min-h-24 resize-y')}
                  onChange={e => setForm({ ...form, target: e.target.value })}
                  placeholder="如：帮我总结这份文档的要点，分三部分输出…"
                  value={form.target}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[0.7rem] text-(--ui-text-quaternary)">
                    不会写？填好上面的一句话描述，点右侧按钮让 AI 代写
                  </span>
                  <GeneratePromptButton hint={form.desc || form.title} onGenerated={text => setForm({ ...form, target: text })} />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <button
            className="rounded-md px-3 py-1.5 text-[0.82rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-muted)"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className={cn(
              'rounded-md px-3 py-1.5 text-[0.82rem] font-semibold transition-colors',
              valid
                ? 'bg-(--ui-primary) text-(--ui-primary-foreground) hover:opacity-90'
                : 'cursor-not-allowed bg-(--ui-muted) text-(--ui-text-tertiary)'
            )}
            disabled={!valid}
            onClick={submit}
            type="button"
          >
            {editing ? '保存' : '添加'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 用户卡 ──────────────────────────────────────────────────

export function UserAgentCard({
  agent,
  onEdit,
  onLaunch
}: {
  agent: UserAgent
  onEdit: (a: UserAgent) => void
  onLaunch: (a: UserAgent) => void
}) {
  return (
    <div
      className="group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--ui-card) p-5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-(--ui-primary)/40 hover:shadow-[0_6px_20px_color-mix(in_srgb,var(--ui-primary)_14%,transparent)]"
      data-tour={`opc-user-agent-${agent.id}`}
      onClick={() => onLaunch(agent)}
    >
      {/* hover 编辑/删除（阻止冒泡，不吃卡片点击） */}
      <span className="absolute right-2.5 top-2.5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          aria-label="编辑"
          className="flex size-6 items-center justify-center rounded-md bg-(--ui-muted) text-(--ui-text-secondary) transition-colors hover:text-(--ui-text-primary)"
          onClick={e => {
            e.stopPropagation()
            onEdit(agent)
          }}
          type="button"
        >
          <Codicon name="edit" size="0.8rem" />
        </button>
        <button
          aria-label="删除"
          className="flex size-6 items-center justify-center rounded-md bg-(--ui-muted) text-(--ui-text-secondary) transition-colors hover:text-red-500"
          onClick={e => {
            e.stopPropagation()
            removeUserAgent(agent.id)
            window.dispatchEvent(new CustomEvent('qiji:user-agents-changed'))
          }}
          type="button"
        >
          <Codicon name="trash" size="0.8rem" />
        </button>
      </span>

      {/* 头部：图标圆片 + 标题（与 OpcAgentCard 同视觉语法） */}
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[1.05rem] font-bold text-white"
          style={{ background: `hsl(${agent.hue} 52% 52%)` }}
        >
          <Codicon aria-hidden="true" name={agent.kind === 'prompt' ? 'sparkle' : 'tools'} size="1.15rem" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.95rem] font-bold text-(--ui-text-primary)">{agent.title}</span>
          <span className="block truncate text-[0.75rem] text-(--ui-text-tertiary)">
            {agent.desc || (agent.kind === 'skill' ? `调用技能 ${agent.target}` : '提示词模板')}
          </span>
        </span>
      </div>

      {/* 中部：指向预览 */}
      <p className="line-clamp-2 text-[0.8rem] leading-relaxed text-(--ui-text-secondary)">
        <span className="mr-1.5 font-bold text-(--ui-primary)">{agent.kind === 'skill' ? '调用' : '预填'}</span>
        {agent.kind === 'skill' ? `/${agent.target}` : agent.target}
      </p>

      {/* 底部行动条 */}
      <span className="mt-auto flex items-center gap-1.5 text-[0.8rem] font-semibold text-(--ui-primary)">
        立即使用
        <Codicon
          aria-hidden="true"
          className="transition-transform duration-150 group-hover:translate-x-0.5"
          name="chevron-right"
          size="0.85rem"
        />
      </span>
    </div>
  )
}

// ── 尾卡（＋新增） ──────────────────────────────────────────

export function AddAgentCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--ui-stroke-tertiary) bg-transparent text-(--ui-text-tertiary) transition-all duration-150 hover:border-(--ui-primary)/50 hover:text-(--ui-primary)"
      onClick={onClick}
      type="button"
    >
      <Codicon name="plus" size="1.4rem" />
      <span className="text-[0.85rem] font-medium">新增智能体</span>
    </button>
  )
}

// ── 列表 hook（跨组件共享同一份 localStorage 状态） ─────────

export function useUserAgents(): UserAgent[] {
  const [list, setList] = useState<UserAgent[]>(() => loadUserAgents())

  useEffect(() => {
    const sync = () => setList(loadUserAgents())
    window.addEventListener('qiji:user-agents-changed', sync)
    window.addEventListener('storage', sync)

    return () => {
      window.removeEventListener('qiji:user-agents-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return list
}

export function notifyUserAgentsChanged(): void {
  window.dispatchEvent(new CustomEvent('qiji:user-agents-changed'))
}
