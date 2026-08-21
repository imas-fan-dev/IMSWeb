import { z } from "zod"

import { apiClient } from "../client"
import { withCsrf } from "../types"
import { editorialCoverTransformSchema } from "./events"

const editorialId = z.coerce.number().int().positive()
const relatedLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(1000),
})
const articleSchema = z
  .object({
    id: editorialId.optional(),
    article_id: editorialId.optional(),
    title: z.string(),
    summary: z.string().optional().default(""),
    cover_url: z.string().nullable().optional(),
    cover_transform: editorialCoverTransformSchema,
    image_url: z.string().nullable().optional(),
    body_json: z.unknown().optional(),
    body_html: z.string().optional().default(""),
    status: z.enum(["draft", "published", "archived"]).default("published"),
    revision: z.coerce.number().int().nonnegative().default(0),
    kind: z.enum(["event", "notice"]).optional(),
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
    related_links: z.array(relatedLinkSchema).optional().default([]),
    spotlight_category: z.enum(["activity", "fan"]).nullable().optional(),
    spotlight_order: z.coerce.number().int().nonnegative().nullable().optional(),
    occurred_on: z.string().nullable().optional(),
    ended_on: z.string().nullable().optional(),
    date_precision: z.enum(["year", "month", "day"]).nullable().optional(),
    source_type: z.enum(["official", "community"]).nullable().optional(),
    source_event_id: editorialId.nullable().optional(),
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

const editorialListSchema = z.object({ items: z.array(articleSchema) })
const mutationSchema = z.object({
  id: editorialId,
  article_id: editorialId,
  revision: z.coerce.number().int().nonnegative(),
})
const revisionSchema = z.object({ revision: z.coerce.number().int().nonnegative() })
const chroniclePageSchema = z.object({
  items: z.array(articleSchema),
  pageInfo: z.object({ hasNextPage: z.boolean(), nextCursor: z.string().nullable() }),
})
const assetSchema = z.object({
  id: editorialId,
  article_id: editorialId,
  public_path: z.string(),
  asset_usage: z.enum(["cover", "body"]),
  alt_text: z.string(),
})
const spotlightEntrySchema = z.object({
  post_id: editorialId,
  category: z.enum(["activity", "fan"]),
  sort_order: z.coerce.number().int().nonnegative(),
  title: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  image_url: z.string().nullable().optional(),
  kind: z.enum(["event", "notice"]),
  cover_transform: editorialCoverTransformSchema,
})

export type EditorialArticle = z.infer<typeof articleSchema>
export type EditorialAsset = z.infer<typeof assetSchema>
export type CommunitySpotlightEntry = z.infer<typeof spotlightEntrySchema>
export type EditorialCoverTransform = z.infer<typeof editorialCoverTransformSchema>
export type EditorialRelatedLink = z.infer<typeof relatedLinkSchema>

export function getEditorialEvent(id: string) {
  return apiClient.Get<EditorialArticle, unknown>(`/api/events/${encodeURIComponent(id)}`, {
    transform: (payload) => articleSchema.parse(payload),
  })
}

export function getEditorialChroniclePage(limit = 24, cursor?: string) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor
  return apiClient.Get<z.infer<typeof chroniclePageSchema>, unknown>("/api/chronicle", {
    params,
    transform: (payload) => chroniclePageSchema.parse(payload),
  })
}

export function getEditorialChronicle(id: string) {
  return apiClient.Get<EditorialArticle, unknown>(`/api/chronicle/${encodeURIComponent(id)}`, {
    transform: (payload) => articleSchema.parse(payload),
  })
}

export function getAdminEditorialEvents(status?: string) {
  return apiClient.Get<z.infer<typeof editorialListSchema>, unknown>("/api/admin/events", {
    params: status ? { status } : undefined,
    transform: (payload) => editorialListSchema.parse(payload),
  })
}

export function getAdminCommunityPosts(status?: string) {
  return apiClient.Get<z.infer<typeof editorialListSchema>, unknown>("/api/admin/community-posts", {
    params: status ? { status } : undefined,
    transform: (payload) => editorialListSchema.parse(payload),
  })
}

export function createAdminCommunityPost(title: string, kind: "event" | "notice") {
  return apiClient.Post<z.infer<typeof mutationSchema>, unknown>(
    "/api/admin/community-posts",
    { title, kind },
    { meta: withCsrf(), transform: (payload) => mutationSchema.parse(payload) }
  )
}

export function getAdminCommunityPost(id: number) {
  return apiClient.Get<EditorialArticle, unknown>(`/api/admin/community-posts/${id}`, {
    transform: (payload) => articleSchema.parse(payload),
  })
}

export function updateAdminCommunityPost(id: number, payload: Record<string, unknown>) {
  return apiClient.Put<z.infer<typeof revisionSchema>, unknown>(
    `/api/admin/community-posts/${id}`,
    payload,
    { meta: withCsrf(), transform: (value) => revisionSchema.parse(value) }
  )
}

export function previewAdminCommunityPost(id: number, payload: Record<string, unknown>) {
  return apiClient.Post<EditorialArticle, unknown>(
    `/api/admin/community-posts/${id}/preview`,
    payload,
    { meta: withCsrf(), transform: (value) => articleSchema.parse(value) }
  )
}

export function setAdminCommunityPostStatus(
  id: number,
  status: "publish" | "unpublish" | "archive",
  revision: number
) {
  return apiClient.Post<{ status: string; revision: number }, unknown>(
    `/api/admin/community-posts/${id}/${status}`,
    { revision },
    { meta: withCsrf() }
  )
}

export function getAdminCommunitySpotlight() {
  return apiClient.Get<{ items: CommunitySpotlightEntry[] }, unknown>(
    "/api/admin/community-posts/spotlight",
    { transform: (value) => z.object({ items: z.array(spotlightEntrySchema) }).parse(value) }
  )
}

export function replaceAdminCommunitySpotlight(
  items: Array<{ postId: number; category: "activity" | "fan" }>
) {
  return apiClient.Put<{ success: true }, unknown>(
    "/api/admin/community-posts/spotlight",
    { items },
    { meta: withCsrf() }
  )
}

export function getCommunitySpotlight() {
  return apiClient.Get<{ items: Array<{ id: number; title: string; image_url?: string | null; category: "activity" | "fan"; sort_order: number; cover_transform: z.infer<typeof editorialCoverTransformSchema> }> }, unknown>(
    "/api/community-posts/spotlight",
    { transform: (value) => z.object({ items: z.array(z.object({ id: editorialId, title: z.string(), image_url: z.string().nullable().optional(), category: z.enum(["activity", "fan"]), sort_order: z.coerce.number().int(), cover_transform: editorialCoverTransformSchema })) }).parse(value) }
  )
}

export function getLegacyInformationPost(id: string) {
  return apiClient.Get<{ postId: number | null }, unknown>(
    `/api/community-posts/legacy-information/${encodeURIComponent(id)}`,
    { transform: (value) => z.object({ postId: editorialId.nullable() }).parse(value) }
  )
}

export function createAdminEditorialEvent(title: string, kind: "event" | "notice") {
  return apiClient.Post<z.infer<typeof mutationSchema>, unknown>(
    "/api/admin/events",
    { title, kind },
    { meta: withCsrf(), transform: (payload) => mutationSchema.parse(payload) }
  )
}

export function getAdminEditorialEvent(id: number) {
  return apiClient.Get<EditorialArticle, unknown>(`/api/admin/events/${id}`, {
    transform: (payload) => articleSchema.parse(payload),
  })
}

export function updateAdminEditorialEvent(id: number, payload: Record<string, unknown>) {
  return apiClient.Put<z.infer<typeof revisionSchema>, unknown>(
    `/api/admin/events/${id}`,
    payload,
    { meta: withCsrf(), transform: (value) => revisionSchema.parse(value) }
  )
}

export function createAdminEditorialChronicle(title: string, sourceType: "official" | "community") {
  return apiClient.Post<z.infer<typeof mutationSchema>, unknown>(
    "/api/admin/chronicle",
    { title, sourceType },
    { meta: withCsrf(), transform: (payload) => mutationSchema.parse(payload) }
  )
}

export function getAdminEditorialChronicle(id: number) {
  return apiClient.Get<EditorialArticle, unknown>(`/api/admin/chronicle/${id}`, {
    transform: (payload) => articleSchema.parse(payload),
  })
}

export function updateAdminEditorialChronicle(id: number, payload: Record<string, unknown>) {
  return apiClient.Put<z.infer<typeof revisionSchema>, unknown>(
    `/api/admin/chronicle/${id}`,
    payload,
    { meta: withCsrf(), transform: (value) => revisionSchema.parse(value) }
  )
}

export function setAdminEditorialStatus(
  kind: "events" | "chronicle",
  id: number,
  status: "publish" | "unpublish" | "archive",
  revision: number
) {
  return apiClient.Post<{ status: string; revision: number }, unknown>(
    `/api/admin/${kind}/${id}/${status}`,
    { revision },
    { meta: withCsrf() }
  )
}

export function deleteAdminEditorial(kind: "events" | "chronicle", id: number) {
  return apiClient.Delete<{ success: true }, unknown>(`/api/admin/${kind}/${id}`, undefined, {
    meta: withCsrf(),
  })
}

export function uploadEditorialAsset(articleId: number, file: File, usage: "cover" | "body", altText: string) {
  const form = new FormData()
  form.set("image", file)
  form.set("usage", usage)
  form.set("altText", altText)
  return apiClient.Post<EditorialAsset, unknown>(
    `/api/admin/articles/${articleId}/assets`,
    form,
    { meta: withCsrf(), transform: (payload) => assetSchema.parse(payload) }
  )
}

export function deleteEditorialAsset(articleId: number, assetId: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/admin/articles/${articleId}/assets/${assetId}`,
    undefined,
    { meta: withCsrf() }
  )
}
