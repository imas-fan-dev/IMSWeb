import type { MapMarker } from "./map-engine"

export function assertMapActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Map session closed", "AbortError")
}

/** Owns readiness, late async work and native resources for one open view. */
export function createMapLifecycle(signal: AbortSignal, dispose: () => void) {
  let closed = false
  let ready = false
  let resolve!: () => void
  let reject!: (error: Error) => void
  const pending = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  // Setup may throw before the adapter reaches its readiness await.
  void pending.catch(() => {})
  const markers = new Set<MapMarker>()
  const close = () => {
    if (closed) return
    closed = true
    signal.removeEventListener("abort", close)
    for (const marker of markers) marker.remove()
    markers.clear()
    try {
      dispose()
    } finally {
      if (!ready) reject(new DOMException("Map session closed", "AbortError"))
    }
  }
  signal.addEventListener("abort", close, { once: true })
  if (signal.aborted) close()
  return {
    ready: pending,
    get active() {
      return !closed
    },
    assertActive() {
      if (closed) throw new DOMException("Map session closed", "AbortError")
    },
    complete() {
      if (closed || ready) return
      ready = true
      resolve()
    },
    ownMarker(remove: () => void): MapMarker {
      this.assertActive()
      let removed = false
      const marker = {
        remove() {
          if (removed) return
          removed = true
          markers.delete(marker)
          remove()
        },
      }
      markers.add(marker)
      return marker
    },
    close,
  }
}
