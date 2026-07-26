import { z } from "zod"

import { apiClient } from "../client"

export const liveEventSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int(),
  title: z.string(),
  time: z.string(),
  location: z.string(),
  detailUrl: z.string().optional(),
  image: z.string().optional(),
  franchises: z.array(z.string()),
})

export type LiveEvent = z.infer<typeof liveEventSchema>

export function getLiveEvents() {
  return apiClient.Get<LiveEvent[], unknown>("/assets/json/livelist.json", {
    transform: (payload) => z.array(liveEventSchema).parse(payload),
  })
}
