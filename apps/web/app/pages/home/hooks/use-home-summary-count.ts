import { useSyncExternalStore } from "react"

const desktopSummaryQuery = "(min-width: 1024px)"
const narrowSummaryCount = 3
const desktopSummaryCount = 4

function subscribeToSummaryBreakpoint(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined
  }

  const query = window.matchMedia(desktopSummaryQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getSummaryCount() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return narrowSummaryCount
  }

  return window.matchMedia(desktopSummaryQuery).matches
    ? desktopSummaryCount
    : narrowSummaryCount
}

export function useHomeSummaryCount() {
  return useSyncExternalStore(
    subscribeToSummaryBreakpoint,
    getSummaryCount,
    () => narrowSummaryCount
  )
}
