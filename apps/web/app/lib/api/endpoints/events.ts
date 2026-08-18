import { setCache } from "alova"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { parsed } from "../parsed"
import { apiClient } from "../client"

import { eventPageSchema } from "@imsweb/contracts/events"

export * from "@imsweb/contracts/events"

import type { EventPage } from "@imsweb/contracts/events"

type EventPageRequest = {
  limit?: number
  cursor?: string
}

export function getEventPage({ limit = 20, cursor }: EventPageRequest = {}) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor

  return apiClient.Get(
    "/api/events",
    parsed(eventPageSchema, {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
      params,
    })
  )
}

export function cacheEventFeed(page: EventPage) {
  return setCache(getEventPage(), page)
}
