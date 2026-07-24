import { z } from "zod"

import { eventListItemSchema, eventPageInfoSchema } from "~/shared/api"
import type { EventListItem, EventPageInfo } from "~/shared/api"

const cacheLifetime = 30 * 60 * 1000

export const EVENTS_SESSION_CACHE_KEY = "imsweb:events-feed:v1"

const cachedFeedSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  scrollY: z.number().nonnegative(),
  items: z.array(eventListItemSchema),
  pageInfo: eventPageInfoSchema,
})

export function clearEventsFeedCache() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(EVENTS_SESSION_CACHE_KEY)
  } catch {
    // The feed remains usable when session storage is unavailable.
  }
}

export function readEventsFeedCache() {
  if (typeof window === "undefined") return null

  try {
    const value = window.sessionStorage.getItem(EVENTS_SESSION_CACHE_KEY)
    if (!value) return null
    const parsed = cachedFeedSchema.safeParse(JSON.parse(value))
    if (!parsed.success || Date.now() - parsed.data.savedAt > cacheLifetime) {
      clearEventsFeedCache()
      return null
    }
    return parsed.data
  } catch {
    clearEventsFeedCache()
    return null
  }
}

export function writeEventsFeedCache(
  items: EventListItem[],
  pageInfo: EventPageInfo
) {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(
      EVENTS_SESSION_CACHE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        scrollY: window.scrollY,
        items,
        pageInfo,
      })
    )
  } catch {
    // A disabled or full session store must not prevent activity browsing.
  }
}

export function writeEventsFeedScrollPosition() {
  if (typeof window === "undefined") return

  try {
    const cached = readEventsFeedCache()
    if (!cached) return
    window.sessionStorage.setItem(
      EVENTS_SESSION_CACHE_KEY,
      JSON.stringify({
        ...cached,
        savedAt: Date.now(),
        scrollY: window.scrollY,
      })
    )
  } catch {
    // Scroll restoration is an enhancement; ignore storage failures.
  }
}
