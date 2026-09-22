import { useCallback, useEffect, useRef, useState } from "react"

import { cacheEventFeed, getEventPage } from "~/lib/api"
import type { EventListItem, EventPageInfo } from "~/lib/api"

const pageSize = 20

type FeedPhase = "idle" | "loading" | "ready" | "error"

type FeedState = {
  phase: FeedPhase
  items: EventListItem[]
  pageInfo: EventPageInfo
  loadingMore: boolean
  refreshing: boolean
  error: string | null
  loadMoreError: string | null
  refreshError: string | null
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
  refreshing: false,
  error: null,
  loadMoreError: null,
  refreshError: null,
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

  const loadFirstPage = useCallback(async (forceRequest = false) => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setState((current) => ({
      ...current,
      phase: "loading",
      loadingMore: false,
      error: null,
      loadMoreError: null,
      refreshError: null,
    }))

    try {
      const page = await getEventPage({ limit: pageSize }).send(forceRequest)
      const items = deduplicateEvents([], page.items)
      setState({
        phase: "ready",
        items,
        pageInfo: page.pageInfo,
        loadingMore: false,
        refreshing: false,
        error: null,
        loadMoreError: null,
        refreshError: null,
      })
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
      await cacheEventFeed({
        items,
        pageInfo: page.pageInfo,
      })
      setState((current) => ({
        ...current,
        items,
        pageInfo: page.pageInfo,
        loadingMore: false,
        loadMoreError: null,
      }))
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

  /**
   * Re-reads the first page without tearing the list down.
   *
   * `loadFirstPage` swaps the whole list for the skeleton, which is right for a
   * cold open and wrong for a refresh: a pull gesture would make the content
   * the user is looking at disappear under their finger. So this keeps the
   * current rows on screen and only replaces them once the response lands.
   */
  const refresh = useCallback(async () => {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setState((current) => ({
      ...current,
      refreshing: true,
      loadingMore: false,
      loadMoreError: null,
      refreshError: null,
    }))

    try {
      const page = await getEventPage({ limit: pageSize }).send(true)
      setState({
        phase: "ready",
        items: deduplicateEvents([], page.items),
        pageInfo: page.pageInfo,
        loadingMore: false,
        refreshing: false,
        error: null,
        loadMoreError: null,
        refreshError: null,
      })
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (error) {
      // A failed refresh must not discard rows that are still perfectly good;
      // only a page with nothing to fall back on drops into the error state.
      setState((current) =>
        current.items.length
          ? {
              ...current,
              refreshing: false,
              refreshError: errorMessage(error),
            }
          : { ...initialState, phase: "error", error: errorMessage(error) }
      )
    } finally {
      requestInFlight.current = false
    }
  }, [])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  return {
    ...state,
    loadFirstPage,
    loadMore,
    refresh,
  }
}
