/**
 * Drop trailing slashes so `/wiki/` and `/wiki` compare equal, while leaving
 * the root path alone.
 */
export function normalizeAppPathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
}

/**
 * The exchange map owns its viewport and filter restoration. The App shell
 * renders it as a full-height pane, so window scroll restoration does not apply.
 */
export function isNonScrollingAppRoute(pathname: string) {
  return normalizeAppPathname(pathname) === "/community/exchange"
}

const APP_SCROLL_RESTORE_DEADLINE_MS = 5_000
const APP_SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  "Tab",
  " ",
])

export type AppScrollRestorationResult = "success" | "deadline" | "cancelled"

export interface AppScrollRestorationOptions {
  deadlineMs?: number
  onFinish?: (result: AppScrollRestorationResult) => void
}

function appDocumentScrollLimit() {
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0
  )
  return Math.max(0, documentHeight - window.innerHeight)
}

/**
 * Hold a restored position while content finishes loading. Height changes and
 * browser scroll anchoring can arrive after the target first becomes reachable.
 * Observation is bounded, and user input takes ownership immediately.
 */
export function beginAppScrollRestoration(
  requestedTop: number,
  options: AppScrollRestorationOptions = {}
) {
  const targetTop = Number.isFinite(requestedTop)
    ? Math.max(0, requestedTop)
    : 0
  const deadlineMs = Math.max(
    0,
    options.deadlineMs ?? APP_SCROLL_RESTORE_DEADLINE_MS
  )
  let active = true
  let frame: number | undefined
  let observer: ResizeObserver | undefined
  let clickCancellation: number | undefined

  function cleanup() {
    observer?.disconnect()
    window.removeEventListener("wheel", cancelForUserIntent)
    window.removeEventListener("touchmove", cancelForUserIntent)
    window.removeEventListener("keydown", cancelForKeyboardIntent)
    window.removeEventListener("pointerdown", cancelForPointerIntent)
    window.removeEventListener("click", cancelAfterClick, true)
    window.removeEventListener("scroll", correctAnchoring)
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    window.clearTimeout(clickCancellation)
    window.clearTimeout(deadline)
  }

  function finish(result: AppScrollRestorationResult) {
    if (!active) return
    active = false
    cleanup()
    options.onFinish?.(result)
  }

  function apply(finalAttempt: boolean) {
    frame = undefined
    if (!active || clickCancellation !== undefined) return

    const scrollLimit = appDocumentScrollLimit()
    const top = Math.min(targetTop, scrollLimit)
    window.scrollTo({ top, behavior: "instant" })

    if (targetTop === 0 || finalAttempt) {
      finish(finalAttempt && scrollLimit < targetTop ? "deadline" : "success")
    }
  }

  function schedule() {
    if (!active || frame !== undefined) return
    frame = window.requestAnimationFrame(() => apply(false))
  }

  function cancelForUserIntent() {
    finish("cancelled")
  }

  function cancelForKeyboardIntent(event: KeyboardEvent) {
    const target = event.target instanceof Element ? event.target : null
    // Space activates a button. Its click must consume the source position first.
    if (
      event.key === " " &&
      target?.closest(
        'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]'
      )
    )
      return
    if (!event.defaultPrevented && APP_SCROLL_KEYS.has(event.key)) {
      cancelForUserIntent()
    }
  }

  function cancelForPointerIntent(event: PointerEvent) {
    // Navigation controls save their source position in the click handler.
    // Keep that position available until the handler has consumed it.
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("a, button, nav")) return
    cancelForUserIntent()
  }

  function cancelAfterClick() {
    if (clickCancellation !== undefined) return
    // Suspend writes now, then let the control's handler run before cleanup.
    // This timer belongs to this restoration, never one started by the click.
    clickCancellation = window.setTimeout(cancelForUserIntent, 0)
  }

  function correctAnchoring() {
    const expectedTop = Math.min(targetTop, appDocumentScrollLimit())
    if (Math.abs(window.scrollY - expectedTop) > 1) schedule()
  }

  const deadline = window.setTimeout(() => apply(true), deadlineMs)
  window.addEventListener("wheel", cancelForUserIntent, { passive: true })
  window.addEventListener("touchmove", cancelForUserIntent, { passive: true })
  window.addEventListener("keydown", cancelForKeyboardIntent)
  window.addEventListener("pointerdown", cancelForPointerIntent, {
    passive: true,
  })
  window.addEventListener("click", cancelAfterClick, {
    capture: true,
    passive: true,
  })
  window.addEventListener("scroll", correctAnchoring, { passive: true })

  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(schedule)
    observer.observe(document.documentElement)
    if (document.body) observer.observe(document.body)
  }
  schedule()

  return () => finish("cancelled")
}

/**
 * Send a scrolling App route back to the top. Reduced-motion mode is instant;
 * other users keep the existing smooth feedback.
 */
export function scrollAppViewToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  })
}
