import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  STABLE_CONTENT_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  aboutAdminSnapshotSchema,
  aboutAdminUpdateSchema,
  aboutImageUploadSchema,
  aboutPageContentSchema,
} from "@imsweb/contracts/about"

export * from "@imsweb/contracts/about"

import type { AboutPageContent } from "@imsweb/contracts/about"

export function getAboutPageContent() {
  return apiClient.Get(
    "/api/about",
    parsed(aboutPageContentSchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    })
  )
}

export function getAdminAboutPageContent() {
  return adminApiClient.Get(
    "/api/admin/about",
    parsed(aboutAdminSnapshotSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminAboutPageContent(
  content: AboutPageContent,
  revision: string | null
) {
  return adminApiClient.Put(
    "/api/admin/about",
    { content, revision },
    parsed(aboutAdminUpdateSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    })
  )
}

export function uploadAboutHeroImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    "/api/admin/about/hero-image",
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
    "/api/admin/about/member-avatar",
    form,
    parsed(aboutImageUploadSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    })
  )
}
