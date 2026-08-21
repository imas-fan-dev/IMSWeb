import { apiPath } from "@imsweb/contracts/paths"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { parsed } from "../parsed"
import { apiClient } from "../client"
import { getEventPage } from "./events"
import type { EventListItem, EventPage } from "./events"
import { getRecommendationPage } from "./recommendations"
import type { Recommendation } from "./recommendations"

import {
  informationDetailSchema,
  informationListSchema,
} from "@imsweb/contracts/information"

import type {
  InformationCard,
  InformationDetail,
} from "@imsweb/contracts/information"

export type HomeInformationCard = InformationCard
export type HomeInformationDetail = InformationDetail

export type HomeNews = Recommendation

export type HomeEvent = EventListItem

export type HomeEventList = EventPage

export function getHomeNews(limit = 4) {
  return getRecommendationPage({ limit })
}

export function getHomeEvents(limit = 4) {
  return getEventPage({ limit })
}

export function getHomeInformation() {
  return apiClient.Get(
    apiPath("/information"),
    parsed(informationListSchema, {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function getHomeInformationDetail(id: string) {
  return apiClient.Get(
    apiPath(`/information/${encodeURIComponent(id)}`),
    parsed(informationDetailSchema, {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}
