import { useCallback, useEffect, useRef, useState } from "react"

import { cacheRecommendationFeed, getRecommendationPage } from "~/lib/api"
import type { Recommendation, RecommendationPage } from "~/lib/api"

const pageSize = 20

type FeedPhase = "idle" | "loading" | "ready" | "error"

type FeedState = {
  phase: FeedPhase
  items: Recommendation[]
  pageInfo: RecommendationPage["pageInfo"]
  loadingMore: boolean
  refreshing: boolean
  error: string | null
  loadMoreError: string | null
  refreshError: string | null
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
  refreshing: false,
  error: null,
  loadMoreError: null,
  refreshError: null,
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
      const result = await getRecommendationPage({ limit: pageSize }).send(
        forceRequest
      )
      const items = deduplicateRecommendations([], result.items)
      setState({
        phase: "ready",
        items,
        pageInfo: result.pageInfo,
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
      await cacheRecommendationFeed({
        items,
        pageInfo: result.pageInfo,
      })
      setState((current) => ({
        ...current,
        items,
        pageInfo: result.pageInfo,
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
      const result = await getRecommendationPage({ limit: pageSize }).send(true)
      setState({
        phase: "ready",
        items: deduplicateRecommendations([], result.items),
        pageInfo: result.pageInfo,
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
