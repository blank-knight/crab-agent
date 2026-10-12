/**
 * qiji 0.20.5b: OPC 技能段「用户自定义智能体」组件。
 *
 * 方案A（10-12 拍板）：本地启动器条目，不真建技能包。
 * - 用户卡：kind 'skill' 预填 `/技能名`；'prompt' 预填提示词全文
 * - 尾卡「＋新增」：弹层表单（Dialog），建完立即出现在墙里
 * - 编辑/删除：卡上 hover 显示（与内置卡视觉同语法，右上角小按钮组）
 * - 存储：localStorage `qiji-user-agents`（user-agents.ts）
 */

import { useEffect, useState } from 'react'

import {
  addUserAgent,
  loadUserAgents,
  removeUserAgent,
  updateUserAgent,
  type UserAgent,
  type UserAgentKind
} from './user-agents'

import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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
          <label className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">
              {form.kind === 'skill' ? '技能名（点击后预填 /技能名）' : '提示词（点击后预填到输入框）'}
            </span>
            {form.kind === 'skill' ? (
              <input
                className={inputCls}
                onChange={e => setForm({ ...form, target: e.target.value })}
                placeholder="如：pptx-maker（技能与工具页可查技能名）"
                value={form.target}
              />
            ) : (
              <textarea
                className={cn(inputCls, 'min-h-24 resize-y')}
                onChange={e => setForm({ ...form, target: e.target.value })}
                placeholder="如：帮我总结这份文档的要点，分三部分输出…"
                value={form.target}
              />
            )}
          </label>
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
