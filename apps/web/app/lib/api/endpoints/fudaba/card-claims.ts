import { adminExchangePath, exchangePath } from "@imsweb/contracts/paths"
import {
  normalizeFudabaAdminCardClaimList,
  normalizeFudabaRegisteredCardReviewList,
} from "../../media-urls"
import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import { platformApiClient } from "../../platform-client"
import {
  withBackofficeAuth,
  withBackofficeCsrf,
  withPlatformAuth,
  withPlatformCsrf,
} from "../../types"
import {
  namecardNotificationListResponseSchema,
  namecardNotificationReadResponseSchema,
} from "@imsweb/contracts/fudaba/card-claims"
import {
  adminCardClaimListSchema,
  adminCardSupplementDetailSchema,
  // pi-lens-ignore: ts:2724
  fudabaAdminCardClaimHttpErrorSchema,
  fudabaCardClaimErrorSchema,
  fudabaCardReviewRequestSchema,
  fudabaCardSupplementRequestSchema,
  fudabaLegacyCardClaimRequestSchema,
  fudabaSupplementReviewRequestSchema,
  claimMutationSchema,
  ownerClaimListSchema,
  registeredCardReviewListSchema,
  reviewMutationSchema,
  reviewQueueListSchema,
  supplementMutationSchema,
  type FudabaCardSupplementPayloadInput,
  type FudabaLegacyCardClaimRequestInput,
  type ReviewQueueType,
} from "@imsweb/contracts/fudaba/card-claims"

export {
  fudabaCardClaimSchema,
  ownerClaimListSchema,
  claimMutationSchema,
  fudabaRegisteredCardReviewSchema,
  fudabaAdminCardClaimSchema,
  registeredCardReviewListSchema,
  adminCardClaimListSchema,
  reviewMutationSchema,
  reviewQueueListSchema,
  adminCardSupplementDetailSchema,
  supplementMutationSchema,
} from "@imsweb/contracts/fudaba/card-claims"
export type * from "@imsweb/contracts/fudaba/card-claims"

export function getNamecardNotifications() {
  return platformApiClient.Get(
    exchangePath("/me/notifications"),
    parsed(namecardNotificationListResponseSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function markNamecardNotificationsRead(ids?: string[]) {
  return platformApiClient.Post(
    exchangePath("/me/notifications/read"),
    ids === undefined ? {} : { ids },
    parsed(namecardNotificationReadResponseSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function getFudabaOwnerCardClaims() {
  return platformApiClient.Get(
    exchangePath("/me/card-claims"),
    parsed(ownerClaimListSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function createFudabaLegacyCardClaim(
  legacyCardId: number,
  input: FudabaLegacyCardClaimRequestInput
) {
  const submission = fudabaLegacyCardClaimRequestSchema.parse(input)
  return platformApiClient.Post(
    exchangePath(`/legacy-cards/${legacyCardId}/claims`),
    submission,
    parsed(claimMutationSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function getAdminFudabaCardReviews() {
  return adminApiClient.Get(
    adminExchangePath("/card-reviews"),
    parsed(registeredCardReviewListSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeAuth(),
      select: normalizeFudabaRegisteredCardReviewList,
    })
  )
}

export function reviewAdminFudabaCard(
  cardId: string,
  input: {
    decision: "approve" | "reject"
    expectedRevision: number
    note: string
  }
) {
  const submission = fudabaCardReviewRequestSchema.parse(input)
  return adminApiClient.Put(
    adminExchangePath(`/card-reviews/${encodeURIComponent(cardId)}`),
    submission,
    parsed(reviewMutationSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminFudabaCardClaims() {
  return adminApiClient.Get(
    adminExchangePath("/card-claims"),
    parsed(adminCardClaimListSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeAuth(),
      select: normalizeFudabaAdminCardClaimList,
    })
  )
}

export function reviewAdminFudabaCardClaim(
  claimId: string,
  input: {
    decision: "approve" | "reject"
    expectedRevision: number
    note: string
  }
) {
  const submission = fudabaCardReviewRequestSchema.parse(input)
  return adminApiClient.Put(
    adminExchangePath(`/card-claims/${encodeURIComponent(claimId)}`),
    submission,
    parsed(reviewMutationSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

/** 名片墙对无主名片提交的简化更正，审核通过后写回那张卡。 */
export function createFudabaCardSupplement(
  cardId: string,
  input: FudabaCardSupplementPayloadInput
) {
  const submission = fudabaCardSupplementRequestSchema.parse(input)
  return platformApiClient.Post(
    exchangePath(`/cards/${encodeURIComponent(cardId)}/supplements`),
    submission,
    parsed(supplementMutationSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/** 后台审核队列：投稿、认领、补充三类共用一页，筛选由服务端合并。 */
export function getAdminFudabaReviewQueue(query: {
  type: ReviewQueueType
  query?: string
  page?: number
  pageSize?: number
}) {
  const params = new URLSearchParams({ type: query.type })
  if (query.query) params.set("query", query.query)
  if (query.page && query.page > 1) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return adminApiClient.Get(
    adminExchangePath(`/review-queue?${params.toString()}`),
    parsed(reviewQueueListSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function getAdminFudabaCardSupplement(supplementId: string) {
  return adminApiClient.Get(
    adminExchangePath(`/card-supplements/${encodeURIComponent(supplementId)}`),
    parsed(adminCardSupplementDetailSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function reviewAdminFudabaCardSupplement(
  supplementId: string,
  input: {
    decision: "approve" | "reject"
    expectedRevision: number
    note: string
  }
) {
  const submission = fudabaSupplementReviewRequestSchema.parse(input)
  return adminApiClient.Put(
    adminExchangePath(`/card-supplements/${encodeURIComponent(supplementId)}`),
    submission,
    parsed(supplementMutationSchema, {
      errorSchema: fudabaAdminCardClaimHttpErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
