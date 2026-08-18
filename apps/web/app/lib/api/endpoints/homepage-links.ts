
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
  return apiClient.Get<HomepageLinks, unknown>("/api/homepage-links", {
    cacheFor: STABLE_CONTENT_CACHE_FOR,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    transform: (payload) => homepageLinksSchema.parse(payload),
  })
}

export function getAdminHomepageLinks() {
  return adminApiClient.Get<HomepageLinks, unknown>(
    "/api/admin/homepage-links",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => homepageLinksSchema.parse(payload),
    }
  )
}

export function createHomepageLink(submission: HomepageLinkSubmission) {
  return adminApiClient.Post<{ success: true; link: HomepageLink }, unknown>(
    "/api/admin/homepage-links",
    submission,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    }
  )
}

export function updateHomepageLink(
  id: string,
  submission: Omit<HomepageLinkSubmission, "section">
) {
  return adminApiClient.Put<{ success: true; link: HomepageLink }, unknown>(
    `/api/admin/homepage-links/${encodeURIComponent(id)}`,
    submission,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    }
  )
}

export function deleteHomepageLink(id: string) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/admin/homepage-links/${encodeURIComponent(id)}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    }
  )
}

export function reorderHomepageLinks(
  section: HomepageLinkSection,
  ids: string[]
) {
  return adminApiClient.Put<{ success: true }, unknown>(
    `/api/admin/homepage-links/${section}/order`,
    { ids },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.homepageLinks,
    }
  )
}
