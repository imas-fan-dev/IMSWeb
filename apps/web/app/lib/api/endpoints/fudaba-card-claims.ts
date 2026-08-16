import { z } from "zod"

import { adminApiClient } from "../admin-client"
import { platformApiClient } from "../platform-client"
import {
  withBackofficeAuth,
  withBackofficeCsrf,
  withPlatformAuth,
  withPlatformCsrf,
} from "../types"
import { fudabaIdolSelectionSchema, fudabaOwnerCardSchema } from "./fudaba"

const timestampSchema = z.string().datetime({ offset: true })
const revisionSchema = z.number().int().safe().nonnegative()
const legacyCardIdSchema = z.number().int().positive()
const claimStateSchema = z.enum([
  "pending",
  "approving",
  "approved",
  "rejected",
  "cancelled",
])

export const fudabaClaimEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    legacyCardId: legacyCardIdSchema,
    cardId: z.string().min(1),
    kind: z.enum(["legacy-card-match", "claim-approved", "claim-rejected"]),
    title: z.string().min(1),
    body: z.string(),
    actionState: z.enum(["pending", "confirmed", "declined", "none"]),
    claimId: z.string().min(1).nullable(),
    revision: revisionSchema,
    readAt: timestampSchema.nullable(),
    actedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
  })
  .strict()

export const fudabaCardClaimSchema = z
  .object({
    id: z.string().min(1),
    legacyCardId: legacyCardIdSchema,
    targetCardId: z.string().min(1).nullable(),
    seriesCode: z.string().min(1),
    favoriteIdols: z.array(fudabaIdolSelectionSchema).max(20),
    state: claimStateSchema,
    message: z.string(),
    reviewNote: z.string(),
    revision: revisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
  })
  .strict()

const claimEnvelopeListSchema = z
  .object({ items: z.array(fudabaClaimEnvelopeSchema) })
  .strict()
const ownerClaimListSchema = z
  .object({ items: z.array(fudabaCardClaimSchema) })
  .strict()
const claimMutationSchema = z
  .object({ success: z.literal(true), claim: fudabaCardClaimSchema })
  .strict()
const envelopeMutationSchema = z
  .object({
    success: z.literal(true),
    envelope: fudabaClaimEnvelopeSchema,
    claim: fudabaCardClaimSchema.nullable(),
  })
  .strict()

export const fudabaRegisteredCardReviewSchema = z
  .object({
    card: fudabaOwnerCardSchema,
    owner: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
  })
  .strict()

export const fudabaAdminCardClaimSchema = fudabaCardClaimSchema
  .extend({
    claimant: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
    legacyCard: z
      .object({
        id: legacyCardIdSchema,
        frontImageUrl: z.string().min(1),
        backImageUrl: z.string().min(1),
      })
      .strict(),
  })
  .strict()

const registeredCardReviewListSchema = z
  .object({ items: z.array(fudabaRegisteredCardReviewSchema) })
  .strict()
const adminCardClaimListSchema = z
  .object({ items: z.array(fudabaAdminCardClaimSchema) })
  .strict()
const reviewMutationSchema = z
  .object({ success: z.literal(true), revision: revisionSchema })
  .strict()

export type FudabaClaimEnvelope = z.infer<typeof fudabaClaimEnvelopeSchema>
export type FudabaCardClaim = z.infer<typeof fudabaCardClaimSchema>
export type FudabaRegisteredCardReview = z.infer<
  typeof fudabaRegisteredCardReviewSchema
>
export type FudabaAdminCardClaim = z.infer<typeof fudabaAdminCardClaimSchema>

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
