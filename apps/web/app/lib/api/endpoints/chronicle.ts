import { eventChroniclePath } from "@imsweb/contracts/paths"
import { z } from "@imsweb/contracts/z"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import {
  normalizeChronicleActivity,
  normalizeChronicleActivitySummaries,
} from "../media-urls"
import { parsed } from "../parsed"
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

export type {
  ChronicleActivity,
  ChronicleActivitySummary,
} from "@imsweb/contracts/chronicle"

export function getChronicleActivities() {
  return apiClient.Get(
    eventChroniclePath("/activities"),
    parsed(z.array(chronicleActivitySummarySchema), {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
      select: normalizeChronicleActivitySummaries,
    })
  )
}

export function getChronicleActivity(activityId: string) {
  return apiClient.Get(
    eventChroniclePath(`/activities/${encodeURIComponent(activityId)}`),
    parsed(chronicleActivitySchema, {
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
      select: normalizeChronicleActivity,
    })
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

  return apiClient.Post(
    eventChroniclePath("/upload"),
    form,
    parsed(chronicleUploadResponseSchema, {
      headers: { "Idempotency-Key": idempotencyKey },
    })
  )
}
