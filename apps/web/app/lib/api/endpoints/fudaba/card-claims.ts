import { z } from "@imsweb/contracts/z"

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
  return platformApiClient.Get<
    z.infer<typeof claimEnvelopeListSchema>,
    unknown
  >("/api/community/exchange/me/claim-envelopes", {
    meta: withPlatformAuth(),
    transform: (payload) => claimEnvelopeListSchema.parse(payload),
  })
}

export function respondFudabaClaimEnvelope(
  envelopeId: string,
  decision: "confirm" | "decline",
  expectedRevision: number
) {
  return platformApiClient.Put<z.infer<typeof envelopeMutationSchema>, unknown>(
    `/api/community/exchange/me/claim-envelopes/${encodeURIComponent(envelopeId)}`,
    { decision, expectedRevision },
    {
      meta: withPlatformCsrf(),
      transform: (payload) => envelopeMutationSchema.parse(payload),
    }
  )
}

export function getFudabaOwnerCardClaims() {
  return platformApiClient.Get<z.infer<typeof ownerClaimListSchema>, unknown>(
    "/api/community/exchange/me/card-claims",
    {
      meta: withPlatformAuth(),
      transform: (payload) => ownerClaimListSchema.parse(payload),
    }
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
  return platformApiClient.Post<z.infer<typeof claimMutationSchema>, unknown>(
    `/api/community/exchange/legacy-cards/${legacyCardId}/claims`,
    input,
    {
      meta: withPlatformCsrf(),
      transform: (payload) => claimMutationSchema.parse(payload),
    }
  )
}

export function getAdminFudabaCardReviews() {
  return adminApiClient.Get<
    z.infer<typeof registeredCardReviewListSchema>,
    unknown
  >("/api/admin/community/exchange/card-reviews", {
    meta: withBackofficeAuth(),
    transform: (payload) => registeredCardReviewListSchema.parse(payload),
  })
}

export function reviewAdminFudabaCard(
  cardId: string,
  input: {
    decision: "approve" | "reject"
    expectedRevision: number
    note: string
  }
) {
  return adminApiClient.Put<z.infer<typeof reviewMutationSchema>, unknown>(
    `/api/admin/community/exchange/card-reviews/${encodeURIComponent(cardId)}`,
    input,
    {
      meta: withBackofficeCsrf(),
      transform: (payload) => reviewMutationSchema.parse(payload),
    }
  )
}

export function getAdminFudabaCardClaims() {
  return adminApiClient.Get<z.infer<typeof adminCardClaimListSchema>, unknown>(
    "/api/admin/community/exchange/card-claims",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => adminCardClaimListSchema.parse(payload),
    }
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
  return adminApiClient.Put<z.infer<typeof reviewMutationSchema>, unknown>(
    `/api/admin/community/exchange/card-claims/${encodeURIComponent(claimId)}`,
    input,
    {
      meta: withBackofficeCsrf(),
      transform: (payload) => reviewMutationSchema.parse(payload),
    }
  )
}
