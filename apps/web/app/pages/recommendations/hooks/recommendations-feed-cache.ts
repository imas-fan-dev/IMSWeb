import { z } from "zod"

import { recommendationSchema } from "~/shared/api"
import type { Recommendation, RecommendationPage } from "~/shared/api"

const cacheLifetime = 30 * 60 * 1000

export const RECOMMENDATIONS_SESSION_CACHE_KEY =
  "imsweb:recommendations-feed:v1"

const pageInfoSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
  snapshotAt: z.string().regex(/^\d+$/).nullable(),
})

const cachedFeedSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  scrollY: z.number().nonnegative(),
  items: z.array(recommendationSchema),
  pageInfo: pageInfoSchema,
})

export function clearRecommendationsFeedCache() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(RECOMMENDATIONS_SESSION_CACHE_KEY)
  } catch {
    // The list remains usable when session storage is unavailable.
  }
}

export function readRecommendationsFeedCache() {
  if (typeof window === "undefined") return null

  try {
    const value = window.sessionStorage.getItem(
      RECOMMENDATIONS_SESSION_CACHE_KEY
    )
    if (!value) return null
    const parsed = cachedFeedSchema.safeParse(JSON.parse(value))
    if (!parsed.success || Date.now() - parsed.data.savedAt > cacheLifetime) {
      clearRecommendationsFeedCache()
      return null
    }
    return parsed.data
  } catch {
    clearRecommendationsFeedCache()
    return null
  }
}

export function writeRecommendationsFeedCache(
  items: Recommendation[],
  pageInfo: RecommendationPage["pageInfo"]
) {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(
      RECOMMENDATIONS_SESSION_CACHE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        scrollY: window.scrollY,
        items,
        pageInfo,
      })
    )
  } catch {
    // A disabled or full session store must not prevent browsing.
  }
}

export function writeRecommendationsFeedScrollPosition() {
  if (typeof window === "undefined") return

  try {
    const cached = readRecommendationsFeedCache()
    if (!cached) return
    window.sessionStorage.setItem(
      RECOMMENDATIONS_SESSION_CACHE_KEY,
      JSON.stringify({
        ...cached,
        savedAt: Date.now(),
        scrollY: window.scrollY,
      })
    )
  } catch {
    // Scroll restoration is an enhancement.
  }
}
