import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { Sparkles } from '@/lib/icons'
import { queryClient } from '@/lib/query-client'
import { invalidateSlashCompletions } from '@/lib/slash-completion-cache'
import { useStoreSelector } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { $gateway } from '@/store/gateway'
import { OFFICIAL_SKILLS_KEY } from '@/store/hub-actions'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PAGE_INSET_X } from '../layout-constants'
import { PanelEmpty } from '../overlays/panel'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'
import { MarketPanel } from '../skills/market-panel'

import { prefetchCatalogWhenIdle } from './catalog/catalog-data'
import { ConnectorsTab } from './connectors/connectors-tab'
import { PluginsTab } from './plugins/plugins-tab'
import type { HubCategory } from './qiji-hub/categories'
// qiji 0.20.4: 自研「技能与工具」页（设置页同款两级导航）。旧 tab 视图保留可回退。
import { QijiCapabilitiesHub } from './qiji-hub/hub-view'
import { CapabilityScopeSelector, useCapabilityScope } from './scope-selector'
import { SKILLS_QUERY_KEY, skillSearchTerms, useSkillsQuery } from './skills/skills-data'
import { SkillsTab } from './skills/skills-tab'
import { refreshToolCalls } from './toolsets/tool-calls'
import { TOOLSETS_QUERY_KEY, toolsetSearchTerms, useToolsetsQuery } from './toolsets/toolsets-data'
import { ToolsetsTab } from './toolsets/toolsets-tab'

// Skills Hub browsing lives inside the Skills tab. Legacy `?tab=hub`
// links fall back to 'skills' via useRouteEnumParam.
const CAPABILITY_MODES = ['skills', 'toolsets', 'connectors', 'plugins', 'market'] as const

// qiji 0.20.4: 自研骨架大类（market 不占大类，旧深链 market → skills 兜底渲染 MarketPanel）
const HUB_MODE_OF: Record<CapabilityMode, HubCategory['id']> = {
  skills: 'skills',
  toolsets: 'toolsets',
  connectors: 'connectors',
  plugins: 'plugins',
  market: 'skills'
}

type CapabilityMode = (typeof CAPABILITY_MODES)[number]

interface CapabilitiesViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
  /** Embedded mode (plugin dialogs — e.g. Bot Mode's Advanced section): tab
   *  state lives in local React state instead of the route's `?tab=` param,
   *  so an embedding dialog never fights the page router. */
  embedded?: boolean
  /** Pin the WHOLE view to one profile: the scope selector is hidden and
   *  every tab reads/writes THAT profile. This is the plugin door — Bot Mode
   *  renders the real Capabilities surface pinned to a bot. */
  fixedProfile?: string
  /** Pin the view to a REGISTERED gateway connection alongside `fixedProfile`:
   *  every read/write routes to that machine's backend instead of the active
   *  gateway. `''`/`'local'` mean the local pool. This is Bot Mode's
   *  remote-target door — a bot living on another registered gateway gets the
   *  live surface pointed at ITS backend. Ignored without `fixedProfile`. */
  fixedConnection?: string
}

/** The Capabilities page SHELL: tab selection, the search header, the profile /
 *  connection scope, the refresh hotkey, and the dispatch to one tab component
 *  per tab. Each tab owns its list, detail pane and writes; the two installed
 *  lists are fetched here because the tab pills count them for the tab the user
 *  is NOT on. */
export function CapabilitiesView({
  embedded = false,
  fixedConnection,
  fixedProfile,
  setStatusbarItemGroup: _setStatusbarItemGroup,
  ...props
}: CapabilitiesViewProps) {
  const { t } = useI18n()
  // Both hooks run unconditionally (rules of hooks); embedded picks the local
  // one so tab clicks inside a dialog don't rewrite the page URL.
  const routeTab = useRouteEnumParam('tab', CAPABILITY_MODES, 'skills')
  const localTab = useState<CapabilityMode>('skills')
  const [mode, setMode] = embedded ? localTab : routeTab
  const gateway = useStoreSelector($gateway, g => (mode === 'connectors' ? g : null))

  const [query, setQuery] = useState('')

  const scope = useCapabilityScope({ fixedConnection, fixedProfile })

  // The two installed lists the tab pills count. They are fetched here, as a
  // pair, because the counts stay live for the tab the user is NOT on.
  const { data: skills, isError: skillsFailed, error: skillsError } = useSkillsQuery(scope.profile)
  const { data: toolsets, isError: toolsetsFailed } = useToolsetsQuery(scope.profile)

  const refreshCapabilities = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SKILLS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TOOLSETS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: OFFICIAL_SKILLS_KEY })
    ])

    invalidateSlashCompletions()

    void refreshToolCalls(scope.profile)
  }, [scope.profile])

  useRefreshHotkey(refreshCapabilities)

  // Plugins is small enough to warm from any tab. Skills (~100k rows) only
  // loads when asked for: an idle parse of it would still block the page.
  useEffect(() => (mode === 'plugins' ? undefined : prefetchCatalogWhenIdle('plugins')), [mode])

  // Rotating placeholder nudges from the user's own data — teach that search
  // understands categories and tool names, not just titles.
  const searchHints = useMemo(() => {
    if (mode === 'skills' && skills?.length) {
      return skillSearchTerms(skills).map(term => t.common.tryHint(term))
    }

    if (mode === 'toolsets' && toolsets?.length) {
      return toolsetSearchTerms(toolsets).map(term => t.common.tryHint(term))
    }

    return undefined
  }, [mode, skills, t, toolsets])

  // MCP and Plugins load independently of the installed Skills/Tools lists.
  const gated = mode === 'toolsets'
  const pending = gated && !(skills && toolsets)

  const loadGate = !pending ? null : skillsFailed || toolsetsFailed ? (
    <PanelEmpty
      action={
        <Button onClick={() => void refreshCapabilities()} size="sm">
          {t.skills.refresh}
        </Button>
      }
      description={skillsError instanceof Error ? skillsError.message : undefined}
      icon="error"
      title={t.skills.skillsLoadFailed}
    />
  ) : (
    <PageLoader label={t.skills.loading} />
  )

  const tabContent = {
    // The gateway instance backs ONLY the live `reload.mcp` RPC, and it is the
    // ACTIVE gateway's socket — for a scope pinned to a different backend that
    // (config edits still apply on that backend's next session).
    connectors: () => (
      <ConnectorsTab
        gateway={scope.crossBackend ? null : gateway}
        key={`connectors-${scope.key}`}
        profile={scope.profile}
      />
    ),
    // Agent plugins for the scoped profile and app-level desktop plugins.
    plugins: () => (
      <PluginsTab
        key={`plugins-${scope.key}`}
        onQueryChange={setQuery}
        profile={scope.profile}
        query={query}
        scopeLabel={scope.label}
        scopeSelector={scope.options.length > 1 ? <CapabilityScopeSelector compact scope={scope} /> : undefined}
      />
    ),
    skills: () => (
      <SkillsTab
        installedError={skillsError}
        installedPending={!skills || skillsFailed}
        key={`skills-${scope.key}`}
        onQueryChange={setQuery}
        onRefresh={() => void refreshCapabilities()}
        profile={scope.profile}
        query={query}
        skills={skills ?? []}
      />
    ),
    // qiji 0.17.7+: 技能广场——平台运营的上架技能市场（后端 skillmarket 接口）
    market: () => (
      <div className={cn('h-full overflow-y-auto py-3', PAGE_INSET_X)}>
        <MarketPanel />
      </div>
    ),
    toolsets: () => (
      <ToolsetsTab key={`toolsets-${scope.key}`} profile={scope.profile} query={query} toolsets={toolsets ?? []} />
    )
  } satisfies Record<CapabilityMode, () => React.ReactNode>

  // qiji 0.20.4: 自研骨架替换 PageSearchShell 壳——大类栏+左rail+内容区。
  // 搜索保留（skills/toolsets 大类内容区顶部），scope 选择器保留。
  const hubCategory = HUB_MODE_OF[mode]

  const fallbackContent =
    mode === 'connectors'
      ? tabContent.connectors()
      : mode === 'plugins'
        ? tabContent.plugins()
        : mode === 'market'
          ? tabContent.market()
          : mode === 'toolsets'
            ? tabContent.toolsets()
            : null

  return (
    <section {...props} className={cn('flex h-full min-h-0 flex-col', props.className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-[calc(var(--titlebar-height)/2+0.375rem)]">
        {mode !== 'plugins' && mode !== 'connectors' && <CapabilityScopeSelector scope={scope} />}
        <div className="flex min-w-0 flex-1 justify-end">
          {(mode === 'skills' || mode === 'toolsets') && (
            <input
              className="h-8 w-full max-w-[18rem] rounded-md border border-(--ui-border) bg-(--ui-bg-secondary)/60 px-3 text-[0.85rem] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-tertiary) focus:border-(--ui-text-primary)/40"
              onChange={event => setQuery(event.target.value)}
              placeholder={mode === 'skills' ? '搜索技能（支持中文）…' : '搜索工具集…'}
              value={query}
            />
          )}
        </div>
      </div>
      <QijiCapabilitiesHub
        activeCategory={hubCategory}
        fallbackContent={fallbackContent}
        marketActive={mode === 'market'}
        marketEntry={
          <button
            className="row-hover flex h-8 w-full items-center gap-2 border border-transparent px-2.5 text-left text-[0.9rem] font-semibold text-foreground/85 transition-colors hover:bg-(--chrome-action-hover)"
            onClick={() => setMode('market')}
            type="button"
          >
            <Sparkles className="size-4 shrink-0 text-muted-foreground/80" />
            <span className="min-w-0 flex-1 truncate">{t.settings.account.skillmarket.title}</span>
          </button>
        }
        onCategoryChange={id => {
          setQuery('')
          setMode(id)
        }}
        onRefresh={() => void refreshCapabilities()}
        profile={scope.profile}
        query={query}
        skills={skills ?? []}
        skillsPending={!skills}
      />
    </section>
  )
}

// Feature-detection flag for plugins (Bot Mode): TRUE means this build's
// CapabilitiesView routes `fixedConnection` to the pinned connection's backend.
// Older builds export CapabilitiesView WITHOUT the prop — passing it there would
// silently read/write the ACTIVE gateway under the remote bot's profile name,
// which is exactly the wrong-machine bug the prop exists to prevent. A static
// property is probe-able without rendering.
CapabilitiesView.supportsFixedConnection = true as const
