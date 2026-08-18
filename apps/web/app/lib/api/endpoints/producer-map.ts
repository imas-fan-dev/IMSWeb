import { parsed } from "../parsed"
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

import type { ProducerMapContent } from "@imsweb/contracts/producer-map"

export function getProducerMapGeometry() {
  return apiClient.Get(
    "/maps/china-provinces.json",
    parsed(producerMapGeometrySchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
    })
  )
}

export function getProducerMapContent() {
  return apiClient.Get(
    "/api/producer-map",
    parsed(producerMapContentSchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
    })
  )
}

export function getAdminProducerMapContent() {
  return adminApiClient.Get(
    "/api/admin/producer-map",
    parsed(producerMapAdminSnapshotSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminProducerMapContent(
  content: ProducerMapContent,
  revision: string | null
) {
  return adminApiClient.Put(
    "/api/admin/producer-map",
    { content, revision },
    parsed(producerMapAdminUpdateSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
    })
  )
}

export function uploadAdminProducerMapImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    "/api/admin/producer-map/images",
    form,
    parsed(producerMapImageUploadSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
