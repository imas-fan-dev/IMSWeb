import { z } from "zod"

// 文章 CMS 的线格式。articles 是正文与状态载体，社区帖子（events 兼容存储）
// 与编年史条目共用同一份文章骨架，因此这里只有一个宽松的 article 读模型，
// 由两侧各自的必填字段在业务层收敛。

// 仓储层的 ID 在 PostgreSQL 驱动下可能是 string 也可能是 number，
// 因此入参放宽到两者，出参统一收敛为正整数。
export const editorialIdSchema = z
  .union([z.string(), z.number()])
  .pipe(z.coerce.number().int().positive())

export const editorialArticleStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
])

export const editorialEventKindSchema = z.enum(["event", "notice"])

export const editorialSpotlightCategorySchema = z.enum(["activity", "fan"])

export const editorialSourceTypeSchema = z.enum(["official", "community"])

export const editorialDatePrecisionSchema = z.enum(["year", "month", "day"])

export const editorialAssetUsageSchema = z.enum(["cover", "body"])

export const editorialCoverTransformSchema = z
  .object({
    focalX: z.coerce.number().min(0).max(1),
    focalY: z.coerce.number().min(0).max(1),
    zoom: z.coerce.number().min(1).max(3),
  })
  .default({ focalX: 0.5, focalY: 0.5, zoom: 1 })

export const editorialRelatedLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(1000),
})

export const editorialArticleSchema = z
  .object({
    id: editorialIdSchema.optional(),
    article_id: editorialIdSchema.optional(),
    title: z.string(),
    summary: z.string().optional().default(""),
    cover_url: z.string().nullable().optional(),
    cover_transform: editorialCoverTransformSchema,
    image_url: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    published_at: z.string().nullable().optional(),
    body_json: z.unknown().optional(),
    body_html: z.string().optional().default(""),
    status: editorialArticleStatusSchema.default("published"),
    revision: z.coerce.number().int().nonnegative().default(0),
    kind: editorialEventKindSchema.nullable().optional(),
    name: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    start_at: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    venue_name: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    registration_url: z.string().nullable().optional(),
    event_status: z.string().nullable().optional(),
    source_url: z.string().nullable().optional(),
    related_links: z.array(editorialRelatedLinkSchema).optional().default([]),
    spotlight_category: editorialSpotlightCategorySchema.nullable().optional(),
    spotlight_order: z.coerce.number().int().nonnegative().nullable().optional(),
    occurred_on: z.string().nullable().optional(),
    ended_on: z.string().nullable().optional(),
    date_precision: editorialDatePrecisionSchema.nullable().optional(),
    source_type: editorialSourceTypeSchema.nullable().optional(),
    source_event_id: editorialIdSchema.nullable().optional(),
    location: z.string().nullable().optional(),
    timeline_order: z.coerce.number().int().nonnegative().optional(),
    live_source_id: z.string().nullable().optional(),
    live_title: z.string().nullable().optional(),
    live_date: z.string().nullable().optional(),
    live_time: z.string().nullable().optional(),
    live_location: z.string().nullable().optional(),
    live_detail_url: z.string().nullable().optional(),
    live_franchises: z.array(z.string()).optional().default([]),
    live_brand_codes: z.array(z.string()).optional().default([]),
  })
  .passthrough()

export const editorialArticleListSchema = z.object({
  items: z.array(editorialArticleSchema),
})

export const editorialDraftSchema = z.object({
  id: editorialIdSchema,
  article_id: editorialIdSchema,
  revision: z.coerce.number().int().nonnegative(),
})

export const editorialRevisionSchema = z.object({
  revision: z.coerce.number().int().nonnegative(),
})

export const editorialStatusChangeSchema = z.object({
  status: editorialArticleStatusSchema,
  revision: z.coerce.number().int().nonnegative(),
})

export const editorialChroniclePageSchema = z.object({
  items: z.array(editorialArticleSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
})

export const editorialArticleAssetSchema = z.object({
  id: editorialIdSchema,
  article_id: editorialIdSchema,
  public_path: z.string(),
  asset_usage: editorialAssetUsageSchema,
  alt_text: z.string(),
})

export const editorialArticleAssetListSchema = z.object({
  items: z.array(editorialArticleAssetSchema),
})

export const editorialSpotlightItemSchema = z.object({
  id: editorialIdSchema,
  title: z.string(),
  image_url: z.string().nullable().optional(),
  category: editorialSpotlightCategorySchema,
  sort_order: z.coerce.number().int(),
  cover_transform: editorialCoverTransformSchema,
})

export const editorialSpotlightSchema = z.object({
  items: z.array(editorialSpotlightItemSchema),
})

export const editorialLegacyInformationSchema = z.object({
  postId: editorialIdSchema.nullable(),
})

export const adminEditorialSpotlightEntrySchema = z.object({
  post_id: editorialIdSchema,
  category: editorialSpotlightCategorySchema,
  sort_order: z.coerce.number().int().nonnegative(),
  title: z.string(),
  status: editorialArticleStatusSchema,
  image_url: z.string().nullable().optional(),
  kind: editorialEventKindSchema,
  cover_transform: editorialCoverTransformSchema,
})

export const adminEditorialSpotlightSchema = z.object({
  items: z.array(adminEditorialSpotlightEntrySchema),
})

export type EditorialArticleStatus = z.infer<
  typeof editorialArticleStatusSchema
>

export type EditorialEventKind = z.infer<typeof editorialEventKindSchema>

export type EditorialSpotlightCategory = z.infer<
  typeof editorialSpotlightCategorySchema
>

export type EditorialSourceType = z.infer<typeof editorialSourceTypeSchema>

export type EditorialDatePrecision = z.infer<
  typeof editorialDatePrecisionSchema
>

export type EditorialAssetUsage = z.infer<typeof editorialAssetUsageSchema>

export type EditorialCoverTransform = z.infer<
  typeof editorialCoverTransformSchema
>

export type EditorialRelatedLink = z.infer<typeof editorialRelatedLinkSchema>

export type EditorialArticle = z.infer<typeof editorialArticleSchema>

export type EditorialArticleInput = z.input<typeof editorialArticleSchema>

export type EditorialArticleList = z.infer<typeof editorialArticleListSchema>

export type EditorialArticleListInput = z.input<
  typeof editorialArticleListSchema
>

export type EditorialDraft = z.infer<typeof editorialDraftSchema>

export type EditorialDraftInput = z.input<typeof editorialDraftSchema>

export type EditorialRevision = z.infer<typeof editorialRevisionSchema>

export type EditorialStatusChange = z.infer<typeof editorialStatusChangeSchema>

export type EditorialChroniclePage = z.infer<
  typeof editorialChroniclePageSchema
>

export type EditorialChroniclePageInput = z.input<
  typeof editorialChroniclePageSchema
>

export type EditorialArticleAsset = z.infer<typeof editorialArticleAssetSchema>

export type EditorialArticleAssetInput = z.input<
  typeof editorialArticleAssetSchema
>

export type EditorialSpotlightItem = z.infer<
  typeof editorialSpotlightItemSchema
>

export type EditorialSpotlightItemInput = z.input<
  typeof editorialSpotlightItemSchema
>

export type EditorialSpotlight = z.infer<typeof editorialSpotlightSchema>

export type EditorialLegacyInformation = z.infer<
  typeof editorialLegacyInformationSchema
>

export type AdminEditorialSpotlightEntry = z.infer<
  typeof adminEditorialSpotlightEntrySchema
>

export type AdminEditorialSpotlightEntryInput = z.input<
  typeof adminEditorialSpotlightEntrySchema
>

export type AdminEditorialSpotlight = z.infer<
  typeof adminEditorialSpotlightSchema
>
