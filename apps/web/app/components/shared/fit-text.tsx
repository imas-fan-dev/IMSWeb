import { useEffect, useRef, useState } from "react"

import { cn } from "~/lib/utils"

/** 名片墙瓦片上制作人名称的字号区间：基准 14px，压缩到 11px 为止。 */
export const FIT_TEXT_MAX_PX = 14
export const FIT_TEXT_MIN_PX = 11

export interface FitTextResult {
  size: number
  /** 连最小字号都放不下，交给 CSS 省略号。 */
  truncated: boolean
}

/**
 * 按可用宽度算出字号：能放下就用基准字号，放不下就按比例压缩，最低到
 * `min`。压到 `min` 仍然溢出时返回 `truncated`，由 `truncate` 画省略号。
 */
export function fitTextSize({
  available,
  naturalWidth,
  max = FIT_TEXT_MAX_PX,
  min = FIT_TEXT_MIN_PX,
}: {
  /** 容器给文字的实际宽度（px）。 */
  available: number
  /** 文字在基准字号下的自然宽度（px）。 */
  naturalWidth: number
  max?: number
  min?: number
}): FitTextResult {
  if (!(available > 0) || !(naturalWidth > 0)) {
    return { size: max, truncated: false }
  }
  if (naturalWidth <= available) return { size: max, truncated: false }
  const scaled = Math.min(max, (available / naturalWidth) * max)
  if (scaled >= min) return { size: Math.round(scaled * 100) / 100, truncated: false }
  return { size: min, truncated: true }
}

let measureCanvas: HTMLCanvasElement | null = null

/**
 * 用 canvas 量文字，而不是往 DOM 里塞一棵隐藏的测量树：瓦片上有很多名字，
 * 每条都要在 `ResizeObserver` 回调里重量，多一棵子树就是多一次布局。
 * 环境没有 canvas（jsdom / 老浏览器）时返回 0，组件退回基准字号。
 */
function measureTextWidth(node: HTMLElement, text: string, size: number) {
  if (typeof document === "undefined") return 0
  if (typeof CanvasRenderingContext2D === "undefined") return 0
  measureCanvas ??= document.createElement("canvas")
  const context = measureCanvas.getContext("2d")
  if (!context) return 0
  const style = window.getComputedStyle(node)
  context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`
  return context.measureText(text).width
}

/**
 * 单行文字自适应宽度：`ResizeObserver` 跟着瓦片宽度重新量，字号在
 * 14px→11px 之间取值；再窄就省略（`title` 带完整文字）。
 */
export function FitText({
  text,
  className,
  max = FIT_TEXT_MAX_PX,
  min = FIT_TEXT_MIN_PX,
  title,
}: {
  text: string
  className?: string
  max?: number
  min?: number
  /** 默认在省略时用完整文字做悬浮提示。 */
  title?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [result, setResult] = useState<FitTextResult>({
    size: max,
    truncated: false,
  })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const available = node.clientWidth
      const naturalWidth = measureTextWidth(node, text, max)
      const next = fitTextSize({ available, naturalWidth, max, min })
      setResult((current) =>
        current.size === next.size && current.truncated === next.truncated
          ? current
          : next
      )
    }
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(node)
    return () => observer?.disconnect()
  }, [text, max, min])

  return (
    <span
      ref={ref}
      className={cn(
        "block max-w-full min-w-0 truncate leading-tight",
        className
      )}
      style={{ fontSize: `${result.size}px` }}
      title={title ?? (result.truncated ? text : undefined)}
    >
      {text}
    </span>
  )
}
