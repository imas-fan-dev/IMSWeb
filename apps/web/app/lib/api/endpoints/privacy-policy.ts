import { backofficeProtectedHttpErrorSchema } from "@imsweb/contracts/common"
import { adminApiPath, apiPath } from "@imsweb/contracts/paths"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  adminPrivacyPolicySnapshotSchema,
  adminPrivacyPolicyUpdateSchema,
  privacyPolicyErrorResponseSchema,
  privacyPolicyPublicResponseSchema,
} from "@imsweb/contracts/privacy-policy"

export {
  adminPrivacyPolicySnapshotSchema,
  adminPrivacyPolicyUpdateSchema,
  privacyPolicyContentSchema,
  privacyPolicyPublicResponseSchema,
} from "@imsweb/contracts/privacy-policy"
export type * from "@imsweb/contracts/privacy-policy"

import type { PrivacyPolicyDraft } from "@imsweb/contracts/privacy-policy"

export function getPrivacyPolicy() {
  return apiClient.Get(
    apiPath("/privacy-policy"),
    parsed(privacyPolicyPublicResponseSchema, {
      errorSchema: privacyPolicyErrorResponseSchema,
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.privacyPolicy,
    })
  )
}

export function getAdminPrivacyPolicy() {
  return adminApiClient.Get(
    adminApiPath("/privacy-policy"),
    parsed(adminPrivacyPolicySnapshotSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminPrivacyPolicy(
  content: PrivacyPolicyDraft,
  revision: string | null
) {
  return adminApiClient.Put(
    adminApiPath("/privacy-policy"),
    { content, revision },
    parsed(adminPrivacyPolicyUpdateSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.privacyPolicy,
    })
  )
}
