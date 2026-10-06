import { communityApiPath, adminApiPath } from "@imsweb/contracts/paths"
import { backofficeProtectedHttpErrorSchema } from "@imsweb/contracts/common"
import {
  communityContentSchema,
  communityContentErrorResponseSchema,
  communityContentDraftSchema,
  adminCommunityContentSnapshotSchema,
  adminCommunityContentUpdateSchema,
  adminCommunityContentImageUploadSchema,
  type CommunityContentDraft,
} from "@imsweb/contracts/community-content"
import { apiClient } from "../client"
import { adminApiClient } from "../admin-client"
import { parsed } from "../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

export { communityContentDraftSchema }
export type * from "@imsweb/contracts/community-content"

export function getCommunityContent() {
  return apiClient.Get(
    communityApiPath("/content"),
    parsed(communityContentSchema, {
      errorSchema: communityContentErrorResponseSchema,
      cacheFor: 0,
    })
  )
}

export function getAdminCommunityContent() {
  return adminApiClient.Get(
    adminApiPath("/community-content"),
    parsed(adminCommunityContentSnapshotSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
      cacheFor: 0,
    })
  )
}

export function updateAdminCommunityContent(
  content: CommunityContentDraft,
  revision: string | null
) {
  return adminApiClient.Put(
    adminApiPath("/community-content"),
    { content, revision },
    parsed(adminCommunityContentUpdateSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function uploadAdminCommunityContentImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    adminApiPath("/community-content/images"),
    form,
    parsed(adminCommunityContentImageUploadSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
