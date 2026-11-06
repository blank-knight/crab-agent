import { SKILL_ZH } from '@/app/skills/translations'
import { translateNow } from '@/i18n'
import { firstStringField } from '@/lib/text'

import { parseMaybeObject, toolCallFailed } from './fallback-model/format'

interface SkillCall {
  args?: unknown
  completedAt?: number
  isError?: boolean
  result?: unknown
  toolName: string
}

/** Loading instructions is not the same action as reading a skill resource,
 * and neither proves the task described by the skill has been completed. */
export function skillActivityTitle(part: SkillCall, live = true): string | undefined {
  if (part.toolName !== 'skill_view' && part.toolName !== 'skills_list') {
    return undefined
  }

  const args = parseMaybeObject(part.args)
  const failed = toolCallFailed(part)
  const pending = live && part.result === undefined && part.completedAt === undefined
  const missing = !pending && part.result === undefined
  const file = firstStringField(args, ['file_path'])
  const name = firstStringField(args, ['name'])

  // qiji: 技能名中文化——活动卡片不再显示英文 slug（「已加载技能: pptx-maker」→
  // 「已加载技能: PPT 制作」）。文件路径不翻译。
  const zhName = (n: string | undefined): string | undefined => (n && SKILL_ZH[n]?.name ? SKILL_ZH[n].name : n)

  const target = [zhName(name), file].filter(Boolean).join(' → ')

  const keys =
    part.toolName === 'skills_list'
      ? { pending: 'listing', done: 'listed', failed: 'listFailed' }
      : file
        ? { pending: 'readingResource', done: 'readResource', failed: 'resourceFailed' }
        : { pending: 'loading', done: 'loaded', failed: 'loadFailed' }

  const key = failed ? keys.failed : missing ? 'unavailable' : pending ? keys.pending : keys.done
  const label = translateNow(`assistant.tool.skillActivity.${key}`)

  return target ? `${label}: ${target}` : label
}
