// 定时任务模板中文表（qiji 0.20.5）——真源 cron/blueprint_catalog.py CATALOG
// key=blueprint.key（身份字段）。slots 映射 slot.name → 中文 label。
// 显示时 `BLUEPRINT_ZH[key] ?? 原文` 回退，上游新增模板免疫。
export interface BlueprintZh {
  title: string
  description: string
  /** slot name → 中文 label；未收录槽位回退英文原 label */
  slots?: Readonly<Record<string, string>>
}

// 通用槽位（time/deliver 等跨模板复用）——按 slot.name 全局兜底
export const SLOT_LABEL_ZH: Readonly<Record<string, string>> = {
  time: '几点？',
  deliver: '发到哪里？',
  interval_min: '多久一次？',
  interval_h: '多久一次？',
  interval_hours: '多久一次？',
  criteria: '只在邮件…时提醒我',
  day: '哪一天？',
  what: '提醒我…',
  recurrence: '重复于',
  topic: '什么主题？',
  count: '几条要点？',
  item: '具体盯什么？',
  condition: '何时提醒我…',
  companies: '哪些公司？',
  categories: '关注哪些事件？',
  habit: '哪个习惯？',
  start_hour: '开始时间',
  end_hour: '结束时间',
  diet: '饮食习惯？',
  meals: '每天几餐？',
  effort: '做饭精力？',
  flavor: '哪种类型？'
}

export const BLUEPRINT_ZH: Readonly<Record<string, BlueprintZh>> = {
  'morning-brief': {
    title: '晨间简报',
    description: '每天一份简短简报：今日日程、天气，以及待处理的要紧事。'
  },
  'important-mail': {
    title: '重要邮件监控',
    description: '定期检查收件箱，只在你真正需要处理的邮件到达时提醒你。'
  },
  'weekly-review': {
    title: '每周回顾',
    description: '每周一份复盘：完成了什么、还开着什么、接下来有什么。'
  },
  'workday-start': {
    title: '工作日开始提醒',
    description: '工作日早上的贴心提醒：当天日程与最重要的事项。'
  },
  'custom-reminder': {
    title: '自定义提醒',
    description: '用你自己的话设一条循环提醒，按你的节奏来。'
  },
  'evening-winddown': {
    title: '晚间收尾',
    description: '一天结束时的检查：明天日程一览，以及睡前该收尾的事。'
  },
  'news-digest': {
    title: '主题新闻摘要',
    description: '围绕你关心的话题定期汇总——与已推送内容自动去重。'
  },
  'bill-renewal-watch': {
    title: '账单与续费提醒',
    description: '在周期性付款、订阅续费或到期日之前提前提醒——不再漏缴。'
  },
  'price-watch': {
    title: '价格与库存监视',
    description: '盯住某个具体商品、航班、酒店或房源，价格或可得性一变就提醒。'
  },
  'competitor-watch': {
    title: '竞品动态追踪',
    description: '追踪指定公司的实质动态——发布、定价、融资、公告——只报要紧的。'
  },
  'habit-checkin': {
    title: '习惯打卡',
    description: '定期提醒你保持习惯，并回顾今天做到了没有。'
  },
  'hydration-move': {
    title: '喝水与活动提醒',
    description: '白天定期提醒你喝水、起身、舒展一下。'
  },
  'meal-plan': {
    title: '每周菜单',
    description: '每周一份菜单外加一张合并的采购清单，贴合你的饮食和做饭精力。'
  },
  'learn-daily': {
    title: '每日一学',
    description: '每天一小课，围绕你想学的话题循序渐进。'
  },
  'gratitude-journal': {
    title: '感恩与反思',
    description: '晚间一个温和的提示：回顾今天，记下顺利的事。'
  },
  'on-this-day': {
    title: '历史上的今天',
    description: '每天一点好奇心：一个值得注意的历史事件、冷知识或每日一词。'
  }
}
