import {
  adminCatalogHttpErrorSchema,
  catalogBirthdaysSchema,
  adminCatalogStoryTargetResponseSchema,
  type AdminCatalogStoryTargetRequest,
  adminCatalogMutationSchema,
  adminCatalogSchema,
  adminCatalogCreateCharacterResponseSchema,
  type AdminCatalogCreateCharacterRequest,
  type AdminCatalogDefaultProfileRequest,
  type AdminCatalogBindingRequest,
  type AdminCatalogGroupKindRequest,
  type AdminCatalogMediaRequest,
  type AdminCatalogProfileRequest,
} from "@imsweb/contracts/catalog"
import { adminApiPath, apiPath } from "@imsweb/contracts/paths"
import { apiClient } from "../client"

import { adminApiClient } from "../admin-client"
import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { parsed } from "../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

export type * from "@imsweb/contracts/catalog"

const path = adminApiPath("/catalog")

export function getCatalogBirthdays() {
  return apiClient.Get(
    apiPath("/birthdays"),
    parsed(catalogBirthdaysSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      cacheFor: PUBLIC_QUERY_CACHE_FOR,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function ensureAdminCharacterStoryTarget(
  input: AdminCatalogStoryTargetRequest
) {
  return adminApiClient.Post(
    `${path}/story-target`,
    input,
    parsed(adminCatalogStoryTargetResponseSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function createAdminCatalogCharacter(
  input: AdminCatalogCreateCharacterRequest
) {
  return adminApiClient.Post(
    `${path}/characters`,
    input,
    parsed(adminCatalogCreateCharacterResponseSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function setAdminCatalogDefaultProfile(
  input: AdminCatalogDefaultProfileRequest
) {
  return adminApiClient.Put(
    `${path}/default-profile`,
    input,
    parsed(adminCatalogMutationSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function getAdminCatalog() {
  return adminApiClient.Get(
    path,
    parsed(adminCatalogSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      cacheFor: NO_CLIENT_CACHE,
      meta: withBackofficeAuth(),
    })
  )
}

export function saveAdminCatalogProfile(input: AdminCatalogProfileRequest) {
  return adminApiClient.Put(
    `${path}/profiles`,
    input,
    parsed(adminCatalogMutationSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function saveAdminCatalogBinding(input: AdminCatalogBindingRequest) {
  return adminApiClient.Put(
    `${path}/wiki-bindings`,
    input,
    parsed(adminCatalogMutationSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function saveAdminCatalogGroupKind(input: AdminCatalogGroupKindRequest) {
  return adminApiClient.Put(
    `${path}/group-kind`,
    input,
    parsed(adminCatalogMutationSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function saveAdminCatalogImage(
  input: AdminCatalogMediaRequest,
  file: File | null
) {
  const body = new FormData()
  body.set("metadata", JSON.stringify(input))
  if (file) body.set("image", file)
  return adminApiClient.Put(
    `${path}/profile-image`,
    body,
    parsed(adminCatalogMutationSchema, {
      errorSchema: adminCatalogHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}
