import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, legacyStripRequestObject, successEnvelope } from "./common.js"
export const producerMapSeriesSchema = z.enum(["all", "765", "cg", "ml", "sidem", "sc", "gakuen"])
const producerMapRegionFields = { id: z.string(), province: z.string(), name: z.string(), summary: z.string(), contact: z.string(), linkUrl: z.string().nullable(), imageUrl: z.string().nullable(), series: producerMapSeriesSchema, enabled: z.boolean() }
const producerMapCommunityFields = { id: z.string(), name: z.string(), platform: z.string(), region: z.string().nullable(), description: z.string(), contact: z.string(), linkUrl: z.string().nullable(), imageUrl: z.string().nullable(), series: producerMapSeriesSchema, enabled: z.boolean() }
export const producerMapRegionSchema = exactJsonResponse(producerMapRegionFields)
export const producerMapCommunitySchema = exactJsonResponse(producerMapCommunityFields)
const producerMapContentFields = { version: z.literal(1), title: z.string(), subtitle: z.string(), introduction: z.string(), directoryTitle: z.string(), mapSourceLabel: z.string(), mapSourceUrl: z.string().url(), regions: z.array(producerMapRegionSchema), communities: z.array(producerMapCommunitySchema) }
export const producerMapContentSchema = exactJsonResponse({ ...producerMapContentFields, updatedAt: z.string().datetime().nullable() })
// The API adapter retains the legacy nested validation messages and projection.
export const producerMapUpdateRequestSchema = legacyStripRequestObject({ content: z.unknown(), revision: z.unknown() })
export const producerMapAdminSnapshotSchema = exactJsonResponse({ content: producerMapContentSchema.nullable(), revision: z.string().nullable() })
export const producerMapAdminUpdateSchema = successEnvelope({ content: producerMapContentSchema, revision: z.string() })
export const producerMapImageUploadSchema = successEnvelope({ url: z.string() })
export const producerMapGeometrySchema = exactJsonResponse({ type: z.literal("FeatureCollection"), features: z.array(z.unknown()) })
export const producerMapErrorResponseSchema = errorResponseSchema
export type ProducerMapSeries = z.infer<typeof producerMapSeriesSchema>
export type ProducerMapRegion = z.infer<typeof producerMapRegionSchema>
export type ProducerMapCommunity = z.infer<typeof producerMapCommunitySchema>
export type ProducerMapContent = z.infer<typeof producerMapContentSchema>
export type ProducerMapUpdateRequest = z.infer<typeof producerMapUpdateRequestSchema>
export type ProducerMapAdminSnapshot = z.infer<typeof producerMapAdminSnapshotSchema>
export type ProducerMapGeometry = z.infer<typeof producerMapGeometrySchema>
export type ProducerMapAdminUpdate = z.infer<typeof producerMapAdminUpdateSchema>
export type ProducerMapImageUpload = z.infer<typeof producerMapImageUploadSchema>
export type ProducerMapErrorResponse = z.infer<typeof producerMapErrorResponseSchema>
