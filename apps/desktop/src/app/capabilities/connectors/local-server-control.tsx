import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { McpCatalogEntry } from '@/hermes'
import { useI18n } from '@/i18n'

// qiji 0.20.5c: MCP 安装表单环境变量标签中文化——required_env 的 prompt 是
// 后端 manifest 英文原文，此处按字段名查表（覆盖 optional-mcps 全量 3 个
// 带 prompt 的字段；未收录回退英文原文）。同一目录卡片的中文名见
// connectors-zh.ts CONNECTOR_ZH。
const MCP_ENV_FIELD_ZH: Readonly<Record<string, string>> = {
  ASANA_CLIENT_ID: 'Asana 应用 Client ID（开发者控制台 → 你的 MCP 应用 → OAuth）',
  ASANA_CLIENT_SECRET: 'Asana 应用 Client 密钥',
  N8N_MCP_SERVER_URL: 'MCP 服务器 URL（n8n 设置 → 实例级 MCP → 连接；以 /mcp-server/http 结尾）'
}

function envFieldLabel(field: InstallField): string {
  return MCP_ENV_FIELD_ZH[field.name] ?? field.prompt ?? field.name
}

export type InstallField = McpCatalogEntry['required_env'][number]

export function LocalInstall({
  installFields = [],
  installing = false,
  onInstall
}: {
  installFields?: readonly InstallField[]
  installing?: boolean
  onInstall: (env: Record<string, string>) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const missing = installFields.some(field => field.required === true && !(draft[field.name] ?? '').trim())

  return (
    <div className="grid justify-items-start gap-2">
      {installFields.length > 0 ? (
        <>
          <p className="text-[0.7rem] text-(--ui-text-tertiary)">{t.settings.mcp.catalogEnvRequired}</p>
          {installFields.map(field => (
            <label className="grid w-full gap-1" key={field.name}>
              <span className="text-[0.65rem] text-(--ui-text-secondary)">
                {envFieldLabel(field)}
                {field.required ? ' *' : ''}
              </span>
              <Input
                className="h-7 text-xs"
                onChange={event => setDraft({ ...draft, [field.name]: event.currentTarget.value })}
                type="password"
                value={draft[field.name] ?? ''}
              />
            </label>
          ))}
        </>
      ) : null}

      <Button
        disabled={installing || missing}
        loading={installing}
        onClick={() => onInstall(draft)}
        size="xs"
        variant="outline"
      >
        {t.connectorsPage.card.verb.install}
      </Button>
    </div>
  )
}
