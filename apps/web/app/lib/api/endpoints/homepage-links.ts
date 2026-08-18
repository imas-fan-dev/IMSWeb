import { successFlagSchema } from "@imsweb/contracts/common"
import { homepageLinkMutationSchema } from "@imsweb/contracts/homepage-links"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import { homepageLinksSchema } from "@imsweb/contracts/homepage-links"

export * from "@imsweb/contracts/homepage-links"

import type {
  HomepageLink,
  HomepageLinkSection,
  HomepageLinks,
} from "@imsweb/contracts/homepage-links"

export type HomepageLinkSubmission = Omit<HomepageLink, "id" | "displayOrder">

export const emptyHomepageLinks: HomepageLinks = {
  sections: { navigation: [], friend: [], support: [] },
}

export function getHomepageLinks() {
  return apiClient.Get(
    "/api/homepage-links",
    parsed(homepageLinksSchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function getAdminHomepageLinks() {
  return adminApiClient.Get(
    "/api/admin/homepage-links",
    parsed(homepageLinksSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function createHomepageLink(submission: HomepageLinkSubmission) {
  return adminApiClient.Post(
    "/api/admin/homepage-links",
    submission,
    parsed(homepageLinkMutationSchema, {
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
    `/api/admin/homepage-links/${encodeURIComponent(id)}`,
    submission,
    parsed(homepageLinkMutationSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}

export function deleteHomepageLink(id: string) {
  return adminApiClient.Delete(
    `/api/admin/homepage-links/${encodeURIComponent(id)}`,
    undefined,
    parsed(successFlagSchema, {
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
    `/api/admin/homepage-links/${section}/order`,
    { ids },
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    })
  )
}
