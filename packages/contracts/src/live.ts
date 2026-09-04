import { z } from "zod"

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
