import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RotateCcwIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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

export type NamecardPreviewNavigation = {
  position: number
  total: number
  canPrevious: boolean
  canNext: boolean
  pending: boolean
  error: string | null
  onPrevious: () => void
  onNext: () => void
  onRetry: () => void
}

type Point = { x: number; y: number }
type ViewState = { scale: number; offset: Point }
type PointerState = {
  pointerId: number
  start: Point
  origin: Point
  startedOnBackdrop: boolean
  moved: boolean
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function sideLabel(side: NamecardSide) {
  return side === "front" ? "正面" : "背面"
}

export function NamecardPreview({
  card,
  side,
  onSideChange,
  onOpenChange,
  navigation,
  onReturnFocus,
}: {
  card: Namecard | null
  side: NamecardSide
  onSideChange: (side: NamecardSide) => void
  onOpenChange: (open: boolean) => void
  navigation?: NamecardPreviewNavigation
  onReturnFocus?: () => void
}) {
  const [view, setView] = useState<ViewState>({
    scale: 1,
    offset: { x: 0, y: 0 },
  })
  const [dragging, setDragging] = useState(false)
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">(
    "loading"
  )
  const pointerRef = useRef<PointerState | null>(null)
  const [retry, setRetry] = useState(0)
  const { scale, offset } = view
  const src =
    side === "front" ? (card?.image1_url ?? "") : (card?.image2_url ?? "")
  const identity = `${card?.id}:${side}:${src}`
  const [displayedIdentity, setDisplayedIdentity] = useState(identity)
  if (displayedIdentity !== identity) {
    setDisplayedIdentity(identity)
    setView({ scale: 1, offset: { x: 0, y: 0 } })
    setDragging(false)
    setImageState("loading")
    setRetry(0)
  }
  useLayoutEffect(() => {
    pointerRef.current = null
  }, [identity])

  function resetView() {
    setView({ scale: 1, offset: { x: 0, y: 0 } })
    pointerRef.current = null
    setDragging(false)
  }

  useEffect(() => {
    if (!card) return
    const image = new Image()
    image.src = side === "front" ? card.image2_url : card.image1_url
  }, [card, side])

  function updateScale(getNextScale: (currentScale: number) => number) {
    setView((current) => {
      const nextScale = clampScale(getNextScale(current.scale))
      return {
        scale: nextScale,
        offset: nextScale <= 1 ? { x: 0, y: 0 } : current.offset,
      }
    })
  }

  function changeSide(nextSide: NamecardSide) {
    if (nextSide === side) return
    resetView()
    setImageState("loading")
    onSideChange(nextSide)
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
    pointerRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
      startedOnBackdrop: event.target === event.currentTarget,
      moved: false,
    }
    if (scale > 1) setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
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
      changeSide("front")
    } else if (scale <= 1 && event.key === "ArrowRight") {
      event.preventDefault()
      changeSide("back")
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
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) closePreview()
      }}
    >
      <DialogContent
        finalFocus={
          onReturnFocus
            ? () => {
                onReturnFocus()
                return false
              }
            : undefined
        }
        showCloseButton={false}
        safeArea="viewport"
        overlayClassName="bg-background/85 supports-backdrop-filter:bg-background/45 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        className="grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none bg-background p-0 text-foreground ring-0 motion-reduce:animate-none data-open:zoom-in-100 data-closed:zoom-out-100"
        onKeyDown={handleKeyDown}
      >
        <header className="flex min-h-[calc(3.5rem+var(--safe-area-top))] min-w-0 items-center gap-3 pt-(--safe-area-top) pr-[calc(0.75rem+var(--safe-area-right))] pl-[calc(0.75rem+var(--safe-area-left))]">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm text-foreground">
              制作人名片 <span className="sr-only">{card?.id}</span> ·{" "}
              {sideLabel(side)}
            </DialogTitle>
            {navigation ? (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                第 {navigation.position} / {navigation.total} 张
              </p>
            ) : null}
          </div>
          <DialogDescription className="sr-only">
            双面名片大图预览，可切换正面和背面
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
          onPointerCancel={() => {
            pointerRef.current = null
            setDragging(false)
          }}
          onLostPointerCapture={() => {
            pointerRef.current = null
            setDragging(false)
          }}
          onWheel={(event) => {
            event.preventDefault()
            updateScale(
              (current) =>
                current + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)
            )
          }}
        >
          {imageState === "loading" ? (
            <p
              className="pointer-events-none absolute text-sm text-muted-foreground"
              role="status"
            >
              正在载入{sideLabel(side)}…
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
            <img
              key={`${identity}:${retry}`}
              src={src}
              alt={`制作人名片 ${card.id} ${sideLabel(side)}`}
              draggable={false}
              className={cn(
                "max-h-full max-w-full object-contain select-none",
                dragging
                  ? ""
                  : "transition-transform duration-(--duration-fast) motion-reduce:transition-none",
                imageState === "error" ? "invisible" : ""
              )}
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
              }}
              onLoad={() => setImageState("ready")}
              onError={() => setImageState("error")}
            />
          ) : null}
        </div>

        <footer className="flex flex-col items-center gap-2 border-t pt-2 pr-[calc(0.75rem+var(--safe-area-right))] pb-[calc(0.5rem+var(--safe-area-bottom))] pl-[calc(0.75rem+var(--safe-area-left))]">
          {navigation?.pending ? (
            <p role="status" className="text-xs text-muted-foreground">
              正在读取名片…
            </p>
          ) : null}
          {navigation?.error ? (
            <div className="flex flex-wrap items-center justify-center gap-x-2">
              <p role="alert" className="text-xs text-destructive">
                {navigation.error}
              </p>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={navigation.onRetry}
              >
                重试加载名片
              </Button>
            </div>
          ) : null}
          <div className="flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <div className="flex items-center gap-1">
              {navigation ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="mr-2 size-11"
                  aria-label="上一张名片"
                  title="上一张名片"
                  disabled={!navigation.canPrevious || navigation.pending}
                  onClick={navigation.onPrevious}
                >
                  <ArrowLeftIcon />
                </Button>
              ) : null}
              {(["front", "back"] as const).map((nextSide) => (
                <Button
                  key={nextSide}
                  type="button"
                  variant={side === nextSide ? "secondary" : "ghost"}
                  className="min-h-11 min-w-11 text-foreground"
                  aria-pressed={side === nextSide}
                  onClick={() => changeSide(nextSide)}
                >
                  {sideLabel(nextSide)}
                </Button>
              ))}
              {navigation ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="ml-2 size-11"
                  aria-label="下一张名片"
                  title="下一张名片"
                  disabled={!navigation.canNext || navigation.pending}
                  onClick={navigation.onNext}
                >
                  <ArrowRightIcon />
                </Button>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
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
                className="ml-1 min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-label="复位名片"
                title="复位"
                disabled={scale === 1 && offset.x === 0 && offset.y === 0}
                onClick={resetView}
              >
                <RotateCcwIcon />
              </Button>
            </div>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
