import { useSyncExternalStore } from "react"

type MediaQueryEntry = {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => boolean
}

// One entry per query so the store functions keep a stable identity; a fresh
// closure per render would re-subscribe on every pass.
const entries = new Map<string, MediaQueryEntry>()

function entryFor(query: string): MediaQueryEntry {
  const cached = entries.get(query)
  if (cached) return cached
  const entry: MediaQueryEntry = {
    subscribe: (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => undefined
      }
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    getSnapshot: () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.(query).matches),
  }
  entries.set(query, entry)
  return entry
}

/**
 * Breakpoint state for layout forks that cannot be expressed with CSS alone.
 * The server snapshot is `false`, so render the compact variant on the first
 * pass and let the browser correct it after hydration.
 */
export function useMediaQuery(query: string): boolean {
  const entry = entryFor(query)
  return useSyncExternalStore(entry.subscribe, entry.getSnapshot, () => false)
}
