import { useSyncExternalStore } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"

const desktopFeedQuery = "(min-width: 1024px)"
const singleColumnCount = 1
const desktopColumnCount = 2

function subscribeToFeedBreakpoint(onChange: () => void) {
  if (IS_APP_TARGET || typeof window === "undefined" || !window.matchMedia) {
    return () => undefined
  }

  const query = window.matchMedia(desktopFeedQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getFeedColumnCount() {
  if (IS_APP_TARGET || typeof window === "undefined" || !window.matchMedia) {
    return singleColumnCount
  }

  return window.matchMedia(desktopFeedQuery).matches
    ? desktopColumnCount
    : singleColumnCount
}

export function usePublicFeedColumnCount() {
  return useSyncExternalStore(
    subscribeToFeedBreakpoint,
    getFeedColumnCount,
    () => singleColumnCount
  )
}
