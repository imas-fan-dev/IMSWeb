import { z } from "zod"
import { successEnvelope } from "../common.js"

import { fudabaIdolSelectionSchema, fudabaOwnerCardSchema } from "./index.js"

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

export const claimEnvelopeListSchema = z
  .object({ items: z.array(fudabaClaimEnvelopeSchema) })
  .strict()
export const ownerClaimListSchema = z
  .object({ items: z.array(fudabaCardClaimSchema) })
  .strict()
export const claimMutationSchema = successEnvelope({ claim: fudabaCardClaimSchema })
  .strict()
export const envelopeMutationSchema = successEnvelope({
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

export const registeredCardReviewListSchema = z
  .object({ items: z.array(fudabaRegisteredCardReviewSchema) })
  .strict()
export const adminCardClaimListSchema = z
  .object({ items: z.array(fudabaAdminCardClaimSchema) })
  .strict()
export const reviewMutationSchema = successEnvelope({ revision: revisionSchema })
  .strict()

export type FudabaClaimEnvelope = z.infer<typeof fudabaClaimEnvelopeSchema>
export type FudabaCardClaim = z.infer<typeof fudabaCardClaimSchema>
export type FudabaRegisteredCardReview = z.infer<
  typeof fudabaRegisteredCardReviewSchema
>
export type FudabaAdminCardClaim = z.infer<typeof fudabaAdminCardClaimSchema>
