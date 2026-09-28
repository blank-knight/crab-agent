'use client'

import { useStore } from '@nanostores/react'
import { type ComponentProps } from 'react'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useImageDownload } from '@/hooks/use-image-download'
import { useI18n } from '@/i18n'
import { Download } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $transcriptLightbox, closeTranscriptLightbox, openTranscriptLightbox } from '@/store/transcript-lightbox'

export interface ZoomableImageProps extends ComponentProps<'img'> {
  containerClassName?: string
  slot?: string
}

export interface ImageActionCopy {
  downloadImage: string
  savingImage: string
}

export function ZoomableImage({ className, containerClassName, src, alt, slot, ...props }: ZoomableImageProps) {
  const { t } = useI18n()
  const copy = t.desktop
  const { download, saving } = useImageDownload(src)
  // 上游 #123018：打开标志放在按源身份键控的 store 里，不是组件局部
  // state——流式输出时聊天行（及其中 markdown 叶子）会例行重挂载
  // （渲染预算分片丢行、流式重解析重挂叶子），以前会把用户打开的
  // 灯箱无操作地关掉。重挂载的行读同一个 store，重新呈现自己开着的
  // 对话框。
  const openSrc = useStore($transcriptLightbox)
  const lightboxOpen = openSrc !== null && openSrc === src
  const canOpen = Boolean(src)

  return (
    <>
      <span
        className={cn('group/image relative inline-block max-w-full align-top', containerClassName)}
        data-slot={slot ?? 'aui_zoomable-image'}
      >
        <button
          className="contents"
          disabled={!canOpen}
          onClick={() => canOpen && openTranscriptLightbox(src ?? '')}
          title={canOpen ? copy.openImage : undefined}
          type="button"
        >
          <img alt={alt ?? ''} className={className} src={src} {...props} />
        </button>
        {src && (
          <ImageActionButton className="group-hover/image:opacity-100" copy={copy} onClick={download} saving={saving} />
        )}
      </span>
      {src && (
        <ImageLightbox
          alt={alt}
          copy={copy}
          onClick={download}
          onOpenChange={open => (open ? openTranscriptLightbox(src ?? '') : closeTranscriptLightbox(src ?? ''))}
          open={lightboxOpen}
          saving={saving}
          src={src}
        />
      )}
    </>
  )
}

export function ImageLightbox({
  alt,
  copy,
  onClick,
  onOpenChange,
  open,
  saving,
  src
}: {
  alt?: string
  copy: ImageActionCopy
  onClick: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  saving: boolean
  src: string
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="block w-auto max-h-[calc(100vh-12rem)] max-w-[calc(100vw-12rem)] overflow-visible border-0 bg-transparent p-0 shadow-none"
        showCloseButton={false}
      >
        <div className="group/lightbox relative inline-block">
          <img
            alt={alt ?? ''}
            className="block max-h-[calc(100vh-12rem)] max-w-[calc(100vw-12rem)] cursor-zoom-out select-auto rounded-lg object-contain shadow-2xl"
            onClick={() => onOpenChange(false)}
            src={src}
          />
          <ImageActionButton className="group-hover/lightbox:opacity-100" copy={copy} onClick={onClick} saving={saving} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ImageActionButton({
  className,
  copy,
  onClick,
  saving
}: {
  className?: string
  copy: ImageActionCopy
  onClick: () => void
  saving: boolean
}) {
  return (
    <button
      aria-label={saving ? copy.savingImage : copy.downloadImage}
      className={cn(
        'absolute right-2 top-2 grid size-8 place-items-center rounded-full border border-border/70 bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:opacity-50',
        className
      )}
      disabled={saving}
      onClick={event => {
        event.stopPropagation()
        void onClick()
      }}
      title={saving ? copy.savingImage : copy.downloadImage}
      type="button"
    >
      <Download className={cn('size-4', saving && 'animate-pulse')} />
    </button>
  )
}
