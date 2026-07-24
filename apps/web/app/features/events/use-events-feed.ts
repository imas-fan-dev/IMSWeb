import { useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"

import { eventListItemSchema, eventPageInfoSchema, getEventPage } from "./api"
import type { EventListItem, EventPageInfo } from "./api"

const pageSize = 20
const cacheLifetime = 30 * 60 * 1000

export const EVENTS_SESSION_CACHE_KEY = "imsweb:events-feed:v1"

const cachedFeedSchema = z.object({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  scrollY: z.number().nonnegative(),
  items: z.array(eventListItemSchema),
  pageInfo: eventPageInfoSchema,
})

type FeedPhase = "idle" | "loading" | "ready" | "error"

type FeedState = {
  phase: FeedPhase
  items: EventListItem[]
  pageInfo: EventPageInfo
  loadingMore: boolean
  error: string | null
  loadMoreError: string | null
}

const emptyPageInfo: EventPageInfo = {
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
    window.sessionStorage.removeItem(EVENTS_SESSION_CACHE_KEY)
  } catch {
    // The feed remains usable when session storage is unavailable.
  }
}

function readCachedFeed() {
  if (typeof window === "undefined") return null

  try {
    const value = window.sessionStorage.getItem(EVENTS_SESSION_CACHE_KEY)
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

function writeCachedFeed(items: EventListItem[], pageInfo: EventPageInfo) {
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

function writeCachedScrollPosition() {
  if (typeof window === "undefined") return

  try {
    const cached = readCachedFeed()
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

function deduplicateEvents(
  current: EventListItem[],
  incoming: EventListItem[]
) {
  const knownIds = new Set(current.map((event) => event.id))
  const merged = [...current]
  for (const event of incoming) {
    if (knownIds.has(event.id)) continue
    knownIds.add(event.id)
    merged.push(event)
  }
  return merged
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "活动请求未成功"
}

export function useEventsFeed() {
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
      const page = await getEventPage({ limit: pageSize }).send()
      const items = deduplicateEvents([], page.items)
      setState({
        phase: "ready",
        items,
        pageInfo: page.pageInfo,
        loadingMore: false,
        error: null,
        loadMoreError: null,
      })
      writeCachedFeed(items, page.pageInfo)
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
    const cursor = state.pageInfo.nextCursor
    if (
      requestInFlight.current ||
      state.loadingMore ||
      !state.pageInfo.hasNextPage ||
      !cursor
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
      const page = await getEventPage({ limit: pageSize, cursor }).send()
      const items = deduplicateEvents(state.items, page.items)
      setState((current) => ({
        ...current,
        items,
        pageInfo: page.pageInfo,
        loadingMore: false,
        loadMoreError: null,
      }))
      writeCachedFeed(items, page.pageInfo)
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
