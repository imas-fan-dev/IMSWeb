import {
  adminApiPath,
  apiPath,
  eventChroniclePath,
  wikiPath,
} from "@imsweb/contracts/paths"
import { createEventResponseSchema } from "@imsweb/contracts/events"
import {
  adminNamecardDeleteRequestSchema,
  adminNamecardDiffSchema,
  adminNamecardFeedbackListSchema,
  namecardFeedbackAuditListSchema,
  namecardLockAuditListSchema,
  adminNamecardHttpErrorSchema,
  adminNamecardListBusinessErrorSchema,
  adminNamecardListSchema,
  adminNamecardMutationSchema,
  adminNamecardUpdateRequestSchema,
  namecardErrorResponseSchema,
  namecardFeedbackMutationSchema,
  namecardMutationResponseSchema,
  resolveNamecardFeedbackRequestSchema,
  adminNamecardTagBlockedMatchListSchema,
  adminNamecardTagBlocklistCreateRequestSchema,
  adminNamecardTagBlocklistDeleteSchema,
  adminNamecardTagBlocklistListSchema,
  adminNamecardTagBlocklistMutationSchema,
  adminNamecardTagBlocklistRemoveMatchesSchema,
  adminNamecardTagBlocklistUpdateRequestSchema,
  adminNamecardTagBlockRequestSchema,
  adminNamecardTagBlockResultSchema,
  adminNamecardTagFreeListSchema,
  adminNamecardTagPresetCreateRequestSchema,
  adminNamecardTagPresetDeleteSchema,
  adminNamecardTagPresetListSchema,
  adminNamecardTagPresetMergeRequestSchema,
  adminNamecardTagPresetMutationSchema,
  adminNamecardTagPresetUpdateRequestSchema,
  adminNamecardTagPromoteRequestSchema,
  adminNamecardTagPromoteResponseSchema,
} from "@imsweb/contracts/namecards"
import { platformProfileHttpErrorSchema } from "@imsweb/contracts/platform"
import {
  idolMediaCatalogSchema,
  wikiErrorResponseSchema,
  wikiHttpErrorResponseSchema,
  wikiIdolMediaUploadResultSchema,
  wikiMutationResultSchema,
} from "@imsweb/contracts/wiki"
import {
  adminInformationIndexSchema,
  adminInformationMutationSchema,
  informationAssetSchema,
} from "@imsweb/contracts/information"
import {
  backofficeProtectedHttpErrorSchema,
  successFlagSchema,
} from "@imsweb/contracts/common"
import {
  adminAccountEndpointErrorResponseSchema,
  adminAccountListSchema,
  adminAccountMutationSchema,
  adminLoginErrorResponseSchema,
  adminLoginSuccessResponseSchema,
  adminLogoutHttpErrorResponseSchema,
  adminLogoutSuccessResponseSchema,
  adminSessionHttpErrorResponseSchema,
  adminSessionSchema,
} from "@imsweb/contracts/admin"
import {
  pendingChronicleMediaSchema,
  usedChronicleMediaSchema,
} from "@imsweb/contracts/chronicle"
import {
  adminRecommendationListSchema,
  newsAdminHttpErrorResponseSchema,
  newsMutationErrorResponseSchema,
  newsMutationSuccessSchema,
} from "@imsweb/contracts/news"

import {
  platformAccountIconUploadSchema,
  platformAccountKindListSchema,
  platformAccountKindRequestSchema,
} from "@imsweb/contracts/namecards"
import type { z } from "@imsweb/contracts/z"
import { parsed } from "../parsed"
import { adminApiClient } from "../admin-client"
import { PUBLIC_CACHE_INVALIDATION_SOURCE } from "../cache-policy"
import { readCookie } from "../cookies"
import {
  BACKOFFICE_CSRF_COOKIE_NAME,
  LEGACY_BACKOFFICE_CSRF_COOKIE_NAME,
} from "../request"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"

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
      errorSchema: adminSessionHttpErrorResponseSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function loginAdmin(username: string, password: string) {
  return adminApiClient.Post(
    adminApiPath("/auth/login"),
    { username, password },
    parsed(adminLoginSuccessResponseSchema, {
      errorSchema: adminLoginErrorResponseSchema,
      meta: withBackofficeAuth({ authRole: "login" }),
    })
  )
}

export function logoutAdmin() {
  return adminApiClient.Post(
    adminApiPath("/auth/logout"),
    undefined,
    parsed(adminLogoutSuccessResponseSchema, {
      errorSchema: adminLogoutHttpErrorResponseSchema,
      meta: withBackofficeCsrf({ authRole: "logout" }),
    })
  )
}

export function getAdminAccounts() {
  return adminApiClient.Get(
    adminApiPath("/accounts"),
    parsed(adminAccountListSchema, {
      errorSchema: adminAccountEndpointErrorResponseSchema,
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
      errorSchema: adminAccountEndpointErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminAccount(id: number) {
  return adminApiClient.Delete(
    adminApiPath(`/accounts/${id}`),
    undefined,
    parsed(successFlagSchema, {
      errorSchema: adminAccountEndpointErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminInformation() {
  return adminApiClient.Get(
    adminApiPath("/information"),
    parsed(adminInformationIndexSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function createInformation(submission: InformationSubmission) {
  return adminApiClient.Post(
    adminApiPath("/information"),
    submission,
    parsed(adminInformationMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.information,
    })
  )
}

export function getRecommendations() {
  return adminApiClient.Get(
    adminApiPath("/news"),
    parsed(adminRecommendationListSchema, {
      businessErrorSchema: newsMutationErrorResponseSchema,
      errorSchema: newsAdminHttpErrorResponseSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createRecommendation(form: FormData) {
  return adminApiClient.Post(
    adminApiPath("/news"),
    form,
    parsed(newsMutationSuccessSchema, {
      businessErrorSchema: newsMutationErrorResponseSchema,
      errorSchema: newsAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    })
  )
}

export function deleteRecommendation(id: number) {
  return adminApiClient.Delete(
    adminApiPath(`/news/${id}`),
    undefined,
    parsed(newsMutationSuccessSchema, {
      errorSchema: newsAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
    })
  )
}

export function getIdolMediaCatalog() {
  return adminApiClient.Get(
    wikiPath("/idol-media"),
    parsed(idolMediaCatalogSchema, {
      businessErrorSchema: wikiErrorResponseSchema,
      errorSchema: wikiHttpErrorResponseSchema,
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
      businessErrorSchema: wikiErrorResponseSchema,
      errorSchema: wikiHttpErrorResponseSchema,
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
      businessErrorSchema: wikiErrorResponseSchema,
      errorSchema: wikiHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    })
  )
}

export function getPendingChronicleMedia() {
  return adminApiClient.Get(
    eventChroniclePath("/admin/pending"),
    parsed(pendingChronicleMediaSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function getUsedChronicleMedia() {
  return adminApiClient.Get(
    eventChroniclePath("/admin/used"),
    parsed(usedChronicleMediaSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle,
    })
  )
}

export interface AdminNamecardListFilters {
  query?: string
  status?: string
  origins?: string[]
  /** 归属账号：只列出该账号名下的名片。 */
  ownerAccountId?: string
}

export function getAdminNamecards(
  page = 1,
  filters?: AdminNamecardListFilters
) {
  const params: Record<string, string> = { page: String(page) }
  if (filters?.query) params.query = filters.query
  if (filters?.status) params.status = filters.status
  if (filters?.origins?.length) params.origin = filters.origins.join(",")
  if (filters?.ownerAccountId) params.owner = filters.ownerAccountId
  return adminApiClient.Get(
    adminApiPath("/cards"),
    parsed(adminNamecardListSchema, {
      businessErrorSchema: adminNamecardListBusinessErrorSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeAuth(),
      params,
    })
  )
}

/** The report queue: published cards readers flagged. */
export function getAdminNamecardFeedback(page = 1) {
  return adminApiClient.Get(
    adminApiPath("/cards/feedback"),
    parsed(adminNamecardFeedbackListSchema, {
      businessErrorSchema: adminNamecardListBusinessErrorSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: { page: String(page) },
    })
  )
}

export interface AdminNamecardLockAuditParams {
  page?: number
  owner?: string
  reason?: string
  handler?: string
  action?: "locked" | "unlocked"
}

export interface AdminNamecardFeedbackAuditParams {
  page?: number
  owner?: string
  reporter?: string
  outcome?: "accepted" | "rejected"
  handler?: string
}

function auditParams(params: Record<string, number | string | undefined>) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    query[key] = String(value)
  }
  return query
}

/** Read-only: every card that is locked right now. */
export function getAdminNamecardLockAudit(
  params: AdminNamecardLockAuditParams = {}
) {
  return adminApiClient.Get(
    adminApiPath("/cards/audit/locks"),
    parsed(namecardLockAuditListSchema, {
      businessErrorSchema: adminNamecardListBusinessErrorSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: auditParams({ ...params }),
    })
  )
}

/** Read-only: every report that already carries a verdict. */
export function getAdminNamecardFeedbackAudit(
  params: AdminNamecardFeedbackAuditParams = {}
) {
  return adminApiClient.Get(
    adminApiPath("/cards/audit/feedback"),
    parsed(namecardFeedbackAuditListSchema, {
      businessErrorSchema: adminNamecardListBusinessErrorSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: auditParams({ ...params }),
    })
  )
}

/** Leaves the queue; the reporter is told the outcome. */
export function resolveAdminNamecardFeedback(
  feedbackId: number,
  input: { outcome: "accepted" | "rejected"; note: string | null }
) {
  return adminApiClient.Post(
    adminApiPath(`/cards/feedback/${feedbackId}/resolve`),
    resolveNamecardFeedbackRequestSchema.parse(input),
    parsed(namecardFeedbackMutationSchema, {
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/** Both sides of a queued revision, for the review diff dialog. */
export function getAdminNamecardDiff(id: number) {
  return adminApiClient.Get(
    adminApiPath(`/cards/${id}/diff`),
    parsed(adminNamecardDiffSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

/**
 * Rewrites a card from the backoffice; the server answers with the card as it
 * now stands so the dialog can keep editing without a second round trip.
 */
export function updateAdminNamecard(
  id: number,
  input: Parameters<typeof adminNamecardUpdateRequestSchema.parse>[0]
) {
  return adminApiClient.Put(
    adminApiPath(`/cards/${id}`),
    adminNamecardUpdateRequestSchema.parse(input),
    parsed(adminNamecardDiffSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function deleteAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Delete(
    adminApiPath(`/cards/${id}`),
    adminNamecardDeleteRequestSchema.parse({
      expected_revision: expectedRevision,
    }),
    parsed(adminNamecardMutationSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function approveAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post(
    adminApiPath(`/cards/approve/${id}`),
    { expected_revision: expectedRevision },
    parsed(adminNamecardMutationSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function rejectAdminNamecard(
  id: number,
  expectedRevision: number,
  reason?: string
) {
  return adminApiClient.Post(
    adminApiPath(`/cards/reject/${id}`),
    { expected_revision: expectedRevision, ...(reason ? { reason } : {}) },
    parsed(successFlagSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

/** Locks a card instead of deleting it; the reviewer's reason is required. */
export function lockAdminNamecard(
  id: number,
  expectedRevision: number,
  reason: string
) {
  return adminApiClient.Post(
    adminApiPath(`/cards/lock/${id}`),
    { expected_revision: expectedRevision, reason },
    parsed(namecardMutationResponseSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

/** Records a submission as breaking the rules; a live copy stays online. */
export function flagAdminNamecard(
  id: number,
  expectedRevision: number,
  reason: string
) {
  return adminApiClient.Post(
    adminApiPath(`/cards/flag/${id}`),
    { expected_revision: expectedRevision, reason },
    parsed(namecardMutationResponseSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

/** Returns a locked card to the review queue and notifies its owner. */
export function unlockAdminNamecard(id: number, expectedRevision: number) {
  return adminApiClient.Post(
    adminApiPath(`/cards/unlock/${id}`),
    { expected_revision: expectedRevision },
    parsed(namecardMutationResponseSchema, {
      businessErrorSchema: namecardErrorResponseSchema,
      errorSchema: adminNamecardHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
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
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
      name: PUBLIC_CACHE_INVALIDATION_SOURCE.events,
    })
  )
}

/** 后台维护平台目录：标识符、正则、色值、图标与排序都由这里改。 */
export function getAdminPlatformAccountKinds() {
  return adminApiClient.Get(
    adminApiPath("/platform/account-kinds"),
    parsed(platformAccountKindListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function saveAdminPlatformAccountKind(
  id: string,
  input: z.input<typeof platformAccountKindRequestSchema>
) {
  const submission = platformAccountKindRequestSchema.parse(input)
  return adminApiClient.Put(
    adminApiPath(`/platform/account-kinds/${encodeURIComponent(id)}`),
    submission,
    parsed(platformAccountKindListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminPlatformAccountKind(id: string) {
  return adminApiClient.Delete(
    adminApiPath(`/platform/account-kinds/${encodeURIComponent(id)}`),
    undefined,
    parsed(successFlagSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function uploadAdminPlatformAccountKindIcon(kindId: string, file: File) {
  const form = new FormData()
  form.append("icon", file)
  return adminApiClient.Put(
    adminApiPath(`/platform/account-kinds/${encodeURIComponent(kindId)}/icon`),
    form,
    parsed(platformAccountIconUploadSchema, {
      errorSchema: platformProfileHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/* ---- 管理台：标签库 ---- */

const ADMIN_TAGS_PATH = adminApiPath("/namecard-tags")

/** The three tag library lists share this paging/search shape. */
export interface AdminNamecardTagSearchInput {
  q?: string
  page?: number
  pageSize?: number
}

export type AdminNamecardFreeSort = "frequency" | "recent"

export interface AdminNamecardFreeTagSearchInput
  extends AdminNamecardTagSearchInput {
  sort?: AdminNamecardFreeSort
}

function tagSearchParams(input: AdminNamecardTagSearchInput) {
  const params: Record<string, string> = {}
  const q = input.q?.trim()
  if (q) params.q = q
  if (input.page !== undefined) params.page = String(input.page)
  if (input.pageSize !== undefined) params.pageSize = String(input.pageSize)
  return params
}

/** 自由标签：按使用频率（或首次出现）排序，支持关键字检索与分页。 */
export function getAdminNamecardFreeTags(
  input: AdminNamecardFreeTagSearchInput = {}
) {
  return adminApiClient.Get(
    `${ADMIN_TAGS_PATH}/free`,
    parsed(adminNamecardTagFreeListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: {
        ...tagSearchParams(input),
        ...(input.sort ? { sort: input.sort } : {}),
      },
    })
  )
}

/** 把一条自由标签提升为预设；不传 `presetName` 时沿用标签自身。 */
export function promoteAdminNamecardFreeTag(
  input: z.input<typeof adminNamecardTagPromoteRequestSchema>
) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/free/promote`,
    adminNamecardTagPromoteRequestSchema.parse(input),
    parsed(adminNamecardTagPromoteResponseSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/** 屏蔽一条自由标签：移除现存标签并追加屏蔽词（默认按原文匹配）。 */
export function blockAdminNamecardFreeTag(
  input: z.input<typeof adminNamecardTagBlockRequestSchema>
) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/free/block`,
    adminNamecardTagBlockRequestSchema.parse(input),
    parsed(adminNamecardTagBlockResultSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminNamecardTagPresets(
  input: AdminNamecardTagSearchInput = {}
) {
  return adminApiClient.Get(
    `${ADMIN_TAGS_PATH}/presets`,
    parsed(adminNamecardTagPresetListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: tagSearchParams(input),
    })
  )
}

export function createAdminNamecardTagPreset(
  input: z.input<typeof adminNamecardTagPresetCreateRequestSchema>
) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/presets`,
    adminNamecardTagPresetCreateRequestSchema.parse(input),
    parsed(adminNamecardTagPresetMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminNamecardTagPreset(
  id: number,
  input: z.input<typeof adminNamecardTagPresetUpdateRequestSchema>
) {
  return adminApiClient.Patch(
    `${ADMIN_TAGS_PATH}/presets/${id}`,
    adminNamecardTagPresetUpdateRequestSchema.parse(input),
    parsed(adminNamecardTagPresetMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminNamecardTagPreset(id: number) {
  return adminApiClient.Delete(
    `${ADMIN_TAGS_PATH}/presets/${id}`,
    undefined,
    parsed(adminNamecardTagPresetDeleteSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/** 把一条自由标签并入已有预设的别名，并让现存标签指向该预设。 */
export function mergeAdminNamecardFreeTag(
  presetId: number,
  input: z.input<typeof adminNamecardTagPresetMergeRequestSchema>
) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/presets/${presetId}/merge`,
    adminNamecardTagPresetMergeRequestSchema.parse(input),
    parsed(adminNamecardTagPresetMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminNamecardTagBlocklist(
  input: AdminNamecardTagSearchInput = {}
) {
  return adminApiClient.Get(
    `${ADMIN_TAGS_PATH}/blocklist`,
    parsed(adminNamecardTagBlocklistListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: tagSearchParams(input),
    })
  )
}

/** 现存自由标签里被任意屏蔽词命中的条目（附第一条命中规则）。 */
export function getAdminNamecardTagBlockedMatches() {
  return adminApiClient.Get(
    `${ADMIN_TAGS_PATH}/blocklist/matches`,
    parsed(adminNamecardTagBlockedMatchListSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminNamecardTagBlocklist(
  input: z.input<typeof adminNamecardTagBlocklistCreateRequestSchema>
) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/blocklist`,
    adminNamecardTagBlocklistCreateRequestSchema.parse(input),
    parsed(adminNamecardTagBlocklistMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminNamecardTagBlocklist(
  id: number,
  input: z.input<typeof adminNamecardTagBlocklistUpdateRequestSchema>
) {
  return adminApiClient.Patch(
    `${ADMIN_TAGS_PATH}/blocklist/${id}`,
    adminNamecardTagBlocklistUpdateRequestSchema.parse(input),
    parsed(adminNamecardTagBlocklistMutationSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminNamecardTagBlocklist(id: number) {
  return adminApiClient.Delete(
    `${ADMIN_TAGS_PATH}/blocklist/${id}`,
    undefined,
    parsed(adminNamecardTagBlocklistDeleteSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/** 移除某条屏蔽词命中的全部现存自由标签；规则本身保留。 */
export function removeAdminNamecardTagBlocklistMatches(id: number) {
  return adminApiClient.Post(
    `${ADMIN_TAGS_PATH}/blocklist/${id}/remove-matches`,
    undefined,
    parsed(adminNamecardTagBlocklistRemoveMatchesSchema, {
      errorSchema: backofficeProtectedHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export type {
  AdminNamecardTagBlockedMatch,
  AdminNamecardTagBlockedMatchList,
  AdminNamecardTagBlocklistDelete,
  AdminNamecardTagBlocklistItem,
  AdminNamecardTagBlocklistList,
  AdminNamecardTagBlocklistMutation,
  AdminNamecardTagBlocklistRemoveMatches,
  AdminNamecardTagBlockRequest,
  AdminNamecardTagBlockResult,
  AdminNamecardTagFree,
  AdminNamecardTagFreeList,
  AdminNamecardTagFreeQuery,
  AdminNamecardTagPreset,
  AdminNamecardTagPresetCreateRequest,
  AdminNamecardTagPresetDelete,
  AdminNamecardTagPresetList,
  AdminNamecardTagPresetListQuery,
  AdminNamecardTagPresetMergeRequest,
  AdminNamecardTagPresetMutation,
  AdminNamecardTagPresetUpdateRequest,
  AdminNamecardTagPromoteRequest,
  AdminNamecardTagPromoteResponse,
} from "@imsweb/contracts/namecards"
