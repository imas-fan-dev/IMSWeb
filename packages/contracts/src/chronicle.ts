import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, successEnvelope } from "./common.js"

export const activityIdSchema = z.string().trim().min(1).max(120)
export const chronicleActivityParamsSchema = exactJsonResponse({ id: activityIdSchema })
export const chronicleMediaParamsSchema = exactJsonResponse({ activityId: activityIdSchema, filename: z.string().trim().min(1).max(120) })
export const chronicleActivitySummarySchema = exactJsonResponse({ id: activityIdSchema, title: z.string().min(1), date: z.string().min(1), location: z.string().min(1), cover: z.string().nullable() })
export const chronicleActivitySchema = exactJsonResponse({ id: activityIdSchema, title: z.string().min(1), date: z.string().min(1), location: z.string().min(1), images: z.array(z.string().min(1)) })
export const chronicleActivityListSchema = z.array(chronicleActivitySummarySchema)
export const chronicleUploadResponseSchema = successEnvelope({ count: z.number().int().nonnegative() })
const pendingMediaItemSchema = exactJsonResponse({ filename: z.string().min(1), url: z.string().min(1), uploader: z.string().optional(), time: z.string().optional() })
const usedMediaItemSchema = exactJsonResponse({ filename: z.string().min(1), url: z.string().min(1) })
export const pendingChronicleMediaSchema = z.record(z.string(), z.array(pendingMediaItemSchema))
export const usedChronicleMediaSchema = z.record(z.string(), z.array(usedMediaItemSchema))
export const chronicleErrorResponseSchema = errorResponseSchema
export const chronicleUploadErrorResponseSchema = exactJsonResponse({ success: z.literal(false), error: z.string() })
export const chronicleUploadHttpErrorResponseSchema = z.union([
  chronicleErrorResponseSchema,
  chronicleUploadErrorResponseSchema,
])
export type ChronicleActivityParams = z.infer<typeof chronicleActivityParamsSchema>
export type ChronicleMediaParams = z.infer<typeof chronicleMediaParamsSchema>
export type ChronicleActivitySummary = z.infer<typeof chronicleActivitySummarySchema>
export type ChronicleActivity = z.infer<typeof chronicleActivitySchema>
export type ChronicleActivityList = z.infer<typeof chronicleActivityListSchema>
export type PendingChronicleMedia = z.infer<typeof pendingChronicleMediaSchema>
export type UsedChronicleMedia = z.infer<typeof usedChronicleMediaSchema>
export type ChronicleUpload = z.infer<typeof chronicleUploadResponseSchema>
export type ChronicleErrorResponse = z.infer<typeof chronicleErrorResponseSchema>
export type ChronicleUploadHttpErrorResponse = z.infer<
  typeof chronicleUploadHttpErrorResponseSchema
>
