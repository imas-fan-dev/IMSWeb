import { z } from "zod"
import { successEnvelope } from "./common.js"

export const activityIdSchema = z.string().trim().min(1).max(120)

export const chronicleActivitySummarySchema = z.object({
  id: activityIdSchema,
  title: z.string().trim().min(1),
  date: z.string().trim().min(1),
  location: z.string().trim().min(1),
  cover: z.string().nullable(),
})

export const chronicleActivitySchema = z.object({
  id: activityIdSchema,
  title: z.string().trim().min(1),
  date: z.string().trim().min(1),
  location: z.string().trim().min(1),
  images: z.array(z.string().min(1)),
})

export const chronicleUploadResponseSchema = successEnvelope({
  count: z.number().int().nonnegative(),
})

export const pendingChronicleMediaSchema = z.record(
  z.string(),
  z.array(
    z.object({
      filename: z.string().min(1),
      url: z.string().min(1),
      uploader: z.string().optional(),
      time: z.string().optional(),
    })
  )
)

export const usedChronicleMediaSchema = z.record(
  z.string(),
  z.array(
    z.object({
      filename: z.string().min(1),
      url: z.string().min(1),
    })
  )
)

export type ChronicleActivitySummary = z.infer<
  typeof chronicleActivitySummarySchema
>

export type ChronicleActivity = z.infer<typeof chronicleActivitySchema>

export type PendingChronicleMedia = z.infer<typeof pendingChronicleMediaSchema>

export type UsedChronicleMedia = z.infer<typeof usedChronicleMediaSchema>

export type ChronicleUpload = z.infer<typeof chronicleUploadResponseSchema>
