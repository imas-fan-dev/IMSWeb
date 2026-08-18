import { z } from "@imsweb/contracts/z"

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
  PendingChronicleMedia,
  UsedChronicleMedia,
} from "@imsweb/contracts/chronicle"

import type {
  AdminInformationCard,
  AdminInformationIndex,
  InformationCategory,
  InformationContentType,
} from "@imsweb/contracts/information"

import type { IdolMediaCatalog } from "@imsweb/contracts/wiki"

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
  return adminApiClient.Get<z.infer<typeof adminSessionSchema>, unknown>(
    "/api/admin/auth/session",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => adminSessionSchema.parse(payload),
    }
  )
}

export function loginAdmin(username: string, password: string) {
  return adminApiClient.Post<z.infer<typeof loginSchema>, unknown>(
    "/api/admin/auth/login",
    { username, password },
    {
      meta: withBackofficeAuth({ authRole: "login" }),
      transform: (payload) => loginSchema.parse(payload),
    }
  )
}

export function logoutAdmin() {
  return adminApiClient.Post<{ success: true }, unknown>(
    "/api/admin/auth/logout",
    undefined,
    {
      meta: withBackofficeCsrf({ authRole: "logout" }),
    }
  )
}

export function getAdminAccounts() {
  return adminApiClient.Get<z.infer<typeof adminAccountListSchema>, unknown>(
    "/api/admin/accounts",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => adminAccountListSchema.parse(payload),
    }
  )
}

export function createAdminAccount(input: {
  username: string
  producername: string
  password: string
}) {
  return adminApiClient.Post<
    z.infer<typeof adminAccountMutationSchema>,
    unknown
  >("/api/admin/accounts", input, {
    meta: withBackofficeCsrf(),
    transform: (payload) => adminAccountMutationSchema.parse(payload),
  })
}

export function deleteAdminAccount(id: number) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/admin/accounts/${id}`,
    undefined,
    { meta: withBackofficeCsrf() }
  )
}

export function getAdminInformation() {
  return adminApiClient.Get<AdminInformationIndex, unknown>(
    "/api/admin/information",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => adminInformationIndexSchema.parse(payload),
    }
  )
}

export function uploadInformationAsset(file: File) {
  const form = new FormData()
  form.append("image", file)
  return adminApiClient.Post<z.infer<typeof informationAssetSchema>, unknown>(
    "/api/admin/information/assets",
    form,
    {
      meta: withBackofficeCsrf(),
      transform: (payload) => informationAssetSchema.parse(payload),
    }
  )
}

export function createInformation(submission: InformationSubmission) {
  return adminApiClient.Post<
    { success: true; card: AdminInformationCard },
    unknown
  >("/api/admin/information", submission, {
    meta: withBackofficeCsrf(),
    name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
  })
}

export function updateInformation(
  id: string,
  submission: InformationSubmission
) {
  return adminApiClient.Put<
    { success: true; card: AdminInformationCard },
    unknown
  >(`/api/admin/information/${encodeURIComponent(id)}`, submission, {
    meta: withBackofficeCsrf(),
    name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
  })
}

export function deleteInformation(id: string) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/admin/information/${encodeURIComponent(id)}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function reorderInformation(ids: string[]) {
  return adminApiClient.Put<{ success: true }, unknown>(
    "/api/admin/information/order",
    { ids },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function deleteInformationAsset(url: string) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    "/api/admin/information/assets",
    { url },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function getRecommendations() {
  return adminApiClient.Get<
    z.infer<typeof adminRecommendationListSchema>,
    unknown
  >("/api/admin/news", {
    meta: withBackofficeAuth(),
    transform: (payload) => adminRecommendationListSchema.parse(payload),
  })
}

export function createRecommendation(form: FormData) {
  return adminApiClient.Post<{ success: true }, unknown>(
    "/api/admin/news",
    form,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    }
  )
}

export function deleteRecommendation(id: number) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/admin/news/${id}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    }
  )
}

export function getIdolMediaCatalog() {
  return adminApiClient.Get<IdolMediaCatalog, unknown>("/api/wiki/idol-media", {
    meta: withBackofficeAuth(),
    transform: (payload) => idolMediaCatalogSchema.parse(payload),
  })
}

export function uploadIdolMedia(agency: string, idol: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("idol", idol)
  form.append("image", file)
  return adminApiClient.Post<{ status: "success"; url: string }, unknown>(
    "/api/wiki/idol-media",
    form,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    }
  )
}

export function deleteIdolMedia(agency: string, idol: string) {
  return adminApiClient.Delete<{ status: "success" }, unknown>(
    "/api/wiki/idol-media",
    { agency, idol },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    }
  )
}

export function getPendingChronicleMedia() {
  return adminApiClient.Get<PendingChronicleMedia, unknown>(
    "/eventchronicle/admin/pending",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => pendingChronicleMediaSchema.parse(payload),
    }
  )
}

export function getUsedChronicleMedia() {
  return adminApiClient.Get<UsedChronicleMedia, unknown>(
    "/eventchronicle/admin/used",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => usedChronicleMediaSchema.parse(payload),
    }
  )
}

export function approveChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Post<{ success: true }, unknown>(
    `/eventchronicle/admin/approve/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    }
  )
}

export function rejectChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Post<{ success: true }, unknown>(
    `/eventchronicle/admin/reject/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    { meta: withBackofficeCsrf() }
  )
}

export function deleteUsedChronicleMedia(activityId: string, filename: string) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/eventchronicle/admin/delete-used/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    }
  )
}

export function getAdminNamecards(page = 1) {
  return adminApiClient.Get<z.infer<typeof adminNamecardListSchema>, unknown>(
    "/api/admin/cards",
    {
      meta: withBackofficeAuth(),
      params: { page },
      transform: (payload) => adminNamecardListSchema.parse(payload),
    }
  )
}

export function approveAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post<{ success: true; revision: number }, unknown>(
    `/api/admin/cards/approve/${id}`,
    { expected_revision: expectedRevision },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function rejectAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post<{ success: true }, unknown>(
    `/api/admin/cards/reject/${id}`,
    { expected_revision: expectedRevision },
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function deleteAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/admin/cards/${id}?expected_revision=${expectedRevision}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function createAdminEvent(form: FormData, idempotencyKey: string) {
  return adminApiClient.Post<{ success: true; id: number }, unknown>(
    "/api/events",
    form,
    {
      headers: { "Idempotency-Key": idempotencyKey },
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}

export function updateAdminEvent(id: string, form: FormData) {
  return adminApiClient.Put<{ success: true }, unknown>(
    `/api/events/${encodeURIComponent(id)}`,
    form,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}

export function deleteAdminEvent(id: string) {
  return adminApiClient.Delete<{ success: true }, unknown>(
    `/api/events/${encodeURIComponent(id)}`,
    undefined,
    {
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}
