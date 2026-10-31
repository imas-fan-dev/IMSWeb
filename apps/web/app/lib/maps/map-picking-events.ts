/** One physical gesture may emit dragend followed by a compatibility click. */
export function createMapPickingEvents(container: HTMLElement) {
  let gesture = 0
  let dragging = false
  let draggedGesture: number | null = null
  let disposed = false
  const begin = () => {
    gesture++
  }
  container.addEventListener("pointerdown", begin, true)
  return {
    shouldPick(event?: Event) {
      if (disposed || dragging || draggedGesture === gesture) return false
      if (event?.defaultPrevented) return false
      const target = event?.target
      if (
        target instanceof Element &&
        target.closest(
          "[data-map-point-picker], .mapboxgl-marker, .maplibregl-marker, .amap-marker, .mapboxgl-ctrl, .maplibregl-ctrl, .amap-control, button, a, input, select, textarea, [role=button]"
        )
      )
        return false
      return true
    },
    startDrag() {
      dragging = true
    },
    endDrag() {
      dragging = false
      draggedGesture = gesture
    },
    dispose() {
      disposed = true
      container.removeEventListener("pointerdown", begin, true)
    },
  }
}
