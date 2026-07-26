import { z } from "zod"

import { apiClient } from "../client"
import { withCsrf } from "../types"

export const producerMapSeriesSchema = z.enum([
  "all",
  "765",
  "cg",
  "ml",
  "sidem",
  "sc",
  "gakuen",
])

const producerMapRegionSchema = z.object({
  id: z.string(),
  province: z.string(),
  name: z.string(),
  summary: z.string(),
  contact: z.string(),
  linkUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  series: producerMapSeriesSchema,
  enabled: z.boolean(),
})

const producerMapCommunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: z.string(),
  region: z.string().nullable(),
  description: z.string(),
  contact: z.string(),
  linkUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  series: producerMapSeriesSchema,
  enabled: z.boolean(),
})

export const producerMapContentSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  subtitle: z.string(),
  introduction: z.string(),
  directoryTitle: z.string(),
  mapSourceLabel: z.string(),
  mapSourceUrl: z.string().url(),
  regions: z.array(producerMapRegionSchema),
  communities: z.array(producerMapCommunitySchema),
  updatedAt: z.string().datetime().nullable(),
})

const producerMapAdminSnapshotSchema = z.object({
  content: producerMapContentSchema,
  revision: z.string().nullable(),
})

const producerMapAdminUpdateSchema = producerMapAdminSnapshotSchema.extend({
  success: z.literal(true),
})

const producerMapGeometrySchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
})

export type ProducerMapSeries = z.infer<typeof producerMapSeriesSchema>
export type ProducerMapRegion = z.infer<typeof producerMapRegionSchema>
export type ProducerMapCommunity = z.infer<typeof producerMapCommunitySchema>
export type ProducerMapContent = z.infer<typeof producerMapContentSchema>
export type ProducerMapAdminSnapshot = z.infer<
  typeof producerMapAdminSnapshotSchema
>
export type ProducerMapGeometry = z.infer<typeof producerMapGeometrySchema>

export function getProducerMapGeometry() {
  return apiClient.Get<ProducerMapGeometry, unknown>(
    "/maps/china-provinces.json",
    {
      transform: (payload) => producerMapGeometrySchema.parse(payload),
    }
  )
}

export function getProducerMapContent() {
  return apiClient.Get<ProducerMapContent, unknown>("/api/producer-map", {
    transform: (payload) => producerMapContentSchema.parse(payload),
  })
}

export function getAdminProducerMapContent() {
  return apiClient.Get<ProducerMapAdminSnapshot, unknown>(
    "/api/admin/producer-map",
    {
      transform: (payload) => producerMapAdminSnapshotSchema.parse(payload),
    }
  )
}

export function updateAdminProducerMapContent(
  content: ProducerMapContent,
  revision: string | null
) {
  return apiClient.Put<z.infer<typeof producerMapAdminUpdateSchema>, unknown>(
    "/api/admin/producer-map",
    { content, revision },
    {
      meta: withCsrf(),
      transform: (payload) => producerMapAdminUpdateSchema.parse(payload),
    }
  )
}
