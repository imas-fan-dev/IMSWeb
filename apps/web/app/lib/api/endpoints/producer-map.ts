import { z } from "@imsweb/contracts/z"

import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  producerMapAdminSnapshotSchema,
  producerMapAdminUpdateSchema,
  producerMapContentSchema,
  producerMapGeometrySchema,
  producerMapImageUploadSchema,
} from "@imsweb/contracts/producer-map"

export * from "@imsweb/contracts/producer-map"

import type {
  ProducerMapAdminSnapshot,
  ProducerMapContent,
  ProducerMapGeometry,
} from "@imsweb/contracts/producer-map"

export function getProducerMapGeometry() {
  return apiClient.Get<ProducerMapGeometry, unknown>(
    "/maps/china-provinces.json",
    {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      transform: (payload) => producerMapGeometrySchema.parse(payload),
    }
  )
}

export function getProducerMapContent() {
  return apiClient.Get<ProducerMapContent, unknown>("/api/producer-map", {
    cacheFor: STABLE_CONTENT_CACHE_FOR,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
    transform: (payload) => producerMapContentSchema.parse(payload),
  })
}

export function getAdminProducerMapContent() {
  return adminApiClient.Get<ProducerMapAdminSnapshot, unknown>(
    "/api/admin/producer-map",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => producerMapAdminSnapshotSchema.parse(payload),
    }
  )
}

export function updateAdminProducerMapContent(
  content: ProducerMapContent,
  revision: string | null
) {
  return adminApiClient.Put<
    z.infer<typeof producerMapAdminUpdateSchema>,
    unknown
  >(
    "/api/admin/producer-map",
    { content, revision },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
      transform: (payload) => producerMapAdminUpdateSchema.parse(payload),
    }
  )
}

export function uploadAdminProducerMapImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post<
    z.infer<typeof producerMapImageUploadSchema>,
    unknown
  >("/api/admin/producer-map/images", form, {
    meta: withBackofficeCsrf(),
    transform: (payload) => producerMapImageUploadSchema.parse(payload),
  })
}
