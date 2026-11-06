import { adminApiPath, apiPath } from "@imsweb/contracts/paths"
import {
  backofficeProtectedHttpErrorSchema,
  successFlagSchema,
} from "@imsweb/contracts/common"
import {
  homepageLinkErrorResponseSchema,
  homepageLinkMutationSchema,
} from "@imsweb/contracts/homepage-links"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import { homepageLinksSchema } from "@imsweb/contracts/homepage-links"

export {
  homepageLinkSectionSchema,
  homepageLinkIconSchema,
  homepageLinkAccentSchema,
  homepageLinkSchema,
  homepageLinksSchema,
  homepageLinkMutationSchema,
} from "@imsweb/contracts/homepage-links"
export type * from "@imsweb/contracts/homepage-links"

import type {
  HomepageLinkSection,
  HomepageLinks,
} from "@imsweb/contracts/homepage-links"

export type HomepageLinkSubmission =
  import("@imsweb/contracts/homepage-links").HomepageLinkCreateRequest

export const emptyHomepageLinks: HomepageLinks = {
  sections: { navigation: [], friend: [], support: [] },
}

export function getHomepageLinks() {
  return apiClient.Get(
    apiPath("/homepage-links"),
    parsed(homepageLinksSchema, {
      errorSchema: homepageLinkErrorResponseSchema,
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function getAdminHomepageLinks() {
  return adminApiClient.Get(
    adminApiPath("/homepage-links"),
    parsed(homepageLinksSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createHomepageLink(submission: HomepageLinkSubmission) {
  return adminApiClient.Post(
    adminApiPath("/homepage-links"),
    submission,
    parsed(homepageLinkMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function updateHomepageLink(
  id: string,
  submission: Omit<HomepageLinkSubmission, "section">
) {
  return adminApiClient.Put(
    adminApiPath(`/homepage-links/${encodeURIComponent(id)}`),
    submission,
    parsed(homepageLinkMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function deleteHomepageLink(id: string) {
  return adminApiClient.Delete(
    adminApiPath(`/homepage-links/${encodeURIComponent(id)}`),
    undefined,
    parsed(successFlagSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function reorderHomepageLinks(
  section: HomepageLinkSection,
  ids: string[]
) {
  return adminApiClient.Put(
    adminApiPath(`/homepage-links/${section}/order`),
    { ids },
    parsed(successFlagSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}
