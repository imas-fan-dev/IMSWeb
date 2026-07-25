import { z } from "zod"

import { apiClient } from "../client"

const activityIdSchema = z.string().trim().min(1).max(120)

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

const chronicleUploadResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
})

export type ChronicleActivitySummary = z.infer<
  typeof chronicleActivitySummarySchema
>
export type ChronicleActivity = z.infer<typeof chronicleActivitySchema>

export function getChronicleActivities() {
  return apiClient.Get<ChronicleActivitySummary[], unknown>(
    "/eventchronicle/activities",
    {
      transform: (payload) =>
        z.array(chronicleActivitySummarySchema).parse(payload),
    }
  )
}

export function getChronicleActivity(activityId: string) {
  return apiClient.Get<ChronicleActivity, unknown>(
    `/eventchronicle/activities/${encodeURIComponent(activityId)}`,
    {
      transform: (payload) => chronicleActivitySchema.parse(payload),
    }
  )
}

export function uploadChronicleImages(
  activityId: string,
  username: string,
  files: File[],
  idempotencyKey: string
) {
  const form = new FormData()
  form.append("activityId", activityId)
  form.append("username", username)
  for (const file of files) form.append("images", file)

  return apiClient.Post<z.infer<typeof chronicleUploadResponseSchema>, unknown>(
    "/eventchronicle/upload",
    form,
    {
      headers: { "Idempotency-Key": idempotencyKey },
      transform: (payload) => chronicleUploadResponseSchema.parse(payload),
    }
  )
}
