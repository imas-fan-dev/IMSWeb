import {
  adminApiPath,
  apiPath,
  eventChroniclePath,
  wikiPath,
} from "@imsweb/contracts/paths"
import { createEventResponseSchema } from "@imsweb/contracts/events"
import { adminNamecardMutationSchema } from "@imsweb/contracts/namecards"
import { wikiMutationResultSchema } from "@imsweb/contracts/wiki"
import { wikiIdolMediaUploadResultSchema } from "@imsweb/contracts/wiki"
import { adminInformationMutationSchema } from "@imsweb/contracts/information"
import { successFlagSchema } from "@imsweb/contracts/common"
import { z } from "@imsweb/contracts/z"

import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import { PUBLIC_CACHE_INVALIDATION_SOURCE } from "../cache-policy"
import { readCookie } from "../cookies"
import {
  BACKOFFICE_CSRF_COOKIE_NAME,
  LEGACY_BACKOFFICE_CSRF_COOKIE_NAME,
} from "../request"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

import {
  adminAccountListSchema,
  adminAccountMutationSchema,
  adminRoleSchema,
  adminSessionSchema,
} from "@imsweb/contracts/admin"

import {
  pendingChronicleMediaSchema,
  usedChronicleMediaSchema,
} from "@imsweb/contracts/chronicle"

import {
  adminInformationIndexSchema,
  informationAssetSchema,
} from "@imsweb/contracts/information"

import { adminNamecardListSchema } from "@imsweb/contracts/namecards"

import { adminRecommendationListSchema } from "@imsweb/contracts/news"

import { idolMediaCatalogSchema } from "@imsweb/contracts/wiki"

export { adminInformationCardSchema } from "@imsweb/contracts/information"

import type {
  InformationCategory,
  InformationContentType,
} from "@imsweb/contracts/information"

export type {
  IdolMediaAgency,
  IdolMediaCatalog,
  IdolMediaItem,
} from "@imsweb/contracts/wiki"

export type {
  AdminAccount,
  AdminRole,
  AdminSession,
} from "@imsweb/contracts/admin"

export type {
  AdminInformationCard,
  AdminInformationIndex,
  InformationCategory,
  InformationContentType,
} from "@imsweb/contracts/information"

export type { AdminRecommendation } from "@imsweb/contracts/news"

export type {
  PendingChronicleMedia,
  UsedChronicleMedia,
} from "@imsweb/contracts/chronicle"

const loginSchema = z.object({
  success: z.literal(true),
  username: z.string(),
  producername: z.string().nullable().optional(),
  dept: z.literal("op"),
  adminRole: adminRoleSchema,
})

export type InformationSubmission = {
  title: string
  category: InformationCategory
  contentType: InformationContentType
  externalUrl: string
  html: string
  image: string
}

export function hasBackofficeSessionHint() {
  return Boolean(
    readCookie(BACKOFFICE_CSRF_COOKIE_NAME) ||
    readCookie(LEGACY_BACKOFFICE_CSRF_COOKIE_NAME)
  )
}

export function getAdminSession() {
  return adminApiClient.Get(
    adminApiPath("/auth/session"),
    parsed(adminSessionSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function loginAdmin(username: string, password: string) {
  return adminApiClient.Post(
    adminApiPath("/auth/login"),
    { username, password },
    parsed(loginSchema, {
      meta: withBackofficeAuth({ authRole: "login" }),
    })
  )
}

export function logoutAdmin() {
  return adminApiClient.Post(
    adminApiPath("/auth/logout"),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf({ authRole: "logout" }),
    })
  )
}

export function getAdminAccounts() {
  return adminApiClient.Get(
    adminApiPath("/accounts"),
    parsed(adminAccountListSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminAccount(input: {
  username: string
  producername: string
  password: string
}) {
  return adminApiClient.Post(
    adminApiPath("/accounts"),
    input,
    parsed(adminAccountMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminAccount(id: number) {
  return adminApiClient.Delete(
    adminApiPath(`/accounts/${id}`),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminInformation() {
  return adminApiClient.Get(
    adminApiPath("/information"),
    parsed(adminInformationIndexSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function uploadInformationAsset(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post(
    adminApiPath("/information/assets"),
    form,
    parsed(informationAssetSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function createInformation(submission: InformationSubmission) {
  return adminApiClient.Post(
    adminApiPath("/information"),
    submission,
    parsed(adminInformationMutationSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function updateInformation(
  id: string,
  submission: InformationSubmission
) {
  return adminApiClient.Put(
    adminApiPath(`/information/${encodeURIComponent(id)}`),
    submission,
    parsed(adminInformationMutationSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function deleteInformation(id: string) {
  return adminApiClient.Delete(
    adminApiPath(`/information/${encodeURIComponent(id)}`),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function reorderInformation(ids: string[]) {
  return adminApiClient.Put(
    adminApiPath("/information/order"),
    { ids },
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function deleteInformationAsset(url: string) {
  return adminApiClient.Delete(
    adminApiPath("/information/assets"),
    { url },
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function getRecommendations() {
  return adminApiClient.Get(
    adminApiPath("/news"),
    parsed(adminRecommendationListSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function createRecommendation(form: FormData) {
  return adminApiClient.Post(
    adminApiPath("/news"),
    form,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    })
  )
}

export function deleteRecommendation(id: number) {
  return adminApiClient.Delete(
    adminApiPath(`/news/${id}`),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    })
  )
}

export function getIdolMediaCatalog() {
  return adminApiClient.Get(
    wikiPath("/idol-media"),
    parsed(idolMediaCatalogSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function uploadIdolMedia(agency: string, idol: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("idol", idol)
  form.append("image", file)
  return adminApiClient.Post(
    wikiPath("/idol-media"),
    form,
    parsed(wikiIdolMediaUploadResultSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function deleteIdolMedia(agency: string, idol: string) {
  return adminApiClient.Delete(
    wikiPath("/idol-media"),
    { agency, idol },
    parsed(wikiMutationResultSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function getPendingChronicleMedia() {
  return adminApiClient.Get(
    eventChroniclePath("/admin/pending"),
    parsed(pendingChronicleMediaSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function getUsedChronicleMedia() {
  return adminApiClient.Get(
    eventChroniclePath("/admin/used"),
    parsed(usedChronicleMediaSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function approveChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Post(
    eventChroniclePath(
      `/admin/approve/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`
    ),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    })
  )
}

export function rejectChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Post(
    eventChroniclePath(
      `/admin/reject/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`
    ),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteUsedChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Delete(
    eventChroniclePath(
      `/admin/delete-used/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`
    ),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    })
  )
}

export function getAdminNamecards(page = 1) {
  return adminApiClient.Get(
    adminApiPath("/cards"),
    parsed(adminNamecardListSchema, {
      meta: withBackofficeAuth(),
      params: { page },
    })
  )
}

export function approveAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post(
    adminApiPath(`/cards/approve/${id}`),
    { expected_revision: expectedRevision },
    parsed(adminNamecardMutationSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function rejectAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post(
    adminApiPath(`/cards/reject/${id}`),
    { expected_revision: expectedRevision },
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function deleteAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Delete(
    adminApiPath(`/cards/${id}?expected_revision=${expectedRevision}`),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function createAdminEvent(form: FormData, idempotencyKey: string) {
  return adminApiClient.Post(
    apiPath("/events"),
    form,
    parsed(createEventResponseSchema, {
      headers: { "Idempotency-Key": idempotencyKey },
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    })
  )
}

export function updateAdminEvent(id: string, form: FormData) {
  return adminApiClient.Put(
    apiPath(`/events/${encodeURIComponent(id)}`),
    form,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    })
  )
}

export function deleteAdminEvent(id: string) {
  return adminApiClient.Delete(
    apiPath(`/events/${encodeURIComponent(id)}`),
    undefined,
    parsed(successFlagSchema, {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    })
  )
}
