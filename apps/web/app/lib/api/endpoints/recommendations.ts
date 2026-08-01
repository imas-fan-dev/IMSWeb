import { setCache } from "alova"
import { z } from "zod"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"

const recommendationIdSchema = z
  .union([z.string(), z.number().int().positive().safe()])
  .transform(String)
  .pipe(z.string().regex(/^[1-9]\d*$/))

export const recommendationSchema = z.object({
  id: recommendationIdSchema,
  title: z.string().trim().min(1),
  thumbnail: z.string().nullable().optional(),
  content: z.string(),
  date: z.string().nullable().optional(),
})

const paginatedRecommendationSchema = z.object({
  items: z.array(recommendationSchema),
  pageInfo: z.object({
    nextCursor: z.string().min(1).nullable(),
    hasNextPage: z.boolean(),
    snapshotAt: z.string().regex(/^\d+$/).nullable(),
  }),
})

const recommendationResponseSchema = z.union([
  paginatedRecommendationSchema,
  z.array(recommendationSchema),
])

export type Recommendation = z.infer<typeof recommendationSchema>

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
