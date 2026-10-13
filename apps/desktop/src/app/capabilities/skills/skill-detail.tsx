import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'

import { NEW_CHAT_ROUTE } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { getSkillContent, type ProfileScope, profileScopeKey } from '@/hermes'
import { useI18n } from '@/i18n'
import { queueSkillInsert } from '@/store/composer'
import type { SkillInfo } from '@/types/hermes'

import { skillDescZh, skillNameZh } from '../zh-display'

import { parseFrontmatter } from './frontmatter'

export function SkillDetail({
  onArchive,
  onEdit,
  profile,
  skill
}: {
  onArchive: () => void
  onEdit: () => void
  profile?: ProfileScope
  skill: SkillInfo
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  // Only learned/local skills are the user's to rewrite or archive — bundled
  // and hub skills are managed by their sources.
  const editable = skill.provenance === 'agent'

  // qiji 0.20.5e: SKILL.md 原文是英文（面向模型的操作手册），给中文用户看
  // 只有困惑（0.20.5d 装机反馈：元宝详情整版英文）。详情面板不再展示原文，
  // 只保留中文摘要 + 版本/参数元数据；模型仍按需完整读取，不影响功能。
  const contentQuery = useQuery({
    queryKey: ['skill-content', skill.name, profileScopeKey(profile)],
    queryFn: () => getSkillContent(skill.name, profile),
    staleTime: 60_000
  })

  const parsed = useMemo(() => {
    if (!contentQuery.data) {return null}
    const { body, meta } = parseFrontmatter(contentQuery.data.content)
    const fm = Object.fromEntries(meta) as Record<string, string>

    return { body, version: fm.version ?? '', description: fm.description ?? '' }
  }, [contentQuery.data])

  // qiji 0.20.4: 详情头加中文摘要（SKILL.md 原文是英文；有映射才显示，未收录不添乱）。
  const zhDesc = skillDescZh(skill.name, '')
  const zhName = skillNameZh(skill.name, skill.name)

  // qiji 0.20.5e: 「使用」按钮——技能不是配置项，是能力入口。点击 = 回聊天页
  // 预填 /技能名 （与主页快捷技能卡、OPC 卡同一 queueSkillInsert 闩锁队列协议，
  // 不依赖 URL、不怕 composer 重挂载）。用户补一句需求发送即可调用。
  const onUse = () => {
    navigate(NEW_CHAT_ROUTE)
    queueSkillInsert({ command: `/${skill.name} `, label: zhName, autoSend: false })
  }

  return (
    <>
      <div className="mb-3 rounded-md border border-(--ui-border) bg-(--ui-bg-secondary)/40 px-3 py-2">
        <p className="text-[0.82rem] font-semibold text-(--ui-text-primary)">{zhName}</p>
        <p className="mt-0.5 text-[0.72rem] leading-relaxed text-(--ui-text-secondary)">
          {zhDesc || parsed?.description || t.skills.noDescription}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onUse} size="xs" variant="secondary">
          {t.skills.useSkill}
        </Button>
        {editable && (
          <>
            <Button onClick={onEdit} size="xs" variant="text">
              {t.skills.edit}
            </Button>
            <Button className="text-destructive hover:text-destructive" onClick={onArchive} size="xs" variant="text">
              {t.skills.archive}
            </Button>
          </>
        )}
      </div>
      {parsed ? (
        <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.72rem]">
          {parsed.version ? (
            <div className="contents">
              <dt className="whitespace-nowrap text-(--ui-text-tertiary)">版本</dt>
              <dd className="m-0 break-words text-(--ui-text-secondary)">{parsed.version}</dd>
            </div>
          ) : null}
          <div className="contents">
            <dt className="whitespace-nowrap text-(--ui-text-tertiary)">技能名</dt>
            <dd className="m-0 break-words font-mono text-(--ui-text-secondary)">{skill.name}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-[0.72rem] text-(--ui-text-tertiary)">
        在聊天输入框输入 /{skill.name} 加你的需求即可调用；回答语言跟随你的提问语言。
      </p>
    </>
  )
}
