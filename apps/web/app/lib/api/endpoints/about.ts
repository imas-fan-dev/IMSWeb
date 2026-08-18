import { z } from "@imsweb/contracts/z"

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

import type {
  AboutAdminSnapshot,
  AboutPageContent,
} from "@imsweb/contracts/about"

export function getAboutPageContent() {
  return apiClient.Get<AboutPageContent, unknown>("/api/about", {
    cacheFor: STABLE_CONTENT_CACHE_FOR,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
    transform: (payload) => aboutPageContentSchema.parse(payload),
  })
}

export function getAdminAboutPageContent() {
  return adminApiClient.Get<AboutAdminSnapshot, unknown>("/api/admin/about", {
    meta: withBackofficeAuth(),
    transform: (payload) => aboutAdminSnapshotSchema.parse(payload),
  })
}

export function updateAdminAboutPageContent(
  content: AboutPageContent,
  revision: string | null
) {
  return adminApiClient.Put<z.infer<typeof aboutAdminUpdateSchema>, unknown>(
    "/api/admin/about",
    { content, revision },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
      transform: (payload) => aboutAdminUpdateSchema.parse(payload),
    }
  )
}

export function uploadAboutHeroImage(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post<z.infer<typeof aboutImageUploadSchema>, unknown>(
    "/api/admin/about/hero-image",
    form,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
      transform: (payload) => aboutImageUploadSchema.parse(payload),
    }
  )
}

export function uploadAboutMemberAvatar(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post<z.infer<typeof aboutImageUploadSchema>, unknown>(
    "/api/admin/about/member-avatar",
    form,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.about,
      transform: (payload) => aboutImageUploadSchema.parse(payload),
    }
  )
}
