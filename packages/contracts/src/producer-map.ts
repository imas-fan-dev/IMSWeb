import { z } from "zod"
import { successEnvelope } from "./common.js"

export const producerMapSeriesSchema = z.enum([
  "all",
  "765",
  "cg",
  "ml",
  "sidem",
  "sc",
  "gakuen",
])

export const producerMapRegionSchema = z.object({
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

export const producerMapCommunitySchema = z.object({
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

export const producerMapAdminSnapshotSchema = z.object({
  content: producerMapContentSchema.nullable(),
  revision: z.string().nullable(),
})

export const producerMapAdminUpdateSchema = successEnvelope({
  content: producerMapContentSchema,
  revision: z.string(),
})

export const producerMapImageUploadSchema = successEnvelope({
  url: z.string(),
})

export const producerMapGeometrySchema = z.object({
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

export type ProducerMapAdminUpdate = z.infer<typeof producerMapAdminUpdateSchema>

export type ProducerMapImageUpload = z.infer<typeof producerMapImageUploadSchema>
