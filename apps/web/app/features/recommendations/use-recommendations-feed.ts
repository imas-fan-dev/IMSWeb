import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

import { getRecommendationPage, recommendationSchema } from "./api"
import type { Recommendation, RecommendationPage } from "./api"

const pageSize = 20
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

type FeedPhase = "idle" | "loading" | "ready" | "error"

type FeedState = {
  phase: FeedPhase
  items: Recommendation[]
  pageInfo: RecommendationPage["pageInfo"]
  loadingMore: boolean
  error: string | null
  loadMoreError: string | null
}

const emptyPageInfo: RecommendationPage["pageInfo"] = {
  nextCursor: null,
  hasNextPage: false,
  snapshotAt: null,
}

const initialState: FeedState = {
  phase: "idle",
  items: [],
  pageInfo: emptyPageInfo,
  loadingMore: false,
  error: null,
  loadMoreError: null,
}

function clearCachedFeed() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(RECOMMENDATIONS_SESSION_CACHE_KEY)
  } catch {
    // The list remains usable when session storage is unavailable.
  }
}

function readCachedFeed() {
  if (typeof window === "undefined") return null

  try {
    const value = window.sessionStorage.getItem(
      RECOMMENDATIONS_SESSION_CACHE_KEY
    )
    if (!value) return null
    const parsed = cachedFeedSchema.safeParse(JSON.parse(value))
    if (!parsed.success || Date.now() - parsed.data.savedAt > cacheLifetime) {
      clearCachedFeed()
      return null
    }
    return parsed.data
  } catch {
    clearCachedFeed()
    return null
  }
}

function writeCachedFeed(
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

function writeCachedScrollPosition() {
  if (typeof window === "undefined") return

  try {
    const cached = readCachedFeed()
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

function deduplicateRecommendations(
  current: Recommendation[],
  incoming: Recommendation[]
) {
  const knownIds = new Set(current.map((item) => item.id))
  const merged = [...current]
  for (const item of incoming) {
    if (knownIds.has(item.id)) continue
    knownIds.add(item.id)
    merged.push(item)
  }
  return merged
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "推荐请求未成功"
}

export function useRecommendationsFeed() {
  const [state, setState] = useState<FeedState>(initialState)
  const requestInFlight = useRef(false)

  const loadFirstPage = useCallback(async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setState((current) => ({
      ...current,
      phase: "loading",
      loadingMore: false,
      error: null,
      loadMoreError: null,
    }))

    try {
      const result = await getRecommendationPage({ limit: pageSize }).send()
      const items = deduplicateRecommendations([], result.items)
      setState({
        phase: "ready",
        items,
        pageInfo: result.pageInfo,
        loadingMore: false,
        error: null,
        loadMoreError: null,
      })
      writeCachedFeed(items, result.pageInfo)
    } catch (error) {
      setState({
        ...initialState,
        phase: "error",
        error: errorMessage(error),
      })
    } finally {
      requestInFlight.current = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (
      requestInFlight.current ||
      state.loadingMore ||
      !state.pageInfo.hasNextPage ||
      !state.pageInfo.nextCursor
    ) {
      return
    }

    requestInFlight.current = true
    setState((current) => ({
      ...current,
      loadingMore: true,
      loadMoreError: null,
    }))

    try {
      const result = await getRecommendationPage({
        limit: pageSize,
        cursor: state.pageInfo.nextCursor,
      }).send()
      const items = deduplicateRecommendations(state.items, result.items)
      setState((current) => ({
        ...current,
        items,
        pageInfo: result.pageInfo,
        loadingMore: false,
        loadMoreError: null,
      }))
      writeCachedFeed(items, result.pageInfo)
    } catch (error) {
      setState((current) => ({
        ...current,
        loadingMore: false,
        loadMoreError: errorMessage(error),
      }))
    } finally {
      requestInFlight.current = false
    }
  }, [state.items, state.loadingMore, state.pageInfo])

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return
    clearCachedFeed()
    await loadFirstPage()
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [loadFirstPage])

  useEffect(() => {
    const cached = readCachedFeed()
    if (!cached) {
      void loadFirstPage()
      return
    }

    setState({
      phase: "ready",
      items: cached.items,
      pageInfo: cached.pageInfo,
      loadingMore: false,
      error: null,
      loadMoreError: null,
    })
    let secondFrame: number | undefined
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: cached.scrollY, behavior: "auto" })
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame)
    }
  }, [loadFirstPage])

  useEffect(() => {
    window.addEventListener("pagehide", writeCachedScrollPosition)
    return () => {
      writeCachedScrollPosition()
      window.removeEventListener("pagehide", writeCachedScrollPosition)
    }
  }, [])

  return {
    ...state,
    loadFirstPage,
    loadMore,
    refresh,
  }
}
