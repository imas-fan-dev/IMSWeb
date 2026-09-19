import { z } from "zod"
import { backofficeProtectedHttpErrorSchema, exactJsonError, strictRequestObject, successEnvelope } from "../common.js"

import {
  fudabaIdolSelectionSchema,
  fudabaOwnerCardSchema,
  fudabaRevisionSchema,
  ownerCardIdSchema,
  ownerCardTextSchema,
  seriesCodeSchema,
} from "./index.js"

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

export const fudabaLegacyCardClaimRequestSchema = z.object({
  targetCardId: ownerCardIdSchema.nullable(),
  seriesCode: seriesCodeSchema.max(64),
  favoriteIdolIds: z.array(z.number().int().positive()).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  message: ownerCardTextSchema(1000),
}).strict()
export const fudabaClaimEnvelopeActionRequestSchema = z.object({
  decision: z.enum(["confirm", "decline"]),
  expectedRevision: fudabaRevisionSchema,
}).strict()
export const fudabaCardReviewRequestSchema = strictRequestObject({
  decision: z.enum(["approve", "reject"]),
  expectedRevision: fudabaRevisionSchema,
  note: ownerCardTextSchema(1000),
})
export const fudabaLegacyCardClaimParamsSchema = strictRequestObject({
  legacyCardId: z.unknown(),
})
export const fudabaClaimEnvelopeParamsSchema = strictRequestObject({
  envelopeId: z.unknown(),
})
export const fudabaRegisteredCardReviewParamsSchema = strictRequestObject({
  cardId: z.unknown(),
})
export const fudabaAdminCardClaimParamsSchema = strictRequestObject({
  claimId: z.unknown(),
})
export const fudabaCardClaimErrorSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ success: z.literal(false), error: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string(), revision: revisionSchema }),
  exactJsonError({ success: z.literal(false), code: z.string(), claimId: z.string(), state: claimStateSchema }),
  exactJsonError({ success: z.literal(false), code: z.string(), message: z.string() }),
])
export const fudabaAdminCardClaimHttpErrorSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  fudabaCardClaimErrorSchema,
])

export type FudabaClaimEnvelope = z.infer<typeof fudabaClaimEnvelopeSchema>
export type FudabaClaimEnvelopeListResponse = z.infer<
  typeof claimEnvelopeListSchema
>
export type FudabaCardClaim = z.infer<typeof fudabaCardClaimSchema>
export type FudabaOwnerClaimListResponse = z.infer<typeof ownerClaimListSchema>
export type FudabaClaimMutationResponse = z.infer<typeof claimMutationSchema>
export type FudabaEnvelopeMutationResponse = z.infer<
  typeof envelopeMutationSchema
>
export type FudabaRegisteredCardReview = z.infer<
  typeof fudabaRegisteredCardReviewSchema
>
export type FudabaAdminCardClaim = z.infer<typeof fudabaAdminCardClaimSchema>
export type FudabaRegisteredCardReviewListResponse = z.infer<
  typeof registeredCardReviewListSchema
>
export type FudabaAdminCardClaimListResponse = z.infer<
  typeof adminCardClaimListSchema
>
export type FudabaReviewMutationResponse = z.infer<typeof reviewMutationSchema>
export type FudabaCardClaimError = z.infer<typeof fudabaCardClaimErrorSchema>
export type FudabaAdminCardClaimHttpError = z.infer<
  typeof fudabaAdminCardClaimHttpErrorSchema
>
