import { useCallback } from 'react'
import { useNavigate } from 'react-router'

import { NEW_CHAT_ROUTE } from '@/app/routes'
import { host } from '@/sdk'
import { queueSkillInsert } from '@/store/composer'
import { requestGatewayForProfile } from '@/store/gateway'

/**
 * crab 0.20.5v-w: 技能入口「点了就走」共享落位器（从 OPC launchIntoFreshChat
 * 抽出，0.20.5s-r4/r5 已装机验证的时序）。旧路径 navigate('/') 先渲染空态
 * 主页，composer 领取+submitDraft 触发的 session.create 网络往返期间
 * 「新建会话」空态整页可见——用户看到的「先闪新建会话再进正常会话」两段式
 * 跳转（2026-11-03 用户报障：hub 技能「使用」/OPC/专家入口均有此感）。
 *
 * 新路径：原地等 session.create 返回 stored id → host.openSession 直跳
 * 会话路由（带 profile 归属，r5 语义）→ 芯片队列交给会话页 composer 领取，
 * autoSend 原语义不变。任何一步失败：回退旧行为（跳新会话页+入队），卡片
 * 永远有出路。
 *
 * ⚠️ 调用方自行负责 pinNewChatProfile('default')（pin-only 铁律，
 * 0.20.5s-r3：禁 selectProfile——切 active=网关切换秒级卡顿+吞 autoSend）。
 */
export function useLaunchIntoFreshChat(): (command: string, label: string) => Promise<void> {
  const navigate = useNavigate()

  return useCallback(
    async (command: string, label: string) => {
      let storedId: string | null = null

      try {
        const res = await requestGatewayForProfile<{ stored_session_id?: string; session_id?: string }>(
          'default',
          'session.create',
          { profile: 'default' },
          undefined,
          undefined,
          { spawnPriority: 'foreground' }
        )

        storedId = res?.stored_session_id ?? res?.session_id ?? null
      } catch {
        storedId = null
      }

      if (!storedId) {
        // 回退旧行为：空态主页路径仍能走通（芯片在队列里等 composer）。
        navigate(NEW_CHAT_ROUTE)
        queueSkillInsert({ command, label, autoSend: true })

        return
      }

      // 直跳必须带 profile 归属（r5）：裸 openSession 只导航，active 网关
      // 没听说过 default 档建的会话时 resume 判死 → 路由顶回 '#/' = 闪屏本体。
      await host.openSession(storedId, { profile: 'default', intent: 'main' })
      // 会话页 composer 挂载后领取芯片并 autoSend；先入队再跳转，顺序无关
      // （队列是闩锁，领取条件=主 composer+工作区回会话态）。
      queueSkillInsert({ command, label, autoSend: true })
    },
    [navigate]
  )
}
