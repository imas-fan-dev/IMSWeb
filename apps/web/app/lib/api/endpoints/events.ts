import { setCache } from "alova"
import { z } from "zod"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"

const eventIdSchema = z
  .union([z.string(), z.number().int().positive()])
  .transform(String)
  .pipe(z.string().regex(/^[1-9]\d*$/))

export const eventListItemSchema = z.object({
  id: eventIdSchema,
  title: z.string().trim().min(1),
  name: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  summary: z.string().optional(),
  kind: z.enum(["event", "notice"]).nullable().optional(),
  source_url: z.string().nullable().optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  venue_name: z.string().nullable().optional(),
  event_status: z.string().nullable().optional(),
})

export const eventPageInfoSchema = z.object({
  nextCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
  snapshotAt: z.string().regex(/^\d+$/).nullable(),
})

export const eventPageSchema = z.object({
  items: z.array(eventListItemSchema),
  pageInfo: eventPageInfoSchema,
})

export type EventListItem = z.infer<typeof eventListItemSchema>
export type EventPageInfo = z.infer<typeof eventPageInfoSchema>
export type EventPage = z.infer<typeof eventPageSchema>

type EventPageRequest = {
  limit?: number
  cursor?: string
}

export function getEventPage({ limit = 20, cursor }: EventPageRequest = {}) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor

  return apiClient.Get<EventPage, unknown>("/api/events", {
    cacheFor: PUBLIC_QUERY_CACHE_FOR,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    params,
    transform: (payload) => eventPageSchema.parse(payload),
  })
}

export function cacheEventFeed(page: EventPage) {
  return setCache(getEventPage(), page)
}
