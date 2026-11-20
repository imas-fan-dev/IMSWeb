import { ImagesIcon, XIcon } from "lucide-react"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

import { Button } from "~/components/ui/button"

/**
 * 全屏扫码取景层。
 *
 * 相机画面由原生插件垫在 WebView **后面**（`windowed: true` 会把 WebView 背景透明），
 * 所以页面其余部分必须整体让开：`data-camera-scan` 上 `<html>` 后，全局样式隐藏
 * 除本层以外的所有 body 子节点，镂空区域才会真的露出相机。
 *
 * 中心框用超大外阴影当遮罩（单个元素，不需要拼四块）；四角是描边装饰。
 */
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
      className="fixed inset-0 z-130 flex flex-col text-white"
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-square w-[min(64vw,16rem)] rounded-2xl border border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.72)]">
          <span className="absolute -top-px -left-px size-6 rounded-tl-2xl border-t-2 border-l-2 border-white" />
          <span className="absolute -top-px -right-px size-6 rounded-tr-2xl border-t-2 border-r-2 border-white" />
          <span className="absolute -bottom-px -left-px size-6 rounded-bl-2xl border-b-2 border-l-2 border-white" />
          <span className="absolute -right-px -bottom-px size-6 rounded-br-2xl border-r-2 border-b-2 border-white" />
        </div>
      </div>

      <header className="relative z-10 flex items-center justify-between p-4">
        <h2 className="text-base font-semibold">扫码</h2>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="关闭扫码"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <footer className="relative z-10 mt-auto flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-sm text-white/85">
          {decoding ? "正在识别图片…" : "把对方的二维码放进框内，自动识别"}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={decoding}
          onClick={() => inputRef.current?.click()}
        >
          <ImagesIcon data-icon="inline-start" aria-hidden="true" />
          从相册选择
        </Button>
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
