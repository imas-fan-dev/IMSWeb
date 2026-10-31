import { GripIcon, LoaderCircleIcon } from "lucide-react"
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react"
import { Button } from "~/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"
import type { FudabaCardPlacement } from "~/lib/api"
import { cn } from "~/lib/utils"
import type { WallPlacement } from "./components/exchange-card-wall"

function fields(placement: FudabaCardPlacement): WallPlacement {
  return {
    x: placement.x,
    y: placement.y,
    rotation: placement.rotation,
    zIndex: placement.zIndex,
  }
}

function coordinate(value: number) {
  return Math.round(Math.min(1_000_000, Math.max(-1_000_000, value)) * 10) / 10
}

function same(left: WallPlacement, right: WallPlacement) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.rotation === right.rotation &&
    left.zIndex === right.zIndex
  )
}

export function useWallItemInteraction({
  placement,
  scale,
  canMove,
  selected,
  onSelect,
  onActivate,
  onPreview,
  onCommit,
}: {
  placement: FudabaCardPlacement
  scale: number
  canMove: boolean
  selected: boolean
  onSelect: () => void
  onActivate: () => boolean
  onPreview?: (placement: WallPlacement) => void
  onCommit?: (previous: FudabaCardPlacement, placement: WallPlacement) => void
}) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const suppressActivation = useRef(false)
  const drag = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    placement: FudabaCardPlacement
    latest: WallPlacement
  } | null>(null)

  function renderPosition(next: WallPlacement) {
    if (!elementRef.current) return
    elementRef.current.style.left = `${next.x}px`
    elementRef.current.style.top = `${next.y}px`
    elementRef.current.dataset.placementX = String(next.x)
    elementRef.current.dataset.placementY = String(next.y)
  }

  useEffect(() => {
    if (!canMove) {
      drag.current = null
      if (elementRef.current) {
        elementRef.current.style.left = `${placement.x}px`
        elementRef.current.style.top = `${placement.y}px`
        elementRef.current.dataset.placementX = String(placement.x)
        elementRef.current.dataset.placementY = String(placement.y)
      }
    }
  }, [canMove, placement.x, placement.y])

  function down(event: PointerEvent<HTMLButtonElement>) {
    if (!canMove || event.button !== 0) return
    suppressActivation.current = false
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      placement,
      latest: fields(placement),
    }
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    start.latest = {
      ...start.latest,
      x: coordinate(
        start.placement.x + (event.clientX - start.clientX) / scale
      ),
      y: coordinate(
        start.placement.y + (event.clientY - start.clientY) / scale
      ),
    }
    renderPosition(start.latest)
  }

  function up(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    drag.current = null
    onSelect()
    if (!same(fields(start.placement), start.latest)) {
      suppressActivation.current = true
      onPreview?.(start.latest)
      onCommit?.(start.placement, start.latest)
    }
  }

  function cancel(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    drag.current = null
    suppressActivation.current = true
    renderPosition(fields(start.placement))
  }

  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && drag.current) {
      drag.current = null
      suppressActivation.current = true
      renderPosition(fields(placement))
      return
    }
    if (!canMove) return
    const step = event.shiftKey ? 80 : 16
    const offset = {
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
    }[event.key]
    if (!offset) return
    event.preventDefault()
    onSelect()
    const next = {
      ...fields(placement),
      x: coordinate(placement.x + offset[0]),
      y: coordinate(placement.y + offset[1]),
    }
    if (same(fields(placement), next)) return
    onPreview?.(next)
    onCommit?.(placement, next)
  }

  const handleProps = {
    onPointerDown: down,
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: key,
  }
  return {
    elementRef,
    handleProps,
    triggerProps: {
      ...handleProps,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        suppressActivation.current = false
        if (selected) down(event)
      },
    },
    requestActivation: () => {
      if (suppressActivation.current) {
        suppressActivation.current = false
        return false
      }
      return onActivate()
    },
  }
}

export function WallMoveHandle({
  label,
  selected,
  pending,
  scale,
  canMove,
  onSelect,
  handlers,
}: {
  label: string
  selected: boolean
  pending: boolean
  scale: number
  canMove: boolean
  onSelect: () => void
  handlers: ReturnType<typeof useWallItemInteraction>["handleProps"]
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={selected ? "default" : "outline"}
            size="icon-sm"
            className={cn(
              "absolute -top-3 -left-3 touch-none shadow-sm",
              canMove && "cursor-grab active:cursor-grabbing"
            )}
            style={{
              transform: `scale(${1 / scale})`,
              transformOrigin: "center",
            }}
            aria-label={label}
            aria-pressed={selected}
            disabled={pending}
            onFocus={onSelect}
            {...handlers}
          >
            {pending ? (
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            ) : (
              <GripIcon aria-hidden="true" />
            )}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
