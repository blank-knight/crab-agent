// qiji 0.20.4: 技能分类中文映射（skill.category key → 中文）。
// 技能名/描述的真源在 @/app/skills/translations.ts（140 条 + brandText 品牌链）；
// 分类不在此表覆盖的 key 原样回退。
export const CATEGORY_ZH: Readonly<Record<string, string>> = {
  apple: 'Apple 生态',
  'autonomous-ai-agents': 'AI 编程代理',
  'computer-use': '电脑操控',
  creative: '创意设计',
  'data-science': '数据科学',
  dogfood: '应用测试',
  email: '邮件',
  github: 'GitHub',
  media: '媒体处理',
  mlops: '机器学习工程',
  'note-taking': '笔记',
  productivity: '效率办公',
  'qiji-knowledge-base': '奇计知识库',
  research: '调研',
  'smart-home': '智能家居',
  'social-media': '社交媒体',
  'software-development': '软件开发',
  yuanbao: '元宝',
  general: '通用',
  hub: '技能市场'
}
