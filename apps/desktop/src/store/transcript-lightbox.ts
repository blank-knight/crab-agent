import { atom } from 'nanostores'

import { $activeSessionId } from '@/store/session'

/**
 * 聊天记录灯箱的打开源，从 `ZoomableImage` 组件内提升到全局 store。
 * （上游 #123018）
 *
 * 流式输出期间聊天行——以及其中的 markdown 叶子——会合法地重挂载
 * （渲染预算分片会丢弃旧行；文本增长触发 markdown AST 重新解析），
 * 而对话框的打开标志以前是组件局部 `useState`。用户打开的预览因此
 * 会在行被回收时无操作地自动关闭。按源身份在这里键控标志，重挂载的
 * 行可以重新呈现自己打开着的对话框。
 *
 * 同时只开一个预览（与组件局部标志一致），仅存进程内存，由显式关闭
 * （Escape/背景/点击）清空——绝不被重挂载清空——会话切换时也清空，
 * 新聊天不继承上一个聊天的打开预览。
 */
export const $transcriptLightbox = atom<string | null>(null)

// 过期的打开项不能跟着用户进入另一个聊天：同一媒体路径可以合法出现
// 在两个会话里，灯箱在那里无操作地打开就是反向的同一种 bug。
$activeSessionId.subscribe(() => resetTranscriptLightbox())

export function openTranscriptLightbox(src: string): void {
  if (src) {
    $transcriptLightbox.set(src)
  }
}

export function closeTranscriptLightbox(src: string): void {
  // 只在仍指向此源时清除——另一张图的预览不应被旧图的关闭误伤。
  if (src && $transcriptLightbox.get() === src) {
    $transcriptLightbox.set(null)
  }
}

export function resetTranscriptLightbox(): void {
  $transcriptLightbox.set(null)
}
