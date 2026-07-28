import { useCallback, useEffect, useRef, useState } from "react"

import { cacheRecommendationFeed, getRecommendationPage } from "~/shared/api"
import type { Recommendation, RecommendationPage } from "~/shared/api"

const pageSize = 20

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
