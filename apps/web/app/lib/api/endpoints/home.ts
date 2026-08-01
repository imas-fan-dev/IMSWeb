import { z } from "zod"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { getEventPage } from "./events"
import type { EventListItem, EventPage } from "./events"
import { getRecommendationPage } from "./recommendations"
import type { Recommendation } from "./recommendations"

const homeInformationCardSchema = z.object({
  id: z.string(),
  category: z.enum(["activity", "fan"]),
  contentType: z.enum(["external", "html"]),
  title: z.string().trim().min(1),
  image: z.string(),
  link: z.string(),
  updatedAt: z.string(),
})

const homeInformationListSchema = z.object({
  cards: z.array(homeInformationCardSchema),
})

const homeInformationDetailSchema = z.object({
  card: homeInformationCardSchema.extend({ html: z.string().min(1) }),
})

export type HomeNews = Recommendation
export type HomeEvent = EventListItem
export type HomeEventList = EventPage
export type HomeInformationCard = z.infer<typeof homeInformationCardSchema>
export type HomeInformationDetail = z.infer<typeof homeInformationDetailSchema>

export function getHomeNews(limit = 4) {
  return getRecommendationPage({ limit })
}

export function getHomeEvents(limit = 4) {
  return getEventPage({ limit })
}

export function getHomeInformation() {
  return apiClient.Get<z.infer<typeof homeInformationListSchema>, unknown>(
    "/api/information",
    {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
      transform: (payload) => homeInformationListSchema.parse(payload),
    }
  )
}

export function getHomeInformationDetail(id: string) {
  return apiClient.Get<HomeInformationDetail, unknown>(
    `/api/information/${encodeURIComponent(id)}`,
    {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
      transform: (payload) => homeInformationDetailSchema.parse(payload),
    }
  )
}
