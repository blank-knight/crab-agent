import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { getSkillContent, type ProfileScope, profileScopeKey } from '@/hermes'
import { useI18n } from '@/i18n'
import type { SkillInfo } from '@/types/hermes'

import { parseFrontmatter } from './frontmatter'
import { skillDescZh, skillNameZh } from '../zh-display'

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
  // Only learned/local skills are the user's to rewrite or archive — bundled
  // and hub skills are managed by their sources.
  const editable = skill.provenance === 'agent'

  // The FULL skill — frontmatter metadata + complete SKILL.md body — for any
  // provenance, scoped to the Capabilities profile selector. The row list only
  // carries name/description; the pane shows the whole thing.
  const contentQuery = useQuery({
    queryKey: ['skill-content', skill.name, profileScopeKey(profile)],
    queryFn: () => getSkillContent(skill.name, profile),
    staleTime: 60_000
  })

  const parsed = useMemo(
    () => (contentQuery.data ? parseFrontmatter(contentQuery.data.content) : null),
    [contentQuery.data]
  )

  // qiji 0.20.4: 详情头加中文摘要（SKILL.md 原文是英文；有映射才显示，未收录不添乱）。
  const zhDesc = skillDescZh(skill.name, '')

  return (
    <>
      {zhDesc && (
        <div className="mb-3 rounded-md border border-(--ui-border) bg-(--ui-bg-secondary)/40 px-3 py-2">
          <p className="text-[0.82rem] font-semibold text-(--ui-text-primary)">{skillNameZh(skill.name, skill.name)}</p>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-(--ui-text-secondary)">{zhDesc}</p>
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-2">
          <Button onClick={onEdit} size="xs" variant="text">
            {t.skills.edit}
          </Button>
          <Button className="text-destructive hover:text-destructive" onClick={onArchive} size="xs" variant="text">
            {t.skills.archive}
          </Button>
        </div>
      )}
      {contentQuery.isLoading ? (
        <PageLoader className="h-40" label={t.skills.loading} />
      ) : parsed ? (
        <pre
          className="overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-[0.68rem] leading-relaxed text-(--ui-text-secondary)"
          data-selectable-text="true"
        >
          {parsed.body.trim() || t.skills.noDescription}
        </pre>
      ) : null}
    </>
  )
}
