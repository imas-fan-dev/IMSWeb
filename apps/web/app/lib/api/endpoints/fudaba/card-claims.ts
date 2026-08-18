import { adminExchangePath, exchangePath } from "@imsweb/contracts/paths"
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
  claimEnvelopeListSchema,
  claimMutationSchema,
  envelopeMutationSchema,
  ownerClaimListSchema,
  registeredCardReviewListSchema,
  reviewMutationSchema,
} from "@imsweb/contracts/fudaba/card-claims"

export * from "@imsweb/contracts/fudaba/card-claims"

export function getFudabaClaimEnvelopes() {
  return platformApiClient.Get(
    exchangePath("/me/claim-envelopes"),
    parsed(claimEnvelopeListSchema, {
      meta: withPlatformAuth(),
    })
  )
}

export function respondFudabaClaimEnvelope(
  envelopeId: string,
  decision: "confirm" | "decline",
  expectedRevision: number
) {
  return platformApiClient.Put(
    exchangePath(`/me/claim-envelopes/${encodeURIComponent(envelopeId)}`),
    { decision, expectedRevision },
    parsed(envelopeMutationSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function getFudabaOwnerCardClaims() {
  return platformApiClient.Get(
    exchangePath("/me/card-claims"),
    parsed(ownerClaimListSchema, {
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
  return platformApiClient.Post(
    exchangePath(`/legacy-cards/${legacyCardId}/claims`),
    input,
    parsed(claimMutationSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function getAdminFudabaCardReviews() {
  return adminApiClient.Get(
    adminExchangePath("/card-reviews"),
    parsed(registeredCardReviewListSchema, {
      meta: withBackofficeAuth(),
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
  return adminApiClient.Put(
    adminExchangePath(`/card-reviews/${encodeURIComponent(cardId)}`),
    input,
    parsed(reviewMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function getAdminFudabaCardClaims() {
  return adminApiClient.Get(
    adminExchangePath("/card-claims"),
    parsed(adminCardClaimListSchema, {
      meta: withBackofficeAuth(),
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
  return adminApiClient.Put(
    adminExchangePath(`/card-claims/${encodeURIComponent(claimId)}`),
    input,
    parsed(reviewMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
