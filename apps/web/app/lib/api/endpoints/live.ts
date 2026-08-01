import { z } from "zod"

import { PUBLIC_QUERY_CACHE_FOR } from "../cache-policy"
import { apiClient } from "../client"

export const liveEventSchema = z.object({
  id: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int(),
  title: z.string(),
  time: z.string(),
  location: z.string(),
  detailUrl: z.string().optional(),
  image: z.string().optional(),
  franchises: z.array(z.string()),
  brandCodes: z.array(z.string()),
})

export type LiveEvent = z.infer<typeof liveEventSchema>

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
