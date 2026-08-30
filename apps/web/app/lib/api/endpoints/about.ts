import { adminApiPath, apiPath } from "@imsweb/contracts/paths"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import {
  normalizeAboutAdminSnapshot,
  normalizeAboutAdminUpdate,
  normalizeAboutPageContent,
} from "../media-urls"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  aboutAdminSnapshotSchema,
  aboutAdminUpdateSchema,
  aboutImageUploadSchema,
  aboutPageContentSchema,
} from "@imsweb/contracts/about"

export {
  aboutPersonSchema,
  aboutGroupSchema,
  aboutPageContentSchema,
  aboutAdminSnapshotSchema,
  aboutAdminUpdateSchema,
  aboutImageUploadSchema,
} from "@imsweb/contracts/about"
export type * from "@imsweb/contracts/about"

import type { AboutPageContent } from "@imsweb/contracts/about"

export function getAboutPageContent() {
  return apiClient.Get(
    apiPath("/about"),
    parsed(aboutPageContentSchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
      select: normalizeAboutPageContent,
    })
  )
}

export function getAdminAboutPageContent() {
  return adminApiClient.Get(
    adminApiPath("/about"),
    parsed(aboutAdminSnapshotSchema, {
      meta: withBackofficeAuth(),
      select: normalizeAboutAdminSnapshot,
    })
  )
}

export function updateAdminAboutPageContent(
  content: AboutPageContent,
  revision: string | null
) {
  return adminApiClient.Put(
    adminApiPath("/about"),
    { content, revision },
    parsed(aboutAdminUpdateSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
      select: normalizeAboutAdminUpdate,
    })
  )
}

export function uploadAboutHeroImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    adminApiPath("/about/hero-image"),
    form,
    parsed(aboutImageUploadSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    })
  )
}

export function uploadAboutMemberAvatar(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    adminApiPath("/about/member-avatar"),
    form,
    parsed(aboutImageUploadSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    })
  )
}
