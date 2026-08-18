import { z } from "@imsweb/contracts/z"

import { PUBLIC_QUERY_CACHE_FOR } from "../cache-policy"
import { apiClient } from "../client"

import { liveEventSchema } from "@imsweb/contracts/live"

export * from "@imsweb/contracts/live"

import type { LiveEvent } from "@imsweb/contracts/live"

export function getLiveEvents(months: string[]) {
  const search = new URLSearchParams({ months: months.join(",") })
  return apiClient.Get<LiveEvent[], unknown>(
    `/api/live-schedule?${search.toString()}`,
    {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      transform: (payload) => z.array(liveEventSchema).parse(payload),
    }
  )
}
