import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, legacyStripRequestObject } from "./common.js"
export const liveScheduleQuerySchema = legacyStripRequestObject({ months: z.string().optional() })
export const liveEventSchema = exactJsonResponse({
  id: z.string(), year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int(), title: z.string(), time: z.string(), location: z.string(), detailUrl: z.string().optional(), image: z.string().optional(), franchises: z.array(z.string()), brandCodes: z.array(z.string()),
})
export const liveScheduleListSchema = z.array(liveEventSchema)
export const liveScheduleErrorResponseSchema = errorResponseSchema
export type LiveScheduleQuery = z.infer<typeof liveScheduleQuerySchema>
export type LiveEvent = z.infer<typeof liveEventSchema>
export type LiveScheduleList = z.infer<typeof liveScheduleListSchema>
export type LiveScheduleErrorResponse = z.infer<typeof liveScheduleErrorResponseSchema>
