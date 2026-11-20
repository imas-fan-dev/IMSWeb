import { ImagesIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

/**
 * 全屏扫码取景层。
 *
 * 相机画面由原生插件垫在 WebView **后面**（`windowed: true` 会把 WebView 背景透明），
 * 所以页面其余部分必须整体让开：`data-camera-scan` 上 `<html>` 后，全局样式隐藏
 * 除本层以外的所有 body 子节点，镂空区域才会真的露出相机。
 *
 * 中心框用超大外阴影当遮罩（单个元素，不需要拼四块）；四角是描边装饰，框内有一条
 * 循环下扫的亮线表示正在取景。关闭支持右上角按钮与**右滑**（与移动端返回手势一致）。
 */
const SWIPE_EXIT_PX = 80

export function ScanOverlay({
  decoding,
  onClose,
  onPickImage,
}: {
  decoding: boolean
  onClose: () => void
  onPickImage: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const startX = useRef<number | null>(null)

  useEffect(() => {
    document.documentElement.dataset.cameraScan = "true"
    return () => {
      delete document.documentElement.dataset.cameraScan
    }
  }, [])

  return createPortal(
    <div
      data-scan-overlay
      role="dialog"
      aria-modal="true"
      aria-label="扫码"
      className="fixed inset-0 z-130 flex touch-pan-y flex-col text-white"
      onPointerDown={(event) => {
        startX.current = event.clientX
      }}
      onPointerUp={(event) => {
        const from = startX.current
        startX.current = null
        if (from !== null && event.clientX - from >= SWIPE_EXIT_PX) onClose()
      }}
      onPointerCancel={() => {
        startX.current = null
      }}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-square w-[min(64vw,16rem)] overflow-hidden rounded-2xl border border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.72)]">
          <span className="scan-sweep absolute inset-x-6 top-1/2 h-px bg-linear-to-r from-transparent via-white/90 to-transparent" />
          <span className="absolute -top-px -left-px size-6 rounded-tl-2xl border-t-2 border-l-2 border-white" />
          <span className="absolute -top-px -right-px size-6 rounded-tr-2xl border-t-2 border-r-2 border-white" />
          <span className="absolute -bottom-px -left-px size-6 rounded-bl-2xl border-b-2 border-l-2 border-white" />
          <span className="absolute -right-px -bottom-px size-6 rounded-br-2xl border-r-2 border-b-2 border-white" />
        </div>
      </div>

      <header className="relative z-10 flex justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          aria-label="关闭扫码"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <XIcon aria-hidden="true" className="size-5" />
        </button>
      </header>

      <footer className="relative z-10 mt-auto flex flex-col items-center gap-4 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-sm text-white/85">
          {decoding ? "正在识别图片…" : "把对方的二维码放进框内，自动识别"}
        </p>
        <button
          type="button"
          disabled={decoding}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/40 px-4 text-sm text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
        >
          <ImagesIcon aria-hidden="true" className="size-4" />
          从相册选择
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onPickImage(file)
          }}
        />
      </footer>
    </div>,
    document.body
  )
}
