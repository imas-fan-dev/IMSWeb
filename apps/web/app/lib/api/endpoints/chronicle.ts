import { z } from "@imsweb/contracts/z"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"

import {
  chronicleActivitySchema,
  chronicleActivitySummarySchema,
  chronicleUploadResponseSchema,
} from "@imsweb/contracts/chronicle"

export {
  chronicleActivitySchema,
  chronicleActivitySummarySchema,
} from "@imsweb/contracts/chronicle"

import type {
  ChronicleActivity,
  ChronicleActivitySummary,
} from "@imsweb/contracts/chronicle"

export type {
  ChronicleActivity,
  ChronicleActivitySummary,
} from "@imsweb/contracts/chronicle"

export function getChronicleActivities() {
  return apiClient.Get<ChronicleActivitySummary[], unknown>(
    "/eventchronicle/activities",
    {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
      transform: (payload) =>
        z.array(chronicleActivitySummarySchema).parse(payload),
    }
  )
}

export function getChronicleActivity(activityId: string) {
  return apiClient.Get<ChronicleActivity, unknown>(
    `/eventchronicle/activities/${encodeURIComponent(activityId)}`,
    {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
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
