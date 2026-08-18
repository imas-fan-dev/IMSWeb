import { z } from "@imsweb/contracts/z"

import { parsed } from "../parsed"
import { PUBLIC_QUERY_CACHE_FOR } from "../cache-policy"
import { apiClient } from "../client"

import { liveEventSchema } from "@imsweb/contracts/live"

export * from "@imsweb/contracts/live"

export function getLiveEvents(months: string[]) {
  const search = new URLSearchParams({ months: months.join(",") })
  return apiClient.Get(
    `/api/live-schedule?${search.toString()}`,
    parsed(z.array(liveEventSchema), {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
    })
  )
}
