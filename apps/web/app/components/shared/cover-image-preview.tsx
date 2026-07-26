import { RotateCcwIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"

const MIN_SCALE = 0.5
const MAX_SCALE = 4
const SCALE_STEP = 0.25
const PAN_STEP = 32

type Point = {
  x: number
  y: number
}

type DragState = {
  pointerId: number
  start: Point
  origin: Point
}

type ViewState = {
  scale: number
  offset: Point
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function CoverImagePreview({
  src,
  alt,
  className,
  imageClassName,
  loading = "lazy",
}: {
  src: string
  alt: string
  className?: string
  imageClassName?: string
  loading?: React.ImgHTMLAttributes<HTMLImageElement>["loading"]
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewState>({
    scale: 1,
    offset: { x: 0, y: 0 },
  })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const { scale, offset } = view

  function resetView() {
    setView({ scale: 1, offset: { x: 0, y: 0 } })
    dragRef.current = null
    setDragging(false)
  }

  function updateScale(getNextScale: (currentScale: number) => number) {
    setView((current) => {
      const nextScale = clampScale(getNextScale(current.scale))
      return {
        scale: nextScale,
        offset: nextScale <= 1 ? { x: 0, y: 0 } : current.offset,
      }
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) resetView()
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (scale <= 1) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    }
    setDragging(true)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView((current) => ({
      ...current,
      offset: {
        x: drag.origin.x + event.clientX - drag.start.x,
        y: drag.origin.y + event.clientY - drag.start.y,
      },
    }))
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "group relative block shrink-0 overflow-hidden rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              className
            )}
            aria-label={`查看${alt}`}
            title="查看大图"
          />
        }
      >
        <img
          src={src}
          alt=""
          loading={loading}
          className={cn("size-full object-cover", imageClassName)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-colors group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
          <ZoomInIcon className="size-5 drop-shadow-sm" aria-hidden="true" />
        </span>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-background/85 supports-backdrop-filter:bg-background/45 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        className="top-0 left-0 grid h-svh max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none bg-transparent p-0 text-foreground ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
        onKeyDown={handleKeyDown}
      >
        <header className="flex h-16 min-w-0 items-center gap-3 px-4 sm:px-6">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm text-foreground drop-shadow-sm">
            {alt}
          </DialogTitle>
          <DialogDescription className="sr-only">
            活动封面大图预览
          </DialogDescription>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="border border-foreground/10 bg-background/30 text-foreground shadow-sm backdrop-blur-xl hover:bg-background/55 hover:text-foreground"
                aria-label="关闭封面预览"
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
          aria-label="封面查看区域"
          onDoubleClick={() =>
            updateScale((current) => (current === 1 ? 2 : 1))
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={(event) => {
            event.preventDefault()
            updateScale(
              (current) =>
                current + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)
            )
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={cn(
              "size-full object-contain drop-shadow-[0_18px_40px_rgb(0_0_0/0.2)] will-change-transform select-none",
              dragging ? "" : "transition-transform duration-150"
            )}
            style={{
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            }}
          />
        </div>

        <footer className="flex h-20 items-center justify-center px-3">
          <div className="flex items-center gap-1 rounded-lg border border-foreground/10 bg-background/35 p-1 shadow-lg backdrop-blur-xl">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-foreground hover:bg-background/55 hover:text-foreground"
              aria-label="缩小封面"
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
              className="text-foreground hover:bg-background/55 hover:text-foreground"
              aria-label="放大封面"
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
              className="ml-2 text-foreground hover:bg-background/55 hover:text-foreground"
              aria-label="复位封面"
              title="复位"
              disabled={scale === 1 && offset.x === 0 && offset.y === 0}
              onClick={resetView}
            >
              <RotateCcwIcon />
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
