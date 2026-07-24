import { useCallback, useEffect, useRef, useState } from "react"

import { getRecommendationPage } from "~/shared/api"
import type { Recommendation, RecommendationPage } from "~/shared/api"
import {
  clearRecommendationsFeedCache,
  readRecommendationsFeedCache,
  writeRecommendationsFeedCache,
  writeRecommendationsFeedScrollPosition,
} from "./recommendations-feed-cache"

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
      writeRecommendationsFeedCache(items, result.pageInfo)
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
      writeRecommendationsFeedCache(items, result.pageInfo)
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
    clearRecommendationsFeedCache()
    await loadFirstPage()
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [loadFirstPage])

  useEffect(() => {
    const cached = readRecommendationsFeedCache()
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
    window.addEventListener("pagehide", writeRecommendationsFeedScrollPosition)
    return () => {
      writeRecommendationsFeedScrollPosition()
      window.removeEventListener(
        "pagehide",
        writeRecommendationsFeedScrollPosition
      )
    }
  }, [])

  return {
    ...state,
    loadFirstPage,
    loadMore,
    refresh,
  }
}
