import { useStore } from '@nanostores/react'
import { Download, Loader2, Sparkles } from 'lucide-react'
import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { useGatewayRequest } from '@/app/gateway/hooks/use-gateway-request'
import { Button } from '@/components/ui/button'
import { isZhLocale } from '@/i18n'
import { BACKEND_BASE_URL, backendGet } from '@/lib/backend'
import { invalidateSlashCompletions } from '@/lib/slash-completion-cache'
import { cn } from '@/lib/utils'
import { $auth } from '@/store/auth'

import { resolveSkillIconName, SkillIcon, skillIconTone } from './skill-icon'
import { translateSkillField } from './translations'

interface MarketSkill {
  id: number | string
  name: string
  title: string
  version: string
  description?: string
  download_count: number
}

/**
 * qiji 0.17.7: 技能广场——从「设置→个人中心」提升为一级入口。
 * 数据源 /api/client/v1/skill/list;安装走 hermesDesktop.skillMarket.install。
 * （逻辑从 account-settings.tsx 迁出,个人中心保留轻量入口）
 */
export function MarketPanel(_props: React.ComponentProps<'section'>) {
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [ghRepo, setGhRepo] = useState('')
  const [ghBusy, setGhBusy] = useState(false)
  const auth = useStore($auth)
  const { requestGateway } = useGatewayRequest()

  /**
   * qiji 0.20: 装/卸技能后让运行中后端立刻重扫技能目录——否则新装的
   * /docx-writer 等命令撞后端 get_skill_commands() 的进程级缓存，直接
   * 输入（不开斜杠面板）时报 Unknown，直到后端重启。
   *
   * 链路：JSON-RPC skills.reload（重扫并刷新缓存，0.18.2+ 已有）→
   * invalidateSlashCompletions()（丢弃渲染层 catalog 缓存，下次按 / 重拉）。
   * best-effort：gateway 未连/方法不存在不报错——技能文件已落盘，下次
   * commands.catalog 拉取内部全量重扫，兜底收敛。
   */
  const notifyBackendOfSkillsChange = useCallback(async () => {
    invalidateSlashCompletions()

    try {
      await requestGateway('skills.reload')
    } catch {
      // 老后端无此方法或网关未连接——装完即生效的窗口期由下次 catalog 拉取兜底。
    }
  }, [requestGateway])

  const installGithub = useCallback(
    async (repo: string, subdir?: string) => {
      setGhBusy(true)
      setMsg('')

      try {
        const r = await window.hermesDesktop.skillMarket.installGithub(repo, subdir)
        const names =
          'allNames' in r && Array.isArray((r as { allNames?: string[] }).allNames)
            ? (r as { allNames: string[] }).allNames
            : [r.name]
        setInstalled(prev => {
          const s = new Set(prev)

          for (const n of names) {
            s.add(n)
          }

          return s
        })
        await notifyBackendOfSkillsChange()
        setMsg(
          `已安装 ${names.length > 1 ? names.length + ' 个技能(' + names.slice(0, 3).join('、') + (names.length > 3 ? '…' : '') + ')' : '「' + r.name + '」'}(来自 GitHub ${repo})`
        )
        setMsgOk(true)
        setGhRepo('')
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e))
        setMsgOk(false)
      } finally {
        setGhBusy(false)
      }
    },
    [notifyBackendOfSkillsChange]
  )

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const res = await backendGet<{ total: number; rows: MarketSkill[] }>('/api/client/v1/skill/list')
      const rows = res.data?.rows ?? []
      const installedNames: string[] = []

      try {
        const r = await window.hermesDesktop.listDir('skills/market')

        for (const item of r) {
          if (item.isDirectory) {
            installedNames.push(item.name)
          }
        }
      } catch {
        /* 目录不存在=没装过 */
      }

      setSkills(rows)
      setInstalled(new Set(installedNames))
    } catch {
      setSkills([])
    } finally {
      setLoading(false)
    }
  }, [])

  /** qiji 0.19.8: 卸载市场技能（按用户偏好不加确认弹窗），卸完刷新已装集合 */
  async function uninstall(sk: MarketSkill) {
    if (uninstalling) {
      return
    }
    setUninstalling(sk.name)
    setMsgOk(false)
    setMsg('')

    try {
      await window.hermesDesktop.skillMarket.uninstall(sk.name)
      setInstalled(prev => {
        const s = new Set(prev)
        s.delete(sk.name)

        return s
      })
      await notifyBackendOfSkillsChange()
      setMsgOk(true)
      setMsg(`「${sk.title}」已卸载`)
    } catch (err) {
      setMsgOk(false)
      setMsg(`卸载失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUninstalling(null)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  async function install(sk: MarketSkill) {
    if (installing) {
      return
    }
    setInstalling(sk.name)
    setMsg('')

    try {
      const url = `${BACKEND_BASE_URL}/api/client/v1/skill/download?id=${sk.id}`
      await window.hermesDesktop.skillMarket.install(url, sk.name, auth.token || '')
      setInstalled(prev => new Set(prev).add(sk.name))
      await notifyBackendOfSkillsChange()
      setMsgOk(true)
      setMsg(`「${sk.title}」安装成功`)
    } catch (err) {
      setMsgOk(false)
      setMsg(`安装失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstalling(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">技能广场</h2>
        <span className="text-xs text-muted-foreground">浏览并安装平台技能,安装后可在会话中直接使用</span>
      </header>
      {msg ? (
        <p className={cn('text-xs', msgOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>{msg}</p>
      ) : null}
      {loading ? (
        <p className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          正在加载技能列表…
        </p>
      ) : skills.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无可用技能</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {skills.map(sk => {
            const isInstalled = installed.has(sk.name)
            // qiji 0.19.3-fix: 中文环境下标题/描述走翻译层（后端 SKILL.md 是英文）
            const titleZh = isZhLocale() ? translateSkillField(sk.name, 'name', sk.title) : sk.title

            const descZh = isZhLocale()
              ? translateSkillField(sk.name, 'description', sk.description ?? '')
              : (sk.description ?? '')

            return (
              <div
                className="flex flex-col justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5"
                key={sk.id}
              >
                <div className="flex items-start gap-2">
                  {/* qiji 0.19.4: 市场技能图标（名→类别→兜底 + 语义彩色底） */}
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg border',
                      skillIconTone(resolveSkillIconName(sk.name))
                    )}
                  >
                    <SkillIcon name={sk.name} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{titleZh}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      v{sk.version} · {sk.download_count} 次下载
                    </p>
                  </div>
                </div>
                {sk.description ? (
                  <p className="mt-1.5 line-clamp-2 min-h-8 text-xs text-muted-foreground/80">{descZh}</p>
                ) : (
                  <p className="mt-1.5 min-h-8" />
                )}
                <Button
                  className="mt-2.5"
                  disabled={isInstalled || installing !== null}
                  onClick={() => void install(sk)}
                  size="sm"
                  variant={isInstalled ? 'outline' : 'textStrong'}
                >
                  {installing === sk.name ? <Loader2 className="size-3 animate-spin" /> : null}
                  {isInstalled ? '已安装' : installing === sk.name ? '安装中…' : '安装'}
                </Button>
                {isInstalled && (
                  <Button
                    className="mt-1.5"
                    disabled={uninstalling !== null}
                    onClick={() => void uninstall(sk)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {uninstalling === sk.name ? '卸载中…' : '卸载'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* ── GitHub 社区技能(直连GitHub安装,官方服务器零参与) ── */}
      <div className="mt-2 rounded-lg border border-dashed p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">GitHub 社区技能</span>
          <span className="text-xs text-muted-foreground">输入 仓库/作者 安装开源技能（如 anthropics/skills）</span>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-primary/50"
            onChange={e => setGhRepo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && ghRepo.trim()) {
                void installGithub(ghRepo.trim())
              }
            }}
            placeholder="owner/repo（支持粘贴 github.com 链接）"
            value={ghRepo}
          />
          <Button disabled={ghBusy || !ghRepo.trim()} onClick={() => void installGithub(ghRepo.trim())} size="sm">
            {ghBusy ? <Loader2 className="size-3 animate-spin" /> : null}
            {ghBusy ? '安装中…' : '安装'}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ['anthropics/skills', '⭐ Anthropic 官方集(20个)'],
            ['vercel-labs/skills', '🔥 Vercel 热门'],
            ['vercel-labs/agent-browser', '🌐 浏览器自动化']
          ].map(([repo, label]) => (
            <button
              className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              key={repo}
              onClick={() => {
                const parts = repo.split('/')

                if (parts.length > 2) {
                  void installGithub(parts.slice(0, 2).join('/'), parts.slice(2).join('/'))
                } else {
                  void installGithub(repo)
                }
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          社区技能由原作者在 GitHub 维护，安装即代表信任该来源；官方不对其内容负责
        </p>
      </div>

      <p className="text-xs text-muted-foreground/70">
        <Download className="mr-1 inline size-3" />
        安装目录 skills/market,在「技能」页可管理启用状态
      </p>
    </section>
  )
}
