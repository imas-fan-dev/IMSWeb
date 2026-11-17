import { useSyncExternalStore } from "react"

import { IS_APP_TARGET } from "~/lib/app-target"

const desktopAccountQuery = "(min-width: 1024px)"

function subscribeToAccountBreakpoint(onChange: () => void) {
  if (IS_APP_TARGET || typeof window === "undefined" || !window.matchMedia) {
    return () => undefined
  }

  const query = window.matchMedia(desktopAccountQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getDesktopAccountSnapshot() {
  if (IS_APP_TARGET || typeof window === "undefined" || !window.matchMedia) {
    return false
  }

  return window.matchMedia(desktopAccountQuery).matches
}

export function useDesktopAccountWorkspace() {
  return useSyncExternalStore(
    subscribeToAccountBreakpoint,
    getDesktopAccountSnapshot,
    () => false
  )
}
