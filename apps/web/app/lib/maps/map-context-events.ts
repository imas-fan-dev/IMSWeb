import type { MapScreenPoint } from "./map-engine"

const interactive =
  "button, a, input, textarea, select, [role=button], [role=dialog], [data-map-interactive], .mapboxgl-control-container, .maplibregl-control-container, .amap-controls"

/** Own only background gestures; retain the map engine's pan and pinch handling. */
export function createMapContextEvents(
  container: HTMLElement,
  onOpen: (point: MapScreenPoint) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin: { id: number; x: number; y: number } | null = null
  let suppressUntil = 0
  const cancel = () => {
    clearTimeout(timer)
    origin = null
  }
  const eligible = (event: Event) =>
    event.target instanceof Element && !event.target.closest(interactive)
  const open = (x: number, y: number) => {
    const rect = container.getBoundingClientRect()
    onOpen({ x: x - rect.left, y: y - rect.top })
  }
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || origin || !eligible(event)) {
      cancel()
      return
    }
    if (event.pointerType === "mouse" || event.button !== 0) return
    origin = { id: event.pointerId, x: event.clientX, y: event.clientY }
    timer = setTimeout(() => {
      if (!origin) return
      suppressUntil = Date.now() + 1000
      open(origin.x, origin.y)
      cancel()
    }, 550)
  }
  const move = (event: PointerEvent) => {
    if (
      origin &&
      (event.pointerId !== origin.id ||
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10)
    )
      cancel()
  }
  const context = (event: MouseEvent) => {
    if (!eligible(event)) return
    event.preventDefault()
    if (Date.now() < suppressUntil) return
    cancel()
    open(event.clientX, event.clientY)
  }
  const click = (event: MouseEvent) => {
    if (Date.now() >= suppressUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  container.addEventListener("pointerdown", down, true)
  window.addEventListener("pointermove", move, true)
  window.addEventListener("pointerup", cancel, true)
  window.addEventListener("pointercancel", cancel, true)
  window.addEventListener("blur", cancel)
  document.addEventListener("visibilitychange", cancel)
  container.addEventListener("wheel", cancel, { passive: true })
  container.addEventListener("contextmenu", context, true)
  container.addEventListener("click", click, true)
  return () => {
    cancel()
    container.removeEventListener("pointerdown", down, true)
    window.removeEventListener("pointermove", move, true)
    window.removeEventListener("pointerup", cancel, true)
    window.removeEventListener("pointercancel", cancel, true)
    window.removeEventListener("blur", cancel)
    document.removeEventListener("visibilitychange", cancel)
    container.removeEventListener("wheel", cancel)
    container.removeEventListener("contextmenu", context, true)
    container.removeEventListener("click", click, true)
  }
}
