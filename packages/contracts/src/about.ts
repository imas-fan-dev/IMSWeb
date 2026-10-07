import { z } from "zod"
import {
  errorResponseSchema,
  exactJsonResponse,
  legacyStripRequestObject,
  successEnvelope,
} from "./common.js"

export const aboutPersonSchema = exactJsonResponse({
  id: z.string(), name: z.string(), role: z.string(), description: z.string(),
  since: z.string(), profileUrl: z.string().url().nullable(), avatarUrl: z.string().nullable(),
})
export const aboutGroupSchema = exactJsonResponse({
  id: z.string(), title: z.string(), subtitle: z.string(), people: z.array(aboutPersonSchema),
})
const aboutPageContentFields = {
  version: z.literal(1), siteName: z.string(), siteNameEn: z.string(), tagline: z.string(),
  heroImageUrl: z.string().nullable(), heroImageAlt: z.string(),
  heroImageScale: z.number().int().min(60).max(160),
  heroImageOffsetX: z.number().int().min(-40).max(40),
  heroImageOffsetY: z.number().int().min(-40).max(40),
  accentColorStart: z.string().regex(/^#[0-9a-f]{6}$/i),
  accentColorEnd: z.string().regex(/^#[0-9a-f]{6}$/i),
  welcome: z.string(), manifesto: z.array(z.string()), sinceYear: z.number().int(),
  overviewTitle: z.string(), overview: z.array(z.string()), groups: z.array(aboutGroupSchema),
}
export const aboutPageContentSchema = exactJsonResponse({ ...aboutPageContentFields, updatedAt: z.string().datetime().nullable() })
// The API adapter retains the legacy nested validation messages and projection.
export const aboutPageUpdateRequestSchema = legacyStripRequestObject({
  content: z.unknown(), revision: z.unknown(),
})
export const aboutAdminSnapshotSchema = exactJsonResponse({ content: aboutPageContentSchema.nullable(), revision: z.string().nullable() })
export const aboutAdminUpdateSchema = successEnvelope({ content: aboutPageContentSchema, revision: z.string() })
export const aboutImageUploadSchema = successEnvelope({ url: z.string().min(1) })
export const aboutErrorResponseSchema = errorResponseSchema
export type AboutPerson = z.infer<typeof aboutPersonSchema>
export type AboutGroup = z.infer<typeof aboutGroupSchema>
export type AboutPageContent = z.infer<typeof aboutPageContentSchema>
export type AboutPageUpdateRequest = z.infer<typeof aboutPageUpdateRequestSchema>
export type AboutAdminSnapshot = z.infer<typeof aboutAdminSnapshotSchema>
export type AboutAdminUpdate = z.infer<typeof aboutAdminUpdateSchema>
export type AboutImageUpload = z.infer<typeof aboutImageUploadSchema>
export type AboutErrorResponse = z.infer<typeof aboutErrorResponseSchema>
