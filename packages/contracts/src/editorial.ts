import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  cursorPageInfoSchema,
  errorResponseSchema,
  exactJsonResponse,
  legacyPassthroughRequestObject,
  legacyStripRequestObject,
  successEnvelope,
} from "./common.js"

export const editorialIdSchema = z.number().int().positive()
const editorialResponseIdSchema = z.union([editorialIdSchema, z.string().regex(/^[1-9]\d*$/)])
export const editorialArticleStatusSchema = z.enum(["draft", "published", "archived"])
export const editorialEventKindSchema = z.enum(["event", "notice"])
export const editorialSpotlightCategorySchema = z.enum(["activity", "fan"])
export const editorialSourceTypeSchema = z.enum(["official", "community"])
export const editorialDatePrecisionSchema = z.enum(["year", "month", "day"])
export const editorialAssetUsageSchema = z.enum(["cover", "body"])

export const editorialCoverTransformResponseSchema = exactJsonResponse({
  focalX: z.number().min(0).max(1), focalY: z.number().min(0).max(1), zoom: z.number().min(1).max(3),
})
// Legacy callers still use this input schema. Response schemas use the exact variant above.
export const editorialCoverTransformSchema = z
  .object({
    focalX: z.coerce.number().min(0).max(1),
    focalY: z.coerce.number().min(0).max(1),
    zoom: z.coerce.number().min(1).max(3),
  })
  .default({ focalX: 0.5, focalY: 0.5, zoom: 1 })
export const editorialRelatedLinkSchema = exactJsonResponse({ label: z.string(), url: z.string() })
export const editorialRelatedLinkRequestSchema = legacyStripRequestObject({ label: z.string().trim().min(1).max(80), url: z.string().trim().min(1).max(1000) })

export const editorialArticleSchema = exactJsonResponse({
  id: editorialResponseIdSchema.optional(), article_id: editorialResponseIdSchema.optional(), title: z.string(), summary: z.string(), cover_url: z.string().nullable().optional(), cover_transform: editorialCoverTransformResponseSchema, image_url: z.string().nullable().optional(), created_at: z.string().nullable().optional(), updated_at: z.string().nullable().optional(), published_at: z.string().nullable().optional(), body_json: z.unknown().optional(), body_html: z.string(), status: editorialArticleStatusSchema, revision: z.number().int().nonnegative(), kind: editorialEventKindSchema.nullable().optional(), name: z.string().nullable().optional(), contact: z.string().nullable().optional(), start_at: z.string().nullable().optional(), end_at: z.string().nullable().optional(), timezone: z.string().nullable().optional(), venue_name: z.string().nullable().optional(), address: z.string().nullable().optional(), registration_url: z.string().nullable().optional(), event_status: z.string().nullable().optional(), source_url: z.string().nullable().optional(), related_links: z.array(editorialRelatedLinkSchema), spotlight_category: editorialSpotlightCategorySchema.nullable().optional(), spotlight_order: z.number().int().nonnegative().nullable().optional(), occurred_on: z.string().nullable().optional(), ended_on: z.string().nullable().optional(), date_precision: editorialDatePrecisionSchema.nullable().optional(), source_type: editorialSourceTypeSchema.nullable().optional(), source_event_id: editorialIdSchema.nullable().optional(), location: z.string().nullable().optional(), timeline_order: z.number().int().nonnegative().optional(), live_source_id: z.string().nullable().optional(), live_title: z.string().nullable().optional(), live_date: z.string().nullable().optional(), live_time: z.string().nullable().optional(), live_location: z.string().nullable().optional(), live_detail_url: z.string().nullable().optional(), live_franchises: z.array(z.string()).optional(), live_brand_codes: z.array(z.string()).optional(),
})
export const editorialArticleListSchema = exactJsonResponse({ items: z.array(editorialArticleSchema) })
export const editorialDraftSchema = exactJsonResponse({ id: editorialIdSchema, article_id: editorialIdSchema, revision: z.number().int().nonnegative() })
export const editorialRevisionSchema = exactJsonResponse({ revision: z.number().int().nonnegative() })
export const editorialStatusChangeSchema = exactJsonResponse({ status: editorialArticleStatusSchema, revision: z.number().int().nonnegative() })
export const editorialChroniclePageSchema = exactJsonResponse({ items: z.array(editorialArticleSchema), pageInfo: cursorPageInfoSchema })
export const editorialArticleAssetSchema = exactJsonResponse({ id: editorialIdSchema, article_id: editorialIdSchema, public_path: z.string(), asset_usage: editorialAssetUsageSchema, alt_text: z.string(), format: z.string().optional() })
export const editorialArticleAssetListSchema = exactJsonResponse({ items: z.array(editorialArticleAssetSchema) })
export const editorialSpotlightItemSchema = exactJsonResponse({ id: editorialIdSchema, title: z.string(), image_url: z.string().nullable().optional(), category: editorialSpotlightCategorySchema, sort_order: z.number().int(), cover_transform: editorialCoverTransformResponseSchema })
export const editorialSpotlightSchema = exactJsonResponse({ items: z.array(editorialSpotlightItemSchema) })
export const editorialLegacyInformationSchema = exactJsonResponse({ postId: editorialIdSchema.nullable() })
export const adminEditorialSpotlightEntrySchema = exactJsonResponse({ post_id: editorialIdSchema, category: editorialSpotlightCategorySchema, sort_order: z.number().int().nonnegative(), title: z.string(), status: editorialArticleStatusSchema, image_url: z.string().nullable().optional(), kind: editorialEventKindSchema, cover_transform: editorialCoverTransformResponseSchema })
export const adminEditorialSpotlightSchema = exactJsonResponse({ items: z.array(adminEditorialSpotlightEntrySchema) })

export const editorialIdParamsSchema = legacyStripRequestObject({ id: z.union([z.string(), z.number()]) })
export const editorialArticleAssetParamsSchema = legacyStripRequestObject({ articleId: z.union([z.string(), z.number()]), assetId: z.union([z.string(), z.number()]).optional() })
export const editorialLegacyInformationParamsSchema = legacyStripRequestObject({ id: z.string().trim().min(1).max(80) })
export const editorialStatusQuerySchema = legacyStripRequestObject({ status: editorialArticleStatusSchema.optional() })
export const editorialChronicleQuerySchema = legacyStripRequestObject({ limit: z.union([z.string(), z.number()]).optional(), cursor: z.string().optional() })
export const editorialSpotlightSelectionRequestSchema = legacyStripRequestObject({ items: z.array(legacyStripRequestObject({ postId: z.union([z.string(), z.number()]), category: editorialSpotlightCategorySchema })).max(100) })
// Existing article mutations intentionally retain the complete top-level editor payload.
export const editorialArticlePayloadSchema = legacyPassthroughRequestObject({})
export const editorialMutationResponseSchema = successEnvelope({})
export const editorialErrorResponseSchema = errorResponseSchema
export const editorialConflictErrorResponseSchema = exactJsonResponse({ error: z.string(), revision: z.number().int().nonnegative().optional() })
export const editorialAdminHttpErrorResponseSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  editorialConflictErrorResponseSchema,
])

export type EditorialArticleStatus = z.infer<typeof editorialArticleStatusSchema>
export type EditorialEventKind = z.infer<typeof editorialEventKindSchema>
export type EditorialSpotlightCategory = z.infer<typeof editorialSpotlightCategorySchema>
export type EditorialSourceType = z.infer<typeof editorialSourceTypeSchema>
export type EditorialDatePrecision = z.infer<typeof editorialDatePrecisionSchema>
export type EditorialAssetUsage = z.infer<typeof editorialAssetUsageSchema>
export type EditorialCoverTransform = z.infer<typeof editorialCoverTransformResponseSchema>
export type EditorialRelatedLink = z.infer<typeof editorialRelatedLinkSchema>
export type EditorialArticle = z.infer<typeof editorialArticleSchema>
export type EditorialArticleInput = z.input<typeof editorialArticleSchema>
export type EditorialArticleList = z.infer<typeof editorialArticleListSchema>
export type EditorialArticleListInput = z.input<typeof editorialArticleListSchema>
export type EditorialDraft = z.infer<typeof editorialDraftSchema>
export type EditorialDraftInput = z.input<typeof editorialDraftSchema>
export type EditorialRevision = z.infer<typeof editorialRevisionSchema>
export type EditorialStatusChange = z.infer<typeof editorialStatusChangeSchema>
export type EditorialChroniclePage = z.infer<typeof editorialChroniclePageSchema>
export type EditorialChroniclePageInput = z.input<typeof editorialChroniclePageSchema>
export type EditorialArticleAsset = z.infer<typeof editorialArticleAssetSchema>
export type EditorialArticleAssetInput = z.input<typeof editorialArticleAssetSchema>
export type EditorialArticleAssetList = z.infer<typeof editorialArticleAssetListSchema>
export type EditorialSpotlightItem = z.infer<typeof editorialSpotlightItemSchema>
export type EditorialSpotlightItemInput = z.input<typeof editorialSpotlightItemSchema>
export type EditorialSpotlight = z.infer<typeof editorialSpotlightSchema>
export type EditorialLegacyInformation = z.infer<typeof editorialLegacyInformationSchema>
export type AdminEditorialSpotlightEntry = z.infer<typeof adminEditorialSpotlightEntrySchema>
export type AdminEditorialSpotlightEntryInput = z.input<typeof adminEditorialSpotlightEntrySchema>
export type AdminEditorialSpotlight = z.infer<typeof adminEditorialSpotlightSchema>
export type EditorialArticlePayload = z.infer<typeof editorialArticlePayloadSchema>
export type EditorialMutation = z.infer<typeof editorialMutationResponseSchema>
export type EditorialErrorResponse = z.infer<typeof editorialErrorResponseSchema>
export type EditorialAdminHttpErrorResponse = z.infer<
  typeof editorialAdminHttpErrorResponseSchema
>
