import { apiPath } from "@imsweb/contracts/paths"
import { setCache } from "alova"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { parsed } from "../parsed"
import { apiClient } from "../client"
import { normalizeEventPage } from "../media-urls"

import { eventPageSchema } from "@imsweb/contracts/events"

export {
  eventIdSchema,
  eventListItemSchema,
  eventPageInfoSchema,
  eventPageSchema,
  createEventResponseSchema,
} from "@imsweb/contracts/events"
export type * from "@imsweb/contracts/events"

import type { EventPage } from "@imsweb/contracts/events"

type EventPageRequest = {
  limit?: number
  cursor?: string
}

export function getEventPage({ limit = 20, cursor }: EventPageRequest = {}) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor

  return apiClient.Get(
    apiPath("/events"),
    parsed(eventPageSchema, {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
      params,
      select: normalizeEventPage,
    })
  )
}

export function cacheEventFeed(page: EventPage) {
  return setCache(getEventPage(), page)
}
