import { adminApiPath, apiPath, mapsPath } from "@imsweb/contracts/paths"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { bundleAssetClient } from "../bundle-client"
import { apiClient } from "../client"
import {
  normalizeProducerMapAdminSnapshot,
  normalizeProducerMapAdminUpdate,
  normalizeProducerMapContent,
} from "../media-urls"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  producerMapAdminSnapshotSchema,
  producerMapAdminUpdateSchema,
  producerMapContentSchema,
  producerMapGeometrySchema,
  producerMapImageUploadSchema,
} from "@imsweb/contracts/producer-map"

export {
  producerMapSeriesSchema,
  producerMapRegionSchema,
  producerMapCommunitySchema,
  producerMapContentSchema,
  producerMapAdminSnapshotSchema,
  producerMapAdminUpdateSchema,
  producerMapImageUploadSchema,
  producerMapGeometrySchema,
} from "@imsweb/contracts/producer-map"
export type * from "@imsweb/contracts/producer-map"

import type { ProducerMapContent } from "@imsweb/contracts/producer-map"

/**
 * Province geometry for the ECharts map.
 *
 * `apps/web/public/maps/china-provinces.json` ships inside the web bundle, not
 * with the API, so this goes through `bundleAssetClient` and stays relative to
 * the document. Through an API client it would gain `VITE_IMS_API_ORIGIN` in a
 * packaged build and 404, leaving the map with no geometry to draw.
 */
export function getProducerMapGeometry() {
  return bundleAssetClient.Get(
    mapsPath("/china-provinces.json"),
    parsed(producerMapGeometrySchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
    })
  )
}

export function getProducerMapContent() {
  return apiClient.Get(
    apiPath("/producer-map"),
    parsed(producerMapContentSchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
      select: normalizeProducerMapContent,
    })
  )
}

export function getAdminProducerMapContent() {
  return adminApiClient.Get(
    adminApiPath("/producer-map"),
    parsed(producerMapAdminSnapshotSchema, {
      meta: withBackofficeAuth(),
      select: normalizeProducerMapAdminSnapshot,
    })
  )
}

export function updateAdminProducerMapContent(
  content: ProducerMapContent,
  revision: string | null
) {
  return adminApiClient.Put(
    adminApiPath("/producer-map"),
    { content, revision },
    parsed(producerMapAdminUpdateSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.producerMap,
      select: normalizeProducerMapAdminUpdate,
    })
  )
}

export function uploadAdminProducerMapImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    adminApiPath("/producer-map/images"),
    form,
    parsed(producerMapImageUploadSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
