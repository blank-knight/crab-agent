import type * as React from 'react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'

import type { SetStatusbarItemGroup } from '@/app/shell/statusbar-controls'
import { Codicon } from '@/components/ui/codicon'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useLaunchIntoFreshChat } from '@/hooks/use-launch-into-fresh-chat'
import { cn } from '@/lib/utils'
import { pinNewChatProfile } from '@/store/profile'

import { OpcExpertsSection } from './experts'
import { AddAgentCard, notifyUserAgentsChanged, UserAgentCard, UserAgentDialog } from './user-agent-cards'
import { useUserAgents } from './user-agent-cards'
import type { UserAgent } from './user-agents'

/**
 * qiji 0.20.5: OPC 智能体启动台（卖点入口）。
 *
 * 侧边栏「OPC」行落地页：把自营智能体（GEO、后续新增）组织成卡片墙。
 * 数据驱动 —— 加智能体 = OPC_AGENTS 加一条，不动布局。
 * 点击卡片 = 回聊天页空态 + 把 /技能名 填进输入框（复用 qiji:insert-skill
 * 事件，与主页星标条同一机制）。导航后 composer 需要一拍挂载，事件延时派发。
 */

export interface OpcAgent {
  /** 技能名（安装身份，进 slash 命令） */
  name: string
  /** 卡片标题 */
  title: string
  /** 一句话定位 */
  desc: string
  /** 解决什么（参考泽宇卡片「解决」段） */
  solves: string
  /** 怎么实现（参考泽宇卡片「实现」段） */
  how: string
  /** codicon 图标名 */
  icon: string
  /** 强调色相（hsl hue，稳定区分不同智能体） */
  hue: number
  /** 是否可立即使用；false 渲染为「即将上线」占位卡 */
  ready: boolean
  /** 占位卡上的预计时间（仅 ready=false 时显示） */
  eta?: string
}

// ── 数据源：后续智能体往这里加 ──────────────────────────────
export const OPC_AGENTS: OpcAgent[] = [
  {
    name: 'qiji-geo',
    title: 'GEO 品牌可见度',
    desc: 'AI 时代的内容营销引擎',
    solves: '客户在 AI 搜索里搜不到你？品牌在 ChatGPT / 豆包 / Kimi 里没有存在感，流量被竞品截走。',
    how: 'AI 可见度诊断 → 关键词计划 → AI 写作 → 多平台分发 → 半月复盘，一条龙把品牌打进 AI 搜索答案里。',
    icon: 'globe',
    hue: 152,
    ready: true
  },
  {
    name: 'opc-social',
    title: '社媒矩阵运营',
    desc: '16 平台内容分发中枢',
    solves: '公众号、知乎、小红书……每个平台都要手动排版发布，一天耗在搬运上。',
    how: '一处写作，多平台适配格式并定时分发，数据回流看板统一追踪。',
    icon: 'broadcast',
    hue: 208,
    ready: false,
    eta: '即将上线'
  },
  {
    name: 'opc-seo',
    title: '官网 SEO 自动化',
    desc: '官网内容持续更新引擎',
    solves: '官网文章停更半年，搜索引擎权重一路下滑，却没有人力天天写。',
    how: '基于品牌知识库自动产出官网文章，按栏目定时发布，保持站点活性。',
    icon: 'rocket',
    hue: 24,
    ready: false,
    eta: '即将上线'
  }
]

// ── 卡片 ────────────────────────────────────────────────────

function OpcAgentCard({ agent, onLaunch }: { agent: OpcAgent; onLaunch: (a: OpcAgent) => void }) {
  const ready = agent.ready

  return (
    <button
      className={cn(
        'group relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 text-left transition-all duration-150',
        ready
          ? 'border-(--ui-stroke-tertiary) bg-(--ui-card) hover:-translate-y-0.5 hover:border-(--ui-primary)/40 hover:shadow-[0_6px_20px_color-mix(in_srgb,var(--ui-primary)_14%,transparent)]'
          : 'cursor-default border-dashed border-(--ui-stroke-tertiary) opacity-70'
      )}
      data-tour={`opc-agent-${agent.name}`}
      onClick={() => ready && onLaunch(agent)}
      type="button"
    >
      {/* 头部：图标圆片 + 标题 */}
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[1.05rem] font-bold text-white"
          style={{ background: `hsl(${agent.hue} 52% 52%)` }}
        >
          <Codicon aria-hidden="true" name={agent.icon} size="1.15rem" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.95rem] font-bold text-(--ui-text-primary)">{agent.title}</span>
            {!ready && (
              <span className="shrink-0 rounded-full bg-(--ui-muted) px-2 py-px text-[0.68rem] font-semibold text-(--ui-text-tertiary)">
                {agent.eta ?? '即将上线'}
              </span>
            )}
          </span>
          <span className="block truncate text-[0.75rem] text-(--ui-text-tertiary)">{agent.desc}</span>
        </span>
      </div>

      {/* 解决 / 实现 两段（参考泽宇智能体卡结构） */}
      <div className="flex flex-col gap-1.5 text-[0.8rem] leading-relaxed">
        <p className="text-(--ui-text-secondary)">
          <span className="mr-1.5 font-bold text-(--ui-primary)">解决</span>
          {agent.solves}
        </p>
        <p className="text-(--ui-text-secondary)">
          <span className="mr-1.5 font-bold text-(--ui-primary)">实现</span>
          {agent.how}
        </p>
      </div>

      {/* 底部行动条 */}
      <span
        className={cn(
          'mt-auto flex items-center gap-1.5 text-[0.8rem] font-semibold',
          ready ? 'text-(--ui-primary)' : 'text-(--ui-text-tertiary)'
        )}
      >
        {ready ? (
          <>
            立即使用
            <Codicon
              aria-hidden="true"
              className="transition-transform duration-150 group-hover:translate-x-0.5"
              name="chevron-right"
              size="0.85rem"
            />
          </>
        ) : (
          '开发中，敬请期待'
        )}
      </span>
    </button>
  )
}

// ── 页面 ────────────────────────────────────────────────────

export interface OpcViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function OpcView(_: OpcViewProps) {
  const navigate = useNavigate()
  // qiji 0.20.5: 技能|专家 两段——自营技能墙 + hermes-bots roster 透传
  const [tab, setTab] = useState<'experts' | 'skills'>('skills')
  // qiji 0.20.5b: 用户自定义智能体（方案A 本地启动器条目）
  const userAgents = useUserAgents()
  const [agentDialogOpen, setAgentDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<UserAgent | null>(null)

  // crab 0.20.5s-r4: OPC 技能卡先建会话再直跳（专家卡同款时序）。
  // 旧路径 navigate('/') 先渲染空态主页,composer 领取+submitDraft 触发的
  // session.create 网络往返期间空态主页整页可见——用户看到"闪回新建会话页
  // 才进会话"(10-26 GEO 卡反馈)。新路径:原地等 session.create 返回
  // stored id → openSession('main') 直跳会话路由 → 芯片队列交给会话页
  // composer 领取(工作区已是会话态,$workspaceIsPage=false,领取条件满足),
  // autoSend 原语义不变。任何一步失败:回退旧行为(跳新会话页+入队),
  // 卡片永远有出路。
  const launchIntoFreshChat = useLaunchIntoFreshChat()

  // 点击可用卡片：回聊天新会话，等主 composer 挂载后领取预填队列。
  // ⚠️ 别用「navigate 后轮询 window.location.pathname==='/' 再派发事件」——
  // 应用是 HashRouter，打包版跑 file:// 下 pathname 是文档路径永远不是 '/'，
  // dev(http) 下碰巧通过、真机必失（0.20.5b 装机实锤）。改为闩锁队列：
  // queueSkillInsert 入队（store/composer.ts），主 composer 挂载且 workspace
  // 回聊天态（$workspaceIsPage=false）后 rAF 领取——不依赖 URL、不怕重挂载、
  // 不怕 pane 架构 composer 常驻被路由提交冲掉。
  // crab 0.20.5s-r4: 先建会话→直跳会话页→composer 再领取提交（专家卡同款时序）。
  // r3 及之前是 navigate('/') 先跳空态主页,等 composer 领取+submitDraft 的
  // session.create 网络往返期间空态主页整页渲染出来=用户看到的"闪回新建会话
  // 页"(10-26 装机反馈:GEO/技能卡点击闪屏,test/炒股专家不闪——专家就是
  // 先建会话直跳的)。主技能入口(onLaunch)与用户自建卡(onLaunchUser)同修;
  // 主页五张技能卡(chat/index.tsx onSkillPick)不走此路径,不改。
  const onLaunch = useCallback(
    (agent: OpcAgent) => {
      // crab 0.20.5s: 技能/智能体入口先把新会话钉回 default——进过专家对话后
      // $activeGatewayProfile 停在专家档,不钉的话新会话全落专家档(冷网关+
      // 市场技能缺失,/命令 Unknown command、"过一会才进流程"的病根)。
      // crab 0.20.5s-r3: pin-only——只钉新会话归属,不切 active。r2 的
      // selectProfile('default') 是败笔:它触发整条网关切换(断当前档后端→
      // 连 default),秒级卡顿,且切换态吞掉 autoSend(主页卡只填不发)。
      // pin 路由会话本身已落 default 档,无需动 active。
      pinNewChatProfile('default')

      void launchIntoFreshChat(`/${agent.name} `, agent.title)
    },
    [launchIntoFreshChat]
  )

  // qiji 0.20.5b: 用户自定义智能体（方案A 本地启动器）——技能型同 /技能名 预填，
  // 提示词型直接预填全文。与 onLaunch 同一闩锁队列协议。
  const onLaunchUser = useCallback(
    (agent: UserAgent) => {
      // crab 0.20.5s-r3: 同 onLaunch——pin-only,不切 active(切网关=卡顿+吞autoSend)。
      pinNewChatProfile('default')

      const command = agent.kind === 'skill' ? `/${agent.target} ` : agent.target
      void launchIntoFreshChat(command, agent.title)
    },
    [launchIntoFreshChat]
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-tour="opc-view">
      {/* 页头 */}
      <div className="px-8 pb-2 pt-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-(--ui-primary) text-[1.25rem] text-(--ui-primary-foreground) shadow-[0_4px_14px_color-mix(in_srgb,var(--ui-primary)_35%,transparent)]">
            <Codicon aria-hidden="true" name="rocket" size="1.35rem" />
          </span>
          <div>
            <h1 className="text-[1.45rem] font-bold tracking-tight text-(--ui-text-primary)">OPC 智能体</h1>
            <p className="mt-0.5 text-[0.85rem] text-(--ui-text-tertiary)">
              自营智能体启动台 —— 挑一个场景，剩下的交给它
            </p>
          </div>
        </div>
      </div>

      {/* 段选：技能（自营卡片墙）| 专家（roster 透传） */}
      <div className="flex items-center gap-3 px-8 pt-4">
        <SegmentedControl
          onChange={setTab}
          options={[
            { id: 'skills', label: '技能' },
            { id: 'experts', label: '专家' }
          ]}
          value={tab}
        />
        <p className="text-[0.75rem] text-(--ui-text-tertiary)">
          {tab === 'skills' ? '即点即用：预填指令，跑在当前会话' : '独立档案：自己的记忆与人设，永续对话'}
        </p>
      </div>

      {/* 卡片墙 / 专家墙 */}
      {tab === 'skills' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3.5 px-8 pb-8 pt-3">
          {OPC_AGENTS.map(agent => (
            <OpcAgentCard agent={agent} key={agent.name} onLaunch={onLaunch} />
          ))}
          {userAgents.map(agent => (
            <UserAgentCard agent={agent} key={agent.id} onEdit={setEditingAgent} onLaunch={onLaunchUser} />
          ))}
          <AddAgentCard onClick={() => setAgentDialogOpen(true)} />
        </div>
      ) : (
        <OpcExpertsSection />
      )}

      {/* 新增/编辑智能体弹层（方案A） */}
      {agentDialogOpen ? (
        <UserAgentDialog
          editing={editingAgent}
          onClose={() => {
            setAgentDialogOpen(false)
            setEditingAgent(null)
          }}
          onSaved={notifyUserAgentsChanged}
        />
      ) : null}
    </section>
  )
}
