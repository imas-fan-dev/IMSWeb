import { useEffect, useRef, useState } from "react"

/**
 * Pull-to-refresh over the window scroller.
 *
 * Touch-only by construction. The gesture is driven from `touchstart` and
 * `touchmove`, so it exists on the phone builds (mobile web and the Tauri
 * app) and costs a mouse pointer nothing; desktop keeps its explicit refresh
 * control instead.
 *
 * The hook reports distance rather than moving anything itself. Callers
 * translate their own content, which keeps the gesture out of layout: a
 * `transform` never shifts `offsetTop`, so the window virtualizer's
 * `scrollMargin` stays valid while the band is open.
 */
export type PullToRefreshStatus =
  | "idle"
  | "pulling"
  | "armed"
  | "refreshing"
  | "settling"

/** Pull distance, in CSS pixels, that arms a refresh. */
export const PULL_TO_REFRESH_THRESHOLD = 72

/** Hard stop for the rubber band, so the list never leaves the viewport. */
const MAX_PULL_DISTANCE = 120

/** Share of finger travel the band follows before the threshold. */
const PULL_RESISTANCE = 0.6

/** Share of finger travel the band follows past it, so the stop reads soft. */
const OVERPULL_RESISTANCE = 0.3

/** How long the settled state stays up before the band retracts. */
const SETTLE_DURATION_MS = 400

function bandDistance(travel: number) {
  const followed = travel * PULL_RESISTANCE
  if (followed <= PULL_TO_REFRESH_THRESHOLD) return followed
  return Math.min(
    MAX_PULL_DISTANCE,
    PULL_TO_REFRESH_THRESHOLD +
      (followed - PULL_TO_REFRESH_THRESHOLD) * OVERPULL_RESISTANCE
  )
}

type PullToRefreshOptions = {
  onRefresh: () => void | Promise<void>
  /** Turns the gesture off while the page has no list to pull on. */
  enabled?: boolean
}

export function usePullToRefresh({
  onRefresh,
  enabled = true,
}: PullToRefreshOptions) {
  const [status, setStatus] = useState<PullToRefreshStatus>("idle")
  const [distance, setDistance] = useState(0)

  const onRefreshRef = useRef(onRefresh)
  const statusRef = useRef<PullToRefreshStatus>("idle")
  const distanceRef = useRef(0)
  const startYRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled) return

    const applyStatus = (next: PullToRefreshStatus) => {
      if (statusRef.current === next) return
      statusRef.current = next
      setStatus(next)
    }

    const applyDistance = (next: number) => {
      if (distanceRef.current === next) return
      distanceRef.current = next
      setDistance(next)
    }

    const release = () => {
      startYRef.current = null
      applyDistance(0)
      applyStatus("idle")
    }

    const handleTouchStart = (event: TouchEvent) => {
      const settling =
        statusRef.current === "refreshing" || statusRef.current === "settling"
      if (settling || event.touches.length !== 1) return
      // Anything but a resting scroller belongs to the page, not the gesture.
      if (window.scrollY > 0) return
      startYRef.current = event.touches[0]?.clientY ?? null
    }

    const handleTouchMove = (event: TouchEvent) => {
      const startY = startYRef.current
      if (startY === null) return
      if (event.touches.length !== 1) {
        release()
        return
      }

      const clientY = event.touches[0]?.clientY
      if (clientY === undefined) return
      const travel = clientY - startY

      // An upward drag, or a page that scrolled off the top mid-gesture, hands
      // the touch back to the native scroller rather than fighting it.
      if (travel <= 0 || window.scrollY > 0) {
        applyDistance(0)
        applyStatus("idle")
        if (window.scrollY > 0) startYRef.current = null
        return
      }

      // Suppress the browser's own overscroll (the iOS rubber band, Chrome's
      // native pull-to-refresh) so only one affordance is ever on screen.
      if (event.cancelable) event.preventDefault()

      const next = bandDistance(travel)
      applyDistance(next)
      applyStatus(next >= PULL_TO_REFRESH_THRESHOLD ? "armed" : "pulling")
    }

    const handleTouchEnd = () => {
      if (startYRef.current === null) return
      startYRef.current = null

      if (statusRef.current !== "armed") {
        applyDistance(0)
        applyStatus("idle")
        return
      }

      // Hold the band open at the threshold for the length of the request, so
      // the spinner has somewhere to sit.
      applyDistance(PULL_TO_REFRESH_THRESHOLD)
      applyStatus("refreshing")

      void (async () => {
        try {
          await onRefreshRef.current()
        } finally {
          applyStatus("settling")
          applyDistance(0)
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null
            if (statusRef.current === "settling") applyStatus("idle")
          }, SETTLE_DURATION_MS)
        }
      })()
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true })
    // Not passive: the move handler has to cancel the native overscroll.
    window.addEventListener("touchmove", handleTouchMove, { passive: false })
    window.addEventListener("touchend", handleTouchEnd, { passive: true })
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener("touchstart", handleTouchStart)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
      window.removeEventListener("touchcancel", handleTouchEnd)
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      // Losing the listeners mid-gesture would otherwise strand an open band.
      startYRef.current = null
      statusRef.current = "idle"
      distanceRef.current = 0
      setStatus("idle")
      setDistance(0)
    }
  }, [enabled])

  // Reported as resting whenever the gesture is off, so a caller that disables
  // it mid-pull never has to wait for the cleanup to land.
  const reportedStatus: PullToRefreshStatus = enabled ? status : "idle"
  const reportedDistance = enabled ? distance : 0

  return {
    status: reportedStatus,
    distance: reportedDistance,
    progress: Math.min(1, reportedDistance / PULL_TO_REFRESH_THRESHOLD),
    /** True while the finger is down, so callers can drop their transition. */
    dragging: reportedStatus === "pulling" || reportedStatus === "armed",
  }
}
