import { SLASH_COMMAND_RE } from '@hermes/shared'

import { SKILL_ZH } from '@/app/skills/translations'

/** Matches `agent/title_generator.py`'s MAX_DERIVED_TITLE_CHARS, so a draft
 *  doesn't visibly reflow the moment the backend's derived title replaces it. */
const MAX_DRAFT_TITLE_CHARS = 48

/** qiji 0.20.5h: 裸斜杠命令的本地化技能名——「/img-toolkit」→「图片处理」；
 *  不是技能（未收录翻译表）返回空串，回落「新会话」占位符（上游行为）。 */
function skillNameOrEmpty(line: string): string {
  const m = /^\/([a-z0-9][\w-]*)$/i.exec(line)

  if (!m) {
    return ''
  }

  return SKILL_ZH[m[1]]?.name ?? ''
}

/**
 * Name a draft after what the user has typed into it.
 *
 * The client-side twin of the backend's `derive_title`: first meaningful line,
 * whitespace collapsed, cut on a word boundary. It runs before any session
 * exists, so it can't reach the real titler — a draft has no persisted row and
 * no opening message yet, which is exactly what `apply_instant_title` needs.
 *
 * Empty when there's nothing worth naming, so the caller keeps "New session"
 * rather than showing a title that says less than the placeholder.
 */
export function deriveDraftTitle(text: string): string {
  const line =
    text
      .split('\n')
      .find(candidate => candidate.trim())
      ?.trim() ?? ''

  if (!line) {
    return ''
  }

  // A bare `/skin` names the draft after the command rather than the work, the
  // failure the backend titler summarizes away. Title from the argument instead;
  // with no argument there is no intent yet, so the placeholder stands.
  const body = (SLASH_COMMAND_RE.test(line) ? line.replace(/^\/\S+\s*/, '') : line).split(/\s+/).join(' ')

  // qiji 0.20.5h: 裸斜杠命令（无参数）——上游行为是空标题回落占位符「新会话」；
  // 但用户敲了 /img-toolkit 再停下等选项时，侧栏之前镜像输入框原文显示
  // 「/img-toolkit」（装机反馈）。裸命令给出本地化技能名，认得出是什么技能。
  if (!body) {
    return skillNameOrEmpty(line)
  }

  // 带参数的：参数就是意图，前缀剥掉（与上游一致），不再保留 /命令名——
  // 参数本身足够命名（「/img-toolkit 压缩这批图」→「压缩这批图」）。
  if (body.length <= MAX_DRAFT_TITLE_CHARS) {
    return body
  }

  // Cut on a word boundary, unless that would throw away more than half of it.
  const cut = body.slice(0, MAX_DRAFT_TITLE_CHARS)
  const space = cut.lastIndexOf(' ')
  const kept = space > MAX_DRAFT_TITLE_CHARS / 2 ? cut.slice(0, space) : cut

  return `${kept.replace(/[\s,.;:—-]+$/, '')}…`
}
