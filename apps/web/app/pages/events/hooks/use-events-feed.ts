import { useCallback, useEffect, useRef, useState } from "react"

import { cacheEventFeed, getEventPage } from "~/shared/api"
import type { EventListItem, EventPageInfo } from "~/shared/api"

const pageSize = 20

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
    }))

    try {
      const page = await getEventPage({ limit: pageSize }).send(forceRequest)
      const items = deduplicateEvents([], page.items)
      setState({
        phase: "ready",
        items,
        pageInfo: page.pageInfo,
        loadingMore: false,
        error: null,
        loadMoreError: null,
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

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return
    await loadFirstPage(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [loadFirstPage])

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
