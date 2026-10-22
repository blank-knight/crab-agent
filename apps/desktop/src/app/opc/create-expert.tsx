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

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { refreshAccountLockExceptions } from '@/store/profile'

import { saveBotMeta } from '../../plugins/hermes-bots/data'
import { composeSoul } from '../../plugins/hermes-bots/soul'

import { GeneratePromptButton } from './user-agent-cards'

/** profile id：合法字符集内且几乎不撞名（同秒重复提交由调用方串行化）。 */
function generateProfileId(): string {
  return `p${Date.now().toString(36)}`
}

export function CreateExpertDialog({ onClose }: { onClose: (created: boolean) => void }) {
  const { requestGateway } = useGatewayRequest()
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
      // 1) 建 profile（id 自动生成）+ 人设直达后端。crab 0.20.5k 修正：
      //    人设必须随 profiles.create 落到 description + SOUL.md
      //    （composeSoul，与上游 Bots 面板创建流同链路）——后端读
      //    SOUL.md 塑造人格。首版只写 ui_meta（saveBotMeta），后端完全
      //    不知道人设，专家开口还是 Hermes/Nous Research 默认自我介绍
      //    （装机实锤）。走 JSON-RPC（REST /api/profiles 的 payload
      //    类型不带 soul/description）。
      const name = generateProfileId()
      const personaText = persona.trim() || undefined
      await requestGateway('profiles.create', {
        name,
        description: personaText,
        soul: composeSoul({
          name,
          title: title.trim(),
          description: personaText
        })
      })
      // 2) 写专家身份（中文名）——服务端 profile.yaml ui_meta，跨机同步
      await saveBotMeta(name, {
        title: title.trim(),
        description: personaText
      })
      // 3) crab 0.20.5o-r2：立即刷账号锁豁免集——豁免集只在启动/登录刷
      //    （use-gateway-boot/login-overlay），新建的专家档不进集则拉取侧
      //    accountLockedScopeFor 把他的会话收敛回锁定档（default），侧栏
      //    专家分组看不到他、发消息也落错档。等 5s roster 轮询太慢且
      //    豁免集根本不跟 roster 走，创建落定即补一发。
      void refreshAccountLockExceptions()
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
