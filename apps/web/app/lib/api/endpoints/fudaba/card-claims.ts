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
  adminCardClaimListSchema,
  // pi-lens-ignore: ts:2724
  fudabaAdminCardClaimHttpErrorSchema,
  fudabaCardClaimErrorSchema,
  claimEnvelopeListSchema,
  fudabaClaimEnvelopeActionRequestSchema,
  fudabaCardReviewRequestSchema,
  fudabaLegacyCardClaimRequestSchema,
  claimMutationSchema,
  envelopeMutationSchema,
  ownerClaimListSchema,
  registeredCardReviewListSchema,
  reviewMutationSchema,
} from "@imsweb/contracts/fudaba/card-claims"

export {
  fudabaClaimEnvelopeSchema,
  fudabaCardClaimSchema,
  claimEnvelopeListSchema,
  ownerClaimListSchema,
  claimMutationSchema,
  envelopeMutationSchema,
  fudabaRegisteredCardReviewSchema,
  fudabaAdminCardClaimSchema,
  registeredCardReviewListSchema,
  adminCardClaimListSchema,
  reviewMutationSchema,
} from "@imsweb/contracts/fudaba/card-claims"
export type * from "@imsweb/contracts/fudaba/card-claims"

export function getFudabaClaimEnvelopes() {
  return platformApiClient.Get(
    exchangePath("/me/claim-envelopes"),
    parsed(claimEnvelopeListSchema, {
      errorSchema: fudabaCardClaimErrorSchema,
      businessErrorSchema: fudabaCardClaimErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function respondFudabaClaimEnvelope(
  envelopeId: string,
  decision: "confirm" | "decline",
  expectedRevision: number
) {
  const submission = fudabaClaimEnvelopeActionRequestSchema.parse({
    decision,
    expectedRevision,
  })
  return platformApiClient.Put(
    exchangePath(`/me/claim-envelopes/${encodeURIComponent(envelopeId)}`),
    submission,
    parsed(envelopeMutationSchema, {
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
  input: {
    targetCardId: string | null
    seriesCode: string
    favoriteIdolIds: number[]
    message: string
  }
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
