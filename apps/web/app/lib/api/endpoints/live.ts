import { apiPath } from "@imsweb/contracts/paths"
import { parsed } from "../parsed"
import { PUBLIC_QUERY_CACHE_FOR } from "../cache-policy"
import { apiClient } from "../client"

import {
  liveScheduleErrorResponseSchema,
  liveScheduleListSchema,
} from "@imsweb/contracts/live"

export { liveEventSchema } from "@imsweb/contracts/live"
export type * from "@imsweb/contracts/live"

export function getLiveEvents(months: string[]) {
  const search = new URLSearchParams({ months: months.join(",") })
  return apiClient.Get(
    apiPath(`/live-schedule?${search.toString()}`),
    parsed(liveScheduleListSchema, {
      errorSchema: liveScheduleErrorResponseSchema,
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
    })
  )
}
