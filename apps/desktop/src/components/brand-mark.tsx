import { useStore } from '@nanostores/react'
import { type ComponentProps, useState } from 'react'

import { $oemBrand, hasOemLogo } from '@/store/oem-brand'
import { useTheme } from '@/themes'

import { cn } from '../lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

/**
 * Brand badge: 默认主题标（nous-girl，浅深色各自款）；配置 OEM 贴牌 logo
 * （store 里）或登录页预览 logo（overrideLogo，未登录时 store 还没品牌）
 * 时显示贴牌图，加载失败回退默认。
 */
export function BrandMark({
  className,
  overrideLogo,
  ...props
}: ComponentProps<'span'> & { overrideLogo?: string | null }) {
  const { renderedMode } = useTheme()
  const brand = useStore($oemBrand)
  const [broken, setBroken] = useState(false)
  const dark = renderedMode === 'dark'
  const logoUrl = overrideLogo?.trim() || (hasOemLogo(brand) ? brand.logo.trim() : '')

  return (
    <span className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)} {...props}>
      {logoUrl && !broken ? (
        <img
          alt=""
          className="size-full object-contain"
          onError={() => setBroken(true)}
          src={logoUrl}
        />
      ) : (
        <img alt="" className="size-full object-contain" src={assetPath(dark ? 'nous-girl-dark.png' : 'nous-girl.png')} />
      )}
    </span>
  )
}
