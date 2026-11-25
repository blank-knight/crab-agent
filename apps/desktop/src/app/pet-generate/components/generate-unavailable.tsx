import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/lib/external-link'
import { PawPrint, Settings2 } from '@/lib/icons'

interface GenerateUnavailableProps {
  onSetup: () => void
}

// Shown when no reference-capable image backend is configured: generation is
// impossible, so we replace the prompt entirely with a friendly path to set one
// up (in-app) plus where to grab a key.
// qiji 0.20.5-ab: 硬编码英文→直排中文（宠物形象生成是 qiji 单语面，Key 来源换成国内口径）
export function GenerateUnavailable({ onSetup }: GenerateUnavailableProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
        <PawPrint className="size-5" />
      </span>
      <div className="space-y-1.5">
        <p className="text-[length:var(--conversation-text-font-size)] font-semibold">
          还没有可用的图像生成服务
        </p>
        <p className="mx-auto max-w-[19rem] text-[length:var(--conversation-caption-font-size)] leading-relaxed text-(--ui-text-tertiary)">
          孵化专属宠物形象需要支持参考图的图像生成服务，先配置一个吧。
        </p>
      </div>
      <Button onClick={onSetup} size="sm">
        <Settings2 className="size-4" />
        去配置图像生成
      </Button>
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">
        <span>获取 API 密钥：</span>
        <ExternalLink href="https://www.volcengine.com/product/doubao" showExternalIcon={false}>
          豆包（火山引擎）
        </ExternalLink>
        <span>·</span>
        <ExternalLink
          className="opacity-40 transition-opacity hover:opacity-100"
          href="https://cloud.siliconflow.cn/apikeys"
          showExternalIcon={false}
        >
          硅基流动
        </ExternalLink>
        <span>·</span>
        <ExternalLink
          className="opacity-40 transition-opacity hover:opacity-100"
          href="https://open.bigmodel.cn/usercenter/apikeys"
          showExternalIcon={false}
        >
          智谱 GLM
        </ExternalLink>
      </p>
    </div>
  )
}
