import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
} from "react"
import { RotateCcwIcon, MoveIcon } from "lucide-react"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export type WallBounds = [number, number, number, number]
export interface WallCamera {
  x: number
  y: number
  scale: number
}
export interface WallFocus {
  cardId?: string
  x: number
  y: number
  key: number
  scale?: number
}
interface WallInteraction {
  wasSelected: boolean
}
interface Props {
  children: (camera: WallCamera, interaction: WallInteraction) => ReactNode
  focus?: WallFocus | null
  editing?: boolean
  onRegionChange?: (bounds: WallBounds) => void
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n))

const minimumScale = (width: number, height: number) =>
  Math.max(0.25, width / 4200, height / 2300)

export function WallViewport({
  children,
  focus,
  editing = false,
  onRegionChange,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 960, height: 540 })
  const [camera, setCamera] = useState<WallCamera>({
    x: focus?.x ?? 800,
    y: focus?.y ?? 450,
    scale: focus?.scale ?? 0.8,
  })
  const [panning, setPanning] = useState(false)
  const [selected, setSelected] = useState(false)
  const [selectedBeforePointerDown, setSelectedBeforePointerDown] =
    useState(false)
  const touchTargets = useRef(new Map<number, HTMLElement>())
  const touchGesture = useRef<{
    camera: WallCamera
    x: number
    y: number
    distance: number
  } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    camera: WallCamera
    x: number
    y: number
    distance: number
  } | null>(null)
  const initialized = useRef(false)
  const initialFocus = useRef(focus)
  const previousEditing = useRef(editing)
  useEffect(() => {
    if (previousEditing.current && !editing)
      viewport.current?.focus({ preventScroll: true })
    previousEditing.current = editing
  }, [editing])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth || 960
      const height = element.clientHeight || 540
      setSize({ width, height })
      const minimum = minimumScale(width, height)
      if (!initialized.current) {
        initialized.current = true
        setCamera({
          x: initialFocus.current?.x ?? 800,
          y: initialFocus.current?.y ?? 450,
          scale: clamp(initialFocus.current?.scale ?? 0.8, minimum, 2),
        })
      } else {
        setCamera((current) =>
          current.scale < minimum ? { ...current, scale: minimum } : current
        )
      }
    }
    measure()
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const minScale = minimumScale(size.width, size.height)
  const [appliedFocus, setAppliedFocus] = useState(focus)
  if (focus !== appliedFocus) {
    setAppliedFocus(focus)
    if (focus) {
      setCamera((current) => ({
        ...current,
        x: focus.x,
        y: focus.y,
        scale: clamp(focus.scale ?? current.scale, minScale, 2),
      }))
    }
  }
  useEffect(() => {
    const halfWidth = size.width / camera.scale / 2
    const halfHeight = size.height / camera.scale / 2
    onRegionChange?.([
      clamp(camera.x - halfWidth, -1_000_000, 999_999),
      clamp(camera.y - halfHeight, -1_000_000, 999_999),
      clamp(camera.x + halfWidth, -999_999, 1_000_000),
      clamp(camera.y + halfHeight, -999_999, 1_000_000),
    ])
  }, [camera, size, onRegionChange])

  function anchor(nextCamera = camera) {
    const values = [...pointers.current.values()]
    if (!values.length) {
      gesture.current = null
      return
    }
    const a = values[0],
      b = values[1] ?? a
    gesture.current = {
      camera: nextCamera,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: b === a ? 0 : Math.hypot(a.x - b.x, a.y - b.y),
    }
  }
  function down(event: PointerEvent<HTMLDivElement>, includeContent = false) {
    if (
      event.button !== 0 ||
      event.pointerType === "touch" ||
      (!includeContent &&
        (event.target as HTMLElement).closest("button, a, [data-card-id]"))
    )
      return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
    anchor()
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    const values = [...pointers.current.values()]
    const a = values[0],
      b = values[1] ?? a,
      start = gesture.current
    const scale =
      start.distance > 0
        ? clamp(
            (start.camera.scale * Math.hypot(a.x - b.x, a.y - b.y)) /
              start.distance,
            minScale,
            2
          )
        : start.camera.scale
    const bounds = viewport.current!.getBoundingClientRect()
    const centerX = bounds.left + size.width / 2
    const centerY = bounds.top + size.height / 2
    setCamera({
      x: clamp(
        start.camera.x +
          (start.x - centerX) / start.camera.scale -
          ((a.x + b.x) / 2 - centerX) / scale,
        -999_000,
        999_000
      ),
      y: clamp(
        start.camera.y +
          (start.y - centerY) / start.camera.scale -
          ((a.y + b.y) / 2 - centerY) / scale,
        -999_000,
        999_000
      ),
      scale,
    })
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    anchor(camera)
  }
  useEffect(() => {
    const element = viewport.current
    if (!element) return

    function zoom(event: WheelEvent) {
      if (!selected || !event.deltaY) return
      event.preventDefault()
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1)
      const bounds = element!.getBoundingClientRect()
      const offsetX = event.clientX - bounds.left - size.width / 2
      const offsetY = event.clientY - bounds.top - size.height / 2
      setCamera((current) => {
        const scale = clamp(
          current.scale * Math.exp(-delta * 0.0015),
          minScale,
          2
        )
        return {
          x: clamp(
            current.x + offsetX / current.scale - offsetX / scale,
            -999_000,
            999_000
          ),
          y: clamp(
            current.y + offsetY / current.scale - offsetY / scale,
            -999_000,
            999_000
          ),
          scale,
        }
      })
    }
    function deselect(event: globalThis.PointerEvent) {
      if (!element!.contains(event.target as Node)) setSelected(false)
    }
    element.addEventListener("wheel", zoom, { passive: false })
    document.addEventListener("pointerdown", deselect)
    return () => {
      element.removeEventListener("wheel", zoom)
      document.removeEventListener("pointerdown", deselect)
    }
  }, [selected, minScale, size])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    function start(event: TouchEvent) {
      if (event.touches.length < (panning ? 1 : 2)) return
      event.preventDefault()
      // End a card drag before a second finger starts moving the camera.
      for (const [id, target] of touchTargets.current) {
        if (target.hasPointerCapture(id)) target.releasePointerCapture(id)
      }
      const a = event.touches[0],
        b = event.touches[1] ?? a
      touchGesture.current = {
        camera,
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
        distance:
          b === a
            ? 0
            : Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      }
    }
    function moveTouch(event: TouchEvent) {
      const start = touchGesture.current
      if (!start || event.touches.length < (panning ? 1 : 2)) return
      event.preventDefault()
      const a = event.touches[0],
        b = event.touches[1] ?? a
      const scale =
        start.distance > 0 && b !== a
          ? clamp(
              (start.camera.scale *
                Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) /
                start.distance,
              minScale,
              2
            )
          : start.camera.scale
      const bounds = element!.getBoundingClientRect()
      const centerX = bounds.left + size.width / 2
      const centerY = bounds.top + size.height / 2
      setCamera({
        x: clamp(
          start.camera.x +
            (start.x - centerX) / start.camera.scale -
            ((a.clientX + b.clientX) / 2 - centerX) / scale,
          -999_000,
          999_000
        ),
        y: clamp(
          start.camera.y +
            (start.y - centerY) / start.camera.scale -
            ((a.clientY + b.clientY) / 2 - centerY) / scale,
          -999_000,
          999_000
        ),
        scale,
      })
    }
    function endTouch(event: TouchEvent) {
      touchGesture.current = null
      if (panning && event.touches.length) start(event)
    }
    function cancelTouch() {
      touchGesture.current = null
    }
    element.addEventListener("touchstart", start, { passive: false })
    element.addEventListener("touchmove", moveTouch, { passive: false })
    element.addEventListener("touchend", endTouch, { passive: false })
    element.addEventListener("touchcancel", cancelTouch)
    return () => {
      element.removeEventListener("touchstart", start)
      element.removeEventListener("touchmove", moveTouch)
      element.removeEventListener("touchend", endTouch)
      element.removeEventListener("touchcancel", cancelTouch)
    }
  }, [camera, minScale, panning, size])
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-2"
        role="toolbar"
        aria-label="墙面观察工具"
      >
        <Button
          variant={panning ? "secondary" : "outline"}
          aria-pressed={panning}
          onClick={() => setPanning(!panning)}
        >
          <MoveIcon aria-hidden="true" />
          平移墙面
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setCamera({
              x: 800,
              y: 450,
              scale: clamp(0.8, minScale, 2),
            })
          }
        >
          <RotateCcwIcon aria-hidden="true" />
          复位
        </Button>
        <span className="text-xs text-muted-foreground">
          {panning
            ? "拖动画布平移；手机双指缩放，电脑选中墙面后滚轮缩放"
            : "手机双指缩放；电脑点击墙面后滚轮缩放"}
        </span>
      </div>
      <div
        ref={viewport}
        className={cn(
          "relative isolate h-112 overflow-hidden border bg-muted/40 select-none sm:h-136",
          panning && "cursor-grab active:cursor-grabbing",
          selected && "border-primary"
        )}
        style={{ touchAction: panning ? "none" : "pan-y" }}
        aria-label="名片墙放置区域"
        onDragStart={(event) => event.preventDefault()}
        onKeyDownCapture={(event) => {
          if (event.key === "Enter" || event.key === " ")
            setSelectedBeforePointerDown(selected)
        }}
        onFocusCapture={() => setSelected(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setSelected(false)
        }}
        onPointerDownCapture={(event) => {
          setSelectedBeforePointerDown(selected)
          setSelected(true)
          if (event.pointerType === "touch") {
            const target =
              (event.target as HTMLElement).closest("button") ??
              event.currentTarget
            touchTargets.current.set(event.pointerId, target)
            if (panning || touchGesture.current) {
              event.preventDefault()
              event.stopPropagation()
            }
          } else if (!(event.target as HTMLElement).closest("button, a")) {
            event.currentTarget.focus({ preventScroll: true })
          }
        }}
        onPointerMoveCapture={(event) => {
          if (event.pointerType === "touch" && touchGesture.current)
            event.stopPropagation()
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUpCapture={(event) =>
          touchTargets.current.delete(event.pointerId)
        }
        onPointerCancelCapture={(event) =>
          touchTargets.current.delete(event.pointerId)
        }
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (["+", "=", "-"].includes(event.key)) {
            event.preventDefault()
            setCamera((current) => ({
              ...current,
              scale: clamp(
                current.scale * (event.key === "-" ? 0.8 : 1.25),
                minScale,
                2
              ),
            }))
            return
          }
          const delta = {
            ArrowLeft: [-100, 0],
            ArrowRight: [100, 0],
            ArrowUp: [0, -100],
            ArrowDown: [0, 100],
          }[event.key]
          if (delta) {
            event.preventDefault()
            setCamera((c) => ({
              ...c,
              x: clamp(c.x + delta[0], -999_000, 999_000),
              y: clamp(c.y + delta[1], -999_000, 999_000),
            }))
          }
        }}
        tabIndex={0}
        role="region"
      >
        <div
          className="absolute inset-0 z-0"
          data-wall-camera-x={camera.x}
          data-wall-camera-y={camera.y}
          data-wall-scale={camera.scale}
          style={{
            transformOrigin: "0 0",
            transform: `translate(${size.width / 2 - camera.x * camera.scale}px, ${size.height / 2 - camera.y * camera.scale}px) scale(${camera.scale})`,
          }}
        >
          {children(camera, {
            wasSelected: selectedBeforePointerDown,
          })}
        </div>
      </div>
    </div>
  )
}
