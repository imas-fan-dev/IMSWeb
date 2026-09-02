import { adminApiPath, apiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../admin-client"
import { apiClient } from "../client"
import { parsed } from "../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  adminEditorialSpotlightSchema,
  editorialArticleListSchema,
  editorialArticleSchema,
  editorialArticleAssetSchema,
  editorialChroniclePageSchema,
  editorialDraftSchema,
  editorialLegacyInformationSchema,
  editorialRevisionSchema,
  editorialSpotlightSchema,
  editorialStatusChangeSchema,
} from "@imsweb/contracts/editorial"

export {
  editorialArticleSchema,
  editorialCoverTransformSchema,
} from "@imsweb/contracts/editorial"

export type {
  AdminEditorialSpotlightEntry as CommunitySpotlightEntry,
  EditorialArticle,
  EditorialArticleAsset as EditorialAsset,
  EditorialCoverTransform,
  EditorialEventKind,
  EditorialRelatedLink,
  EditorialSpotlightCategory,
} from "@imsweb/contracts/editorial"

type EditorialKind = "events" | "chronicle"
type EditorialStatusAction = "publish" | "unpublish" | "archive"

const COMMUNITY_POSTS = "/community-posts"

export function getEditorialEvent(id: string) {
  return apiClient.Get(
    apiPath(`/events/${encodeURIComponent(id)}`),
    parsed(editorialArticleSchema)
  )
}

export function getEditorialChroniclePage(limit = 24, cursor?: string) {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor
  return apiClient.Get(
    apiPath("/chronicle"),
    parsed(editorialChroniclePageSchema, { params })
  )
}

export function getEditorialChronicle(id: string) {
  return apiClient.Get(
    apiPath(`/chronicle/${encodeURIComponent(id)}`),
    parsed(editorialArticleSchema)
  )
}

export function getAdminEditorialEvents(status?: string) {
  return adminApiClient.Get(
    adminApiPath("/events"),
    parsed(editorialArticleListSchema, {
      meta: withBackofficeAuth(),
      params: status ? { status } : undefined,
    })
  )
}

export function getAdminCommunityPosts(status?: string) {
  return adminApiClient.Get(
    adminApiPath(COMMUNITY_POSTS),
    parsed(editorialArticleListSchema, {
      meta: withBackofficeAuth(),
      params: status ? { status } : undefined,
    })
  )
}

export function createAdminCommunityPost(
  title: string,
  kind: "event" | "notice"
) {
  return adminApiClient.Post(
    adminApiPath(COMMUNITY_POSTS),
    { title, kind },
    parsed(editorialDraftSchema, { meta: withBackofficeCsrf() })
  )
}

export function getAdminCommunityPost(id: number) {
  return adminApiClient.Get(
    adminApiPath(`${COMMUNITY_POSTS}/${id}`),
    parsed(editorialArticleSchema, { meta: withBackofficeAuth() })
  )
}

export function updateAdminCommunityPost(
  id: number,
  payload: Record<string, unknown>
) {
  return adminApiClient.Put(
    adminApiPath(`${COMMUNITY_POSTS}/${id}`),
    payload,
    parsed(editorialRevisionSchema, { meta: withBackofficeCsrf() })
  )
}

export function previewAdminCommunityPost(
  id: number,
  payload: Record<string, unknown>
) {
  return adminApiClient.Post(
    adminApiPath(`${COMMUNITY_POSTS}/${id}/preview`),
    payload,
    parsed(editorialArticleSchema, { meta: withBackofficeCsrf() })
  )
}

export function setAdminCommunityPostStatus(
  id: number,
  status: EditorialStatusAction,
  revision: number
) {
  return adminApiClient.Post(
    adminApiPath(`${COMMUNITY_POSTS}/${id}/${status}`),
    { revision },
    parsed(editorialStatusChangeSchema, { meta: withBackofficeCsrf() })
  )
}

export function getAdminCommunitySpotlight() {
  return adminApiClient.Get(
    adminApiPath(`${COMMUNITY_POSTS}/spotlight`),
    parsed(adminEditorialSpotlightSchema, { meta: withBackofficeAuth() })
  )
}

export function replaceAdminCommunitySpotlight(
  items: Array<{ postId: number; category: "activity" | "fan" }>
) {
  return adminApiClient.Put(
    adminApiPath(`${COMMUNITY_POSTS}/spotlight`),
    { items },
    { meta: withBackofficeCsrf() }
  )
}

export function getCommunitySpotlight() {
  return apiClient.Get(
    apiPath(`${COMMUNITY_POSTS}/spotlight`),
    parsed(editorialSpotlightSchema)
  )
}

export function getLegacyInformationPost(id: string) {
  return apiClient.Get(
    apiPath(`${COMMUNITY_POSTS}/legacy-information/${encodeURIComponent(id)}`),
    parsed(editorialLegacyInformationSchema)
  )
}

export function createAdminEditorialEvent(
  title: string,
  kind: "event" | "notice"
) {
  return adminApiClient.Post(
    adminApiPath("/events"),
    { title, kind },
    parsed(editorialDraftSchema, { meta: withBackofficeCsrf() })
  )
}

export function getAdminEditorialEvent(id: number) {
  return adminApiClient.Get(
    adminApiPath(`/events/${id}`),
    parsed(editorialArticleSchema, { meta: withBackofficeAuth() })
  )
}

export function updateAdminEditorialEvent(
  id: number,
  payload: Record<string, unknown>
) {
  return adminApiClient.Put(
    adminApiPath(`/events/${id}`),
    payload,
    parsed(editorialRevisionSchema, { meta: withBackofficeCsrf() })
  )
}

export function createAdminEditorialChronicle(
  title: string,
  sourceType: "official" | "community"
) {
  return adminApiClient.Post(
    adminApiPath("/chronicle"),
    { title, sourceType },
    parsed(editorialDraftSchema, { meta: withBackofficeCsrf() })
  )
}

export function getAdminEditorialChronicle(id: number) {
  return adminApiClient.Get(
    adminApiPath(`/chronicle/${id}`),
    parsed(editorialArticleSchema, { meta: withBackofficeAuth() })
  )
}

export function updateAdminEditorialChronicle(
  id: number,
  payload: Record<string, unknown>
) {
  return adminApiClient.Put(
    adminApiPath(`/chronicle/${id}`),
    payload,
    parsed(editorialRevisionSchema, { meta: withBackofficeCsrf() })
  )
}

export function setAdminEditorialStatus(
  kind: EditorialKind,
  id: number,
  status: EditorialStatusAction,
  revision: number
) {
  return adminApiClient.Post(
    adminApiPath(`/${kind}/${id}/${status}`),
    { revision },
    parsed(editorialStatusChangeSchema, { meta: withBackofficeCsrf() })
  )
}

export function deleteAdminEditorial(kind: EditorialKind, id: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    adminApiPath(`/${kind}/${id}`),
    undefined,
    { meta: withBackofficeCsrf() }
  )
}

export function uploadEditorialAsset(
  articleId: number,
  file: File,
  usage: "cover" | "body",
  altText: string
) {
  const form = new FormData()
  form.set("image", file)
  form.set("usage", usage)
  form.set("altText", altText)
  return adminApiClient.Post(
    adminApiPath(`/articles/${articleId}/assets`),
    form,
    parsed(editorialArticleAssetSchema, { meta: withBackofficeCsrf() })
  )
}

export function deleteEditorialAsset(articleId: number, assetId: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    adminApiPath(`/articles/${articleId}/assets/${assetId}`),
    undefined,
    { meta: withBackofficeCsrf() }
  )
}
