import {
  RotateCcwIcon,
  RotateCwIcon,
  ScanIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { CardImage } from "~/components/shared/card-image"
import { useRetainedValue } from "~/lib/use-retained-value"
import {
  namecardPages,
  type NamecardPage,
} from "~/components/shared/namecard-pages"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import type { Namecard } from "~/lib/api"
import { cn } from "~/lib/utils"

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 0.25
const PAN_STEP = 32
const BACKDROP_CLICK_THRESHOLD = 8

export type NamecardSide = "front" | "back"

type Point = { x: number; y: number }
type ViewState = { scale: number; offset: Point; rotation: number }
type PointerState = {
  pointerId: number
  start: Point
  origin: Point
  startedOnBackdrop: boolean
  moved: boolean
}
type PinchState = {
  startDistance: number
  startScale: number
  startMid: Point
  startOffset: Point
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function NamecardPreview({
  card: incomingCard,
  pages: incomingPages,
  index: incomingIndex,
  onIndexChange,
  onOpenChange,
  finalFocus,
}: {
  card: Namecard | null
  /** 全部页面按顺序排列，正面在前、背面在后。 */
  pages: readonly NamecardPage[]
  index: number
  onIndexChange: (index: number) => void
  onOpenChange: (open: boolean) => void
  finalFocus?: () => HTMLElement | null
}) {
  // 退场动画期间父组件已把预览状态清空；保留最后一组内容，避免闪白。
  const card = useRetainedValue(incomingCard)
  // 关闭时父组件把 pages 也清空；直接从保留的卡片重建，避免再存一份数组。
  const pages = useMemo(
    () =>
      incomingPages.length ? incomingPages : card ? namecardPages(card) : [],
    [incomingPages, card]
  )
  const [lastIndex, setLastIndex] = useState(incomingIndex)
  if (incomingCard && incomingIndex !== lastIndex) setLastIndex(incomingIndex)
  const index = incomingCard ? incomingIndex : lastIndex
  const [view, setView] = useState<ViewState>({
    scale: 1,
    offset: { x: 0, y: 0 },
    rotation: 0,
  })
  const [dragging, setDragging] = useState(false)
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const viewportRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<PointerState | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<PinchState | null>(null)
  const [retry, setRetry] = useState(0)
  const { scale, offset, rotation } = view
  const position = Math.min(Math.max(index, 0), Math.max(pages.length - 1, 0))
  const page = pages[position] ?? null
  const src = page?.url ?? ""
  const label = page?.label ?? ""
  const identity = `${card?.id}:${page?.key ?? ""}:${src}`
  const [displayedIdentity, setDisplayedIdentity] = useState(identity)
  if (displayedIdentity !== identity) {
    setDisplayedIdentity(identity)
    setView({ scale: 1, offset: { x: 0, y: 0 }, rotation: 0 })
    setDragging(false)
    setImageState("loading")
    setRetry(0)
  }
  useLayoutEffect(() => {
    pointerRef.current = null
    pointersRef.current.clear()
    pinchRef.current = null
  }, [identity])

  function resetView() {
    setView({ scale: 1, offset: { x: 0, y: 0 }, rotation: 0 })
    pointerRef.current = null
    pointersRef.current.clear()
    pinchRef.current = null
    setDragging(false)
  }

  // 预取左右相邻页，翻页时不再闪白。
  useEffect(() => {
    const neighbors = [pages[position - 1], pages[position + 1]]
    for (const entry of neighbors) {
      if (!entry) continue
      const image = new Image()
      image.src = entry.url
    }
  }, [pages, position])

  function updateScale(getNextScale: (currentScale: number) => number) {
    setView((current) => {
      const nextScale = clampScale(getNextScale(current.scale))
      return {
        scale: nextScale,
        offset: nextScale <= 1 ? { x: 0, y: 0 } : current.offset,
        rotation: current.rotation,
      }
    })
  }

  /** 保持指针下的内容点不动：offset 按缩放比例反解。 */
  function zoomAt(
    point: Point,
    getNextScale: (currentScale: number) => number
  ) {
    const rect = viewportRef.current?.getBoundingClientRect()
    setView((current) => {
      const nextScale = clampScale(getNextScale(current.scale))
      if (nextScale <= 1) {
        return {
          scale: nextScale,
          offset: { x: 0, y: 0 },
          rotation: current.rotation,
        }
      }
      if (!rect || nextScale === current.scale) {
        return { ...current, scale: nextScale }
      }
      const ratio = nextScale / current.scale
      const dx = point.x - (rect.left + rect.width / 2)
      const dy = point.y - (rect.top + rect.height / 2)
      return {
        scale: nextScale,
        rotation: current.rotation,
        offset: {
          x: dx - ratio * (dx - current.offset.x),
          y: dy - ratio * (dy - current.offset.y),
        },
      }
    })
  }

  function rotateView(delta: number) {
    setView((current) => ({
      ...current,
      rotation: (current.rotation + delta + 360) % 360,
    }))
  }

  function selectPage(next: number) {
    if (next === position || next < 0 || next >= pages.length) return
    resetView()
    setImageState("loading")
    onIndexChange(next)
  }

  function closePreview() {
    resetView()
    setImageState("loading")
    onOpenChange(false)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("button"))
      return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    pointersRef.current.set(event.pointerId, point)
    if (pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()]
      pinchRef.current = {
        startDistance: Math.hypot(second.x - first.x, second.y - first.y),
        startScale: view.scale,
        startMid: {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        },
        startOffset: view.offset,
      }
      pointerRef.current = null
      setDragging(true)
      return
    }
    pointerRef.current = {
      pointerId: event.pointerId,
      start: point,
      origin: offset,
      startedOnBackdrop: event.target === event.currentTarget,
      moved: false,
    }
    if (scale > 1) setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
    }
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const mid = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      }
      const rect = viewportRef.current?.getBoundingClientRect()
      const centerX = rect ? rect.left + rect.width / 2 : 0
      const centerY = rect ? rect.top + rect.height / 2 : 0
      setView((current) => {
        const nextScale = clampScale(
          pinch.startScale *
            (pinch.startDistance > 0 ? distance / pinch.startDistance : 1)
        )
        if (nextScale <= 1) {
          return {
            scale: nextScale,
            offset: { x: 0, y: 0 },
            rotation: current.rotation,
          }
        }
        const ratio = nextScale / pinch.startScale
        return {
          scale: nextScale,
          rotation: current.rotation,
          offset: {
            x:
              mid.x -
              centerX -
              ratio * (pinch.startMid.x - centerX - pinch.startOffset.x),
            y:
              mid.y -
              centerY -
              ratio * (pinch.startMid.y - centerY - pinch.startOffset.y),
          },
        }
      })
      return
    }
    const pointer = pointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    if (
      Math.hypot(
        event.clientX - pointer.start.x,
        event.clientY - pointer.start.y
      ) >= BACKDROP_CLICK_THRESHOLD
    )
      pointer.moved = true
    if (scale <= 1) return
    setView((current) => ({
      ...current,
      offset: {
        x: pointer.origin.x + event.clientX - pointer.start.x,
        y: pointer.origin.y + event.clientY - pointer.start.y,
      },
    }))
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId)
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null
    }
    if (pointersRef.current.size === 0) setDragging(false)
    const pointer = pointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    const moved = Math.hypot(
      event.clientX - pointer.start.x,
      event.clientY - pointer.start.y
    )
    pointerRef.current = null
    setDragging(false)
    if (
      pointer.startedOnBackdrop &&
      !pointer.moved &&
      event.target === event.currentTarget &&
      moved < BACKDROP_CLICK_THRESHOLD
    ) {
      closePreview()
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const panDistance = event.shiftKey ? PAN_STEP * 3 : PAN_STEP
    if (event.key === "+" || event.key === "=") {
      event.preventDefault()
      updateScale((current) => current + SCALE_STEP)
    } else if (event.key === "-") {
      event.preventDefault()
      updateScale((current) => current - SCALE_STEP)
    } else if (event.key === "0") {
      event.preventDefault()
      resetView()
    } else if (scale <= 1 && event.key === "ArrowLeft") {
      event.preventDefault()
      if (position > 0) onIndexChange(position - 1)
    } else if (scale <= 1 && event.key === "ArrowRight") {
      event.preventDefault()
      if (position < pages.length - 1) onIndexChange(position + 1)
    } else if (scale > 1 && event.key === "ArrowLeft") {
      event.preventDefault()
      setView((current) => ({
        ...current,
        offset: { ...current.offset, x: current.offset.x + panDistance },
      }))
    } else if (scale > 1 && event.key === "ArrowRight") {
      event.preventDefault()
      setView((current) => ({
        ...current,
        offset: { ...current.offset, x: current.offset.x - panDistance },
      }))
    } else if (scale > 1 && event.key === "ArrowUp") {
      event.preventDefault()
      setView((current) => ({
        ...current,
        offset: { ...current.offset, y: current.offset.y + panDistance },
      }))
    } else if (scale > 1 && event.key === "ArrowDown") {
      event.preventDefault()
      setView((current) => ({
        ...current,
        offset: { ...current.offset, y: current.offset.y - panDistance },
      }))
    }
  }

  return (
    <Dialog
      open={incomingCard !== null}
      onOpenChange={(open) => {
        if (!open) closePreview()
      }}
    >
      <DialogContent
        finalFocus={finalFocus}
        showCloseButton={false}
        safeArea="viewport"
        overlayClassName="bg-background/85 supports-backdrop-filter:bg-background/45 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        className="grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none bg-background p-0 text-foreground ring-0 motion-reduce:animate-none data-open:zoom-in-100 data-closed:zoom-out-100"
        onKeyDown={handleKeyDown}
      >
        <header className="flex min-h-[calc(3.5rem+var(--safe-area-top))] min-w-0 items-center gap-3 pt-(--safe-area-top) pr-[calc(0.75rem+var(--safe-area-right))] pl-[calc(0.75rem+var(--safe-area-left))]">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm text-foreground">
              制作人名片 <span className="sr-only">{card?.id}</span> · {label}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            名片大图预览，可在下方缩略图中切换页面
          </DialogDescription>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-foreground"
                aria-label="关闭名片预览"
                title="关闭"
              />
            }
          >
            <XIcon />
          </DialogClose>
        </header>

        <div
          ref={viewportRef}
          className={cn(
            "relative flex min-h-0 touch-none items-center justify-center overflow-hidden pr-[calc(0.75rem+var(--safe-area-right))] pl-[calc(0.75rem+var(--safe-area-left))]",
            scale > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          )}
          aria-label="名片查看区域"
          onDoubleClick={(event) => {
            if (
              event.target === event.currentTarget ||
              (event.target instanceof Element &&
                event.target.closest("button"))
            )
              return
            updateScale((current) => (current === 1 ? 2 : 1))
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={(event) => {
            pointersRef.current.delete(event.pointerId)
            if (pointersRef.current.size < 2) pinchRef.current = null
            pointerRef.current = null
            setDragging(false)
          }}
          onLostPointerCapture={(event) => {
            pointersRef.current.delete(event.pointerId)
            if (pointersRef.current.size < 2) pinchRef.current = null
            pointerRef.current = null
            setDragging(false)
          }}
          onWheel={(event) => {
            event.preventDefault()
            zoomAt({ x: event.clientX, y: event.clientY }, (current) =>
              event.ctrlKey
                ? current * Math.max(0.5, 1 - event.deltaY * 0.01)
                : current + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)
            )
          }}
        >
          {imageState === "loading" ? (
            <p
              className="pointer-events-none absolute text-sm text-muted-foreground"
              role="status"
            >
              正在载入{label}…
            </p>
          ) : null}
          {imageState === "error" ? (
            <div className="absolute flex flex-col items-center gap-2 px-4 text-center">
              <p role="alert" className="text-sm text-destructive">
                这张图片暂时无法显示
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setImageState("loading")
                  setRetry((current) => current + 1)
                }}
              >
                重试加载图片
              </Button>
            </div>
          ) : null}
          {card ? (
            <CardImage
              key={`${identity}:${retry}`}
              src={src}
              alt={`制作人名片 ${card.id} ${label}`}
              draggable={false}
              className={cn(
                "max-h-full max-w-full object-contain select-none",
                dragging
                  ? ""
                  : "transition-transform duration-(--duration-fast) motion-reduce:transition-none",
                imageState === "error" ? "invisible" : ""
              )}
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) ${
                  rotation ? `rotate(${rotation}deg) ` : ""
                }scale(${scale})`,
              }}
              onLoad={() => setImageState("ready")}
              onError={() => setImageState("error")}
            />
          ) : null}
        </div>

        <footer className="flex flex-col items-center gap-2 border-t pt-2 pr-[calc(0.75rem+var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[calc(0.75rem+var(--safe-area-left))]">
          {/* 单页与多页都靠这一条切换，不再假设只有正反两面。 */}
          <div
            className="flex w-full snap-x items-center justify-center gap-2 overflow-x-auto"
            aria-label="名片页面"
          >
            {pages.map((entry, entryIndex) => (
              <button
                key={entry.key}
                type="button"
                aria-label={`查看第 ${entryIndex + 1} 张（${entry.label}）`}
                aria-pressed={entryIndex === position}
                className={cn(
                  "size-14 shrink-0 snap-center overflow-hidden rounded-md border-2 bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  entryIndex === position
                    ? "border-primary"
                    : "border-transparent opacity-70 hover:opacity-100"
                )}
                onClick={() => selectPage(entryIndex)}
              >
                <CardImage
                  src={entry.thumb}
                  alt=""
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>

          <div className="flex w-full items-center justify-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="向左旋转名片"
                title="向左旋转"
                onClick={() => rotateView(-90)}
              >
                <RotateCcwIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="缩小名片"
                title="缩小"
                disabled={scale <= MIN_SCALE}
                onClick={() => updateScale((current) => current - SCALE_STEP)}
              >
                <ZoomOutIcon />
              </Button>
              <output
                className="w-12 text-center text-xs text-muted-foreground tabular-nums"
                aria-live="polite"
              >
                {Math.round(scale * 100)}%
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="放大名片"
                title="放大"
                disabled={scale >= MAX_SCALE}
                onClick={() => updateScale((current) => current + SCALE_STEP)}
              >
                <ZoomInIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="向右旋转名片"
                title="向右旋转"
                onClick={() => rotateView(90)}
              >
                <RotateCwIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-1 min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="复位名片"
                title="复位"
                disabled={
                  scale === 1 &&
                  offset.x === 0 &&
                  offset.y === 0 &&
                  rotation === 0
                }
                onClick={resetView}
              >
                <ScanIcon />
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
