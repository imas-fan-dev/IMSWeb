import {
  RotateCcwIcon,
  SwitchCameraIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
type ViewState = { scale: number; offset: Point }
type PointerState = {
  pointerId: number
  start: Point
  origin: Point
  startedOnBackdrop: boolean
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
}: {
  card: Namecard | null
  side: NamecardSide
  onSideChange: (side: NamecardSide) => void
  onOpenChange: (open: boolean) => void
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
  const { scale, offset } = view
  const src =
    side === "front" ? (card?.image1_url ?? "") : (card?.image2_url ?? "")

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
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointerRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
      startedOnBackdrop: event.target === event.currentTarget,
    }
    if (scale > 1) setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId || scale <= 1) return
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
        showCloseButton={false}
        overlayClassName="bg-background/85 supports-backdrop-filter:bg-background/45 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        className="top-0 left-0 grid h-svh max-h-none w-screen max-w-none translate-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none bg-transparent p-0 text-foreground ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
        onKeyDown={handleKeyDown}
      >
        <header className="flex h-16 min-w-0 items-center gap-3 px-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm text-foreground drop-shadow-sm">
            制作人名片 {card?.id} · {sideLabel(side)}
          </DialogTitle>
          <DialogDescription className="sr-only">
            双面名片大图预览，可切换正面和背面
          </DialogDescription>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-foreground/10 bg-background/30 text-foreground shadow-sm backdrop-blur-xl hover:bg-background/55 hover:text-foreground"
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
            "relative flex min-h-0 touch-none items-center justify-center overflow-hidden px-3 sm:px-8",
            scale > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
          )}
          aria-label="名片查看区域"
          onDoubleClick={(event) => {
            if (event.target === event.currentTarget) return
            updateScale((current) => (current === 1 ? 2 : 1))
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={() => {
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
            <p className="pointer-events-none absolute text-sm text-destructive">
              这张图片暂时无法显示
            </p>
          ) : null}
          {card ? (
            <img
              src={src}
              alt={`制作人名片 ${card.id} ${sideLabel(side)}`}
              draggable={false}
              className={cn(
                "max-h-full max-w-full object-contain drop-shadow-[0_18px_40px_rgb(0_0_0/0.2)] will-change-transform select-none",
                dragging ? "" : "transition-transform duration-150",
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

        <footer className="flex min-h-20 flex-wrap items-center justify-center gap-2 px-3 py-2">
          <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-background/35 p-1 shadow-lg backdrop-blur-xl">
            {(["front", "back"] as const).map((nextSide) => (
              <Button
                key={nextSide}
                type="button"
                variant={side === nextSide ? "secondary" : "ghost"}
                className="min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
                aria-pressed={side === nextSide}
                onClick={() => changeSide(nextSide)}
              >
                {sideLabel(nextSide)}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-background/35 p-1 shadow-lg backdrop-blur-xl">
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
              className="w-16 text-center text-xs text-muted-foreground tabular-nums"
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-1 min-h-11 min-w-11 text-foreground hover:bg-background/55 hover:text-foreground"
              aria-label={`切换到${side === "front" ? "背面" : "正面"}`}
              title="切换正反面"
              onClick={() => changeSide(side === "front" ? "back" : "front")}
            >
              <SwitchCameraIcon />
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
