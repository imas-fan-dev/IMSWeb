import { z } from "zod"

import { PUBLIC_CACHE_INVALIDATION_SOURCE } from "../cache-policy"
import { apiClient } from "../client"
import { withCsrf } from "../types"

const adminRoleSchema = z.enum(["admin", "super_admin"])

const adminSessionSchema = z.object({
  success: z.literal(true),
  user: z.object({
    id: z.coerce.number().int().positive(),
    username: z.string(),
    producername: z.string().optional().default(""),
    dept: z.string(),
    adminRole: adminRoleSchema.nullable(),
  }),
})

const loginSchema = z.object({
  success: z.literal(true),
  username: z.string(),
  producername: z.string().nullable().optional(),
  dept: z.literal("op"),
  adminRole: adminRoleSchema,
})

const adminAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  username: z.string(),
  producername: z.string(),
  adminRole: adminRoleSchema,
})

const adminAccountListSchema = z.object({
  success: z.literal(true),
  accounts: z.array(adminAccountSchema),
})

const adminAccountMutationSchema = z.object({
  success: z.literal(true),
  account: adminAccountSchema,
})

const informationCategorySchema = z.enum(["activity", "fan"])
const informationContentTypeSchema = z.enum(["external", "html"])

export const adminInformationCardSchema = z.object({
  id: z.string(),
  category: informationCategorySchema,
  contentType: informationContentTypeSchema,
  image: z.string(),
  link: z.string(),
  title: z.string(),
  html: z.string().optional(),
  updatedAt: z.string(),
})

const adminInformationIndexSchema = z.object({
  version: z.literal(1),
  cards: z.array(adminInformationCardSchema),
  assets: z.array(z.string()),
})

const recommendationSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string(),
  image: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  content: z.string(),
  date: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
})

const recommendationListSchema = z.object({
  success: z.literal(true),
  data: z.array(recommendationSchema),
})

const informationAssetSchema = z.object({
  success: z.literal(true),
  url: z.string(),
})

const idolMediaSourceSchema = z.enum(["object-storage", "none"])

const idolMediaCatalogSchema = z.object({
  status: z.literal("success"),
  agencies: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      idols: z.array(
        z.object({
          name: z.string(),
          imageUrl: z.string(),
          imageFit: z.enum(["contain", "cover"]),
          source: idolMediaSourceSchema,
        })
      ),
    })
  ),
})

const pendingChronicleMediaSchema = z.record(
  z.string(),
  z.array(
    z.object({
      filename: z.string().min(1),
      url: z.string().min(1),
      uploader: z.string().optional(),
      time: z.string().optional(),
    })
  )
)

const usedChronicleMediaSchema = z.record(
  z.string(),
  z.array(
    z.object({
      filename: z.string().min(1),
      url: z.string().min(1),
    })
  )
)

const adminNamecardSchema = z.object({
  id: z.coerce.number().int().positive(),
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  status: z.string(),
  revision: z.coerce.number().int().nonnegative(),
})

const adminNamecardListSchema = z.object({
  success: z.literal(true),
  data: z.array(adminNamecardSchema),
  pageInfo: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
})

export type AdminSession = z.infer<typeof adminSessionSchema>["user"]
export type AdminRole = z.infer<typeof adminRoleSchema>
export type AdminAccount = z.infer<typeof adminAccountSchema>
export type AdminInformationCard = z.infer<typeof adminInformationCardSchema>
export type AdminInformationIndex = z.infer<typeof adminInformationIndexSchema>
export type AdminRecommendation = z.infer<typeof recommendationSchema>
export type InformationCategory = z.infer<typeof informationCategorySchema>
export type InformationContentType = z.infer<
  typeof informationContentTypeSchema
>
export type IdolMediaCatalog = z.infer<typeof idolMediaCatalogSchema>
export type IdolMediaAgency = IdolMediaCatalog["agencies"][number]
export type IdolMediaItem = IdolMediaAgency["idols"][number]
export type PendingChronicleMedia = z.infer<typeof pendingChronicleMediaSchema>
export type UsedChronicleMedia = z.infer<typeof usedChronicleMediaSchema>
export type AdminNamecard = z.infer<typeof adminNamecardSchema>
export type AdminNamecardList = z.infer<typeof adminNamecardListSchema>

export type InformationSubmission = {
  title: string
  category: InformationCategory
  contentType: InformationContentType
  externalUrl: string
  html: string
  image: string
}

export function getAdminSession() {
  return apiClient.Get<z.infer<typeof adminSessionSchema>, unknown>(
    "/api/check",
    {
      transform: (payload) => adminSessionSchema.parse(payload),
    }
  )
}

export function loginAdmin(username: string, password: string) {
  return apiClient.Post<z.infer<typeof loginSchema>, unknown>(
    "/api/admin/login",
    { username, password },
    {
      meta: { authRole: "login" },
      transform: (payload) => loginSchema.parse(payload),
    }
  )
}

export function logoutAdmin() {
  return apiClient.Post<{ success: true }, unknown>("/api/logout", undefined, {
    meta: withCsrf({ authRole: "logout" }),
  })
}

export function getAdminAccounts() {
  return apiClient.Get<z.infer<typeof adminAccountListSchema>, unknown>(
    "/api/admin/accounts",
    { transform: (payload) => adminAccountListSchema.parse(payload) }
  )
}

export function createAdminAccount(input: {
  username: string
  producername: string
  password: string
}) {
  return apiClient.Post<z.infer<typeof adminAccountMutationSchema>, unknown>(
    "/api/admin/accounts",
    input,
    {
      meta: withCsrf(),
      transform: (payload) => adminAccountMutationSchema.parse(payload),
    }
  )
}

export function deleteAdminAccount(id: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/admin/accounts/${id}`,
    undefined,
    { meta: withCsrf() }
  )
}

export function getAdminInformation() {
  return apiClient.Get<AdminInformationIndex, unknown>(
    "/api/admin/information",
    { transform: (payload) => adminInformationIndexSchema.parse(payload) }
  )
}

export function uploadInformationAsset(file: File) {
  const form = new FormData()
  form.append("image", file)
  return apiClient.Post<z.infer<typeof informationAssetSchema>, unknown>(
    "/api/admin/information/assets",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => informationAssetSchema.parse(payload),
    }
  )
}

export function createInformation(submission: InformationSubmission) {
  return apiClient.Post<{ success: true; card: AdminInformationCard }, unknown>(
    "/api/admin/information",
    submission,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function updateInformation(
  id: string,
  submission: InformationSubmission
) {
  return apiClient.Put<{ success: true; card: AdminInformationCard }, unknown>(
    `/api/admin/information/${encodeURIComponent(id)}`,
    submission,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function deleteInformation(id: string) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/admin/information/${encodeURIComponent(id)}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function reorderInformation(ids: string[]) {
  return apiClient.Put<{ success: true }, unknown>(
    "/api/admin/information/order",
    { ids },
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function deleteInformationAsset(url: string) {
  return apiClient.Delete<{ success: true }, unknown>(
    "/api/admin/information/assets",
    { url },
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    }
  )
}

export function getRecommendations() {
  return apiClient.Get<z.infer<typeof recommendationListSchema>, unknown>(
    "/api/admin/news",
    { transform: (payload) => recommendationListSchema.parse(payload) }
  )
}

export function createRecommendation(form: FormData) {
  return apiClient.Post<{ success: true }, unknown>("/api/admin/news", form, {
    meta: withCsrf(),
    name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
  })
}

export function deleteRecommendation(id: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/admin/news/${id}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    }
  )
}

export function getIdolMediaCatalog() {
  return apiClient.Get<IdolMediaCatalog, unknown>("/api/wiki/idol-media", {
    transform: (payload) => idolMediaCatalogSchema.parse(payload),
  })
}

export function uploadIdolMedia(agency: string, idol: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("idol", idol)
  form.append("image", file)
  return apiClient.Post<{ status: "success"; url: string }, unknown>(
    "/api/wiki/idol-media",
    form,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    }
  )
}

export function deleteIdolMedia(agency: string, idol: string) {
  return apiClient.Delete<{ status: "success" }, unknown>(
    "/api/wiki/idol-media",
    { agency, idol },
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    }
  )
}

export function getPendingChronicleMedia() {
  return apiClient.Get<PendingChronicleMedia, unknown>(
    "/eventchronicle/admin/pending",
    { transform: (payload) => pendingChronicleMediaSchema.parse(payload) }
  )
}

export function getUsedChronicleMedia() {
  return apiClient.Get<UsedChronicleMedia, unknown>(
    "/eventchronicle/admin/used",
    { transform: (payload) => usedChronicleMediaSchema.parse(payload) }
  )
}

export function approveChronicleMedia(activityId: string, filename: string) {
  return apiClient.Post<{ success: true }, unknown>(
    `/eventchronicle/admin/approve/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    }
  )
}

export function rejectChronicleMedia(activityId: string, filename: string) {
  return apiClient.Post<{ success: true }, unknown>(
    `/eventchronicle/admin/reject/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    { meta: withCsrf() }
  )
}

export function deleteUsedChronicleMedia(activityId: string, filename: string) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/eventchronicle/admin/delete-used/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    }
  )
}

export function getAdminNamecards(page = 1) {
  return apiClient.Get<z.infer<typeof adminNamecardListSchema>, unknown>(
    "/api/admin/cards",
    {
      params: { page },
      transform: (payload) => adminNamecardListSchema.parse(payload),
    }
  )
}

export function approveAdminNamecard(id: number, expectedRevision: number) {
  return apiClient.Post<{ success: true; revision: number }, unknown>(
    `/api/admin/cards/approve/${id}`,
    { expected_revision: expectedRevision },
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function rejectAdminNamecard(id: number, expectedRevision: number) {
  return apiClient.Post<{ success: true }, unknown>(
    `/api/admin/cards/reject/${id}`,
    { expected_revision: expectedRevision },
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function deleteAdminNamecard(id: number, expectedRevision: number) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/admin/cards/${id}?expected_revision=${expectedRevision}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    }
  )
}

export function createAdminEvent(form: FormData, idempotencyKey: string) {
  return apiClient.Post<{ success: true; id: number }, unknown>(
    "/api/events",
    form,
    {
      headers: { "Idempotency-Key": idempotencyKey },
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}

export function updateAdminEvent(id: string, form: FormData) {
  return apiClient.Put<{ success: true }, unknown>(
    `/api/events/${encodeURIComponent(id)}`,
    form,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}

export function deleteAdminEvent(id: string) {
  return apiClient.Delete<{ success: true }, unknown>(
    `/api/events/${encodeURIComponent(id)}`,
    undefined,
    {
      meta: withCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    }
  )
}
