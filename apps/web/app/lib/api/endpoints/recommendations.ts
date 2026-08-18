import { setCache } from "alova"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"

import { recommendationResponseSchema } from "@imsweb/contracts/news"

export { recommendationSchema } from "@imsweb/contracts/news"

import type { Recommendation } from "@imsweb/contracts/news"

export type { Recommendation } from "@imsweb/contracts/news"

export type RecommendationPage = {
  items: Recommendation[]
  pageInfo: {
    nextCursor: string | null
    hasNextPage: boolean
    snapshotAt: string | null
  }
}

type RecommendationPageRequest = {
  limit?: number
  cursor?: string
}

export function parseRecommendationPage(payload: unknown): RecommendationPage {
  const parsed = recommendationResponseSchema.parse(payload)

  if (Array.isArray(parsed)) {
    return {
      items: parsed,
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: null,
      },
    }
  }

  return parsed
}

export function getRecommendationPage({
  limit = 20,
  cursor,
}: RecommendationPageRequest = {}) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor

  return apiClient.Get<RecommendationPage, unknown>("/api/news", {
    cacheFor: PUBLIC_QUERY_CACHE_FOR,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    params,
    transform: parseRecommendationPage,
  })
}

export function cacheRecommendationFeed(page: RecommendationPage) {
  return setCache(getRecommendationPage(), page)
}
