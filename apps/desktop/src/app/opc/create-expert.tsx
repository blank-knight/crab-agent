/**
 * qiji 0.20.5b: OPC 专家段「＋新建专家」表单。
 *
 * 链路：createProfile（POST /api/profiles，id 规则 ^[a-z0-9][a-z0-9_-]{0,63}$ 不支持中文）
 *   → saveBotMeta(name, { title: 中文名, description: 人设 })
 *     （profiles.configure ui_meta['hermes-bots']，服务端 profile.yaml 持久化+跨机同步；
 *      displayName 优先级链 title > display_name > name，Bots 面板同款）
 *   → roster 5s 轮询自动出现（无需手动 invalidate；关闭表单即触达）
 *
 * 拍板（10-12）：方案「profile id 自动生成，中文名走 title」——用户只填显示名/人设，
 * 不感知底层 id。id 由「p + 毫秒时间戳」生成，撞名（<1s 内重复提交）时重试。
 */

import { useState } from 'react'

import { createProfile } from '@/api/profiles'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { GeneratePromptButton } from './user-agent-cards'
import { saveBotMeta } from '../../plugins/hermes-bots/data'

/** profile id：合法字符集内且几乎不撞名（同秒重复提交由调用方串行化）。 */
function generateProfileId(): string {
  return `p${Date.now().toString(36)}`
}

export function CreateExpertDialog({ onClose }: { onClose: (created: boolean) => void }) {
  const [title, setTitle] = useState('')
  const [persona, setPersona] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = title.trim().length > 0

  const submit = async () => {
    if (!valid || busy) {return}
    setBusy(true)
    setError(null)
    try {
      // 1) 建 profile（id 自动生成；后端 normalize 为小写，字符集内必合法）
      const name = generateProfileId()
      await createProfile({ name })
      // 2) 写专家身份（中文名+人设）——服务端 profile.yaml，跨机同步
      await saveBotMeta(name, {
        title: title.trim(),
        description: persona.trim() || undefined
      })
      // roster 5s 轮询会自动带出新专家；无需手动失效
      onClose(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg) px-2.5 py-1.5 text-[0.85rem] text-(--ui-text-primary) outline-none transition-colors focus:border-(--ui-primary)/60'

  return (
    <Dialog onOpenChange={open => !open && !busy && onClose(false)} open={true}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建专家</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <label className="flex flex-col gap-1">
            <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">专家名字（必填）</span>
            <input
              className={inputCls}
              onChange={e => setTitle(e.target.value)}
              placeholder="如：增长顾问"
              value={title}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between">
              <span className="text-[0.78rem] font-medium text-(--ui-text-secondary)">人设（它擅长什么、说话风格…）</span>
              <GeneratePromptButton
                hint={title || persona}
                label="AI 生成人设"
                onGenerated={text => setPersona(text)}
              />
            </span>
            <textarea
              className={cn(inputCls, 'min-h-28 resize-y')}
              onChange={e => setPersona(e.target.value)}
              placeholder={'如：你是一位资深增长顾问，擅长拆解获客漏斗。回答先给结论，再给依据，语气直接。'}
              value={persona}
            />
            <span className="text-[0.7rem] text-(--ui-text-quaternary)">
              不会写？填好专家名字（如「增长顾问」），点「AI 生成人设」让 AI 代写
            </span>
          </label>
          <p className="text-[0.72rem] leading-relaxed text-(--ui-text-tertiary)">
            专家是独立的 AI 档案：有自己的记忆和对话历史，创建后出现在下方列表，点击即可开始对话。
          </p>
          {error ? (
            <p className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-[0.78rem] text-red-500">创建失败：{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <button
            className="rounded-md px-3 py-1.5 text-[0.82rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-muted)"
            disabled={busy}
            onClick={() => onClose(false)}
            type="button"
          >
            取消
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.82rem] font-semibold transition-colors',
              valid && !busy
                ? 'bg-(--ui-primary) text-(--ui-primary-foreground) hover:opacity-90'
                : 'cursor-not-allowed bg-(--ui-muted) text-(--ui-text-tertiary)'
            )}
            disabled={!valid || busy}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? <Codicon className="animate-spin" name="loading" size="0.85rem" /> : null}
            {busy ? '创建中…' : '创建专家'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
