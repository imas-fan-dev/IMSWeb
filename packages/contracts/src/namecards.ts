import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonError,
  exactJsonResponse,
  legacyStripRequestObject,
  numberedPageInfoSchema,
  successEnvelope,
} from "./common.js"
import { namecardReactionEmojiSchema } from "./fudaba/index.js"

export const cardIdSchema = z.number().int().positive()

export const namecardIdolSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    seriesCode: z.string().min(1),
  })
  .strict()

export const namecardMetadataSchema = {
  seriesCode: z.string().min(1).nullable(),
  favoriteIdols: z.array(namecardIdolSchema).max(20),
  claimStatus: z.enum(["unclaimed", "pending", "claimed"]),
  viewerClaimState: z
    .enum(["pending", "approving", "approved", "rejected", "cancelled"])
    .nullable(),
}

export const namecardSchema = exactJsonResponse({
  id: cardIdSchema,
  ...namecardMetadataSchema,
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  image1_thumbnail_url: z.string().min(1),
  image2_thumbnail_url: z.string().min(1),
  status: z.string().optional(),
  created_at: z.string().nullable().optional(),
})

export const namecardPageSchema = exactJsonResponse({
  list: z.array(namecardSchema),
  total: z.number().int().nonnegative(),
  totalPage: z.number().int().nonnegative(),
})

export const reactionSchema = z.record(z.string(), z.number().int().nonnegative())

export type Namecard = z.infer<typeof namecardSchema>
export type NamecardPage = z.infer<typeof namecardPageSchema>
export type NamecardReactions = z.infer<typeof reactionSchema>

export const adminNamecardSchema = exactJsonResponse({
  id: z.number().int().positive(),
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  status: z.string(),
  revision: z.number().int().nonnegative(),
})

export const adminNamecardListSchema = successEnvelope({
  data: z.array(adminNamecardSchema),
  pageInfo: numberedPageInfoSchema,
})
export const adminNamecardListBusinessErrorSchema = exactJsonError({
  success: z.literal(false),
})
export const adminNamecardListResponseSchema = z.union([
  adminNamecardListSchema,
  adminNamecardListBusinessErrorSchema,
])

export type AdminNamecard = z.infer<typeof adminNamecardSchema>

export type AdminNamecardList = z.infer<typeof adminNamecardListSchema>
export type AdminNamecardListResponse = z.infer<typeof adminNamecardListResponseSchema>

export type NamecardInput = z.input<typeof namecardSchema>

export type NamecardIdolInput = z.input<typeof namecardIdolSchema>

export type NamecardPageInput = z.input<typeof namecardPageSchema>

export type AdminNamecardInput = z.input<typeof adminNamecardSchema>

export type AdminNamecardListInput = z.input<typeof adminNamecardListSchema>

export const adminNamecardMutationSchema = successEnvelope({
  revision: z.number().int().nonnegative(),
})
export const namecardDetailResponseSchema = exactJsonResponse({
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
}).strict()
export const namecardEmptyResponseSchema = exactJsonResponse({})
export const namecardListErrorResponseSchema = exactJsonError({ msg: z.string() })
export const namecardMutationResponseSchema = z.union([
  z.object({ success: z.literal(true), revision: z.number().int().nonnegative().optional() }).strict(),
  exactJsonError({ success: z.literal(false) }),
  exactJsonError({ success: z.literal(false), error: z.string() }),
  exactJsonError({ success: z.literal(false), error: z.string(), revision: z.number().int().nonnegative() }),
])

export const reactionMutationSchema = z.object({ ok: z.literal(true) }).strict()
export const legacyEmojiMutationSchema = z.object({ success: z.literal(true) }).strict()
export const reactionMutationResponseSchema = z.union([
  reactionMutationSchema,
  legacyEmojiMutationSchema,
])
export const reactionErrorResponseSchema = exactJsonError({
  error: z.enum(["Invalid card id", "Unsupported reaction", "Card not found", "Database error"]),
})

// The old Namecards surface intentionally projects unknown fields and retains
// its parseInt/Number compatibility behavior in the API adapter.
export const namecardReactionRequestSchema = legacyStripRequestObject({
  id: z.unknown(),
  emoji: namecardReactionEmojiSchema,
})
export const namecardReactionListQuerySchema = legacyStripRequestObject({ id: z.unknown() })
export const compatibleNamecardIdParamsSchema = legacyStripRequestObject({ id: z.unknown() })
export const namecardListQuerySchema = legacyStripRequestObject({
  page: z.unknown().optional(),
  size: z.unknown().optional(),
})
export const adminNamecardListQuerySchema = legacyStripRequestObject({ page: z.unknown().optional() })
export const expectedNamecardRevisionRequestSchema = legacyStripRequestObject({
  expected_revision: z.unknown(),
})
export const expectedNamecardRevisionQuerySchema = legacyStripRequestObject({
  expected_revision: z.unknown().optional(),
})
export const namecardErrorResponseSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ msg: z.string() }),
  exactJsonError({ success: z.literal(false) }),
  exactJsonError({ success: z.literal(false), error: z.string() }),
  exactJsonError({ success: z.literal(false), error: z.string(), revision: z.number().int().nonnegative() }),
])
export const adminNamecardHttpErrorSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  namecardErrorResponseSchema,
])

export type AdminNamecardMutation = z.infer<typeof adminNamecardMutationSchema>
export type NamecardDetailResponse = z.infer<typeof namecardDetailResponseSchema>
export type NamecardEmptyResponse = z.infer<typeof namecardEmptyResponseSchema>
export type NamecardListErrorResponse = z.infer<typeof namecardListErrorResponseSchema>
export type NamecardMutationResponse = z.infer<typeof namecardMutationResponseSchema>
export type NamecardErrorResponse = z.infer<typeof namecardErrorResponseSchema>
export type AdminNamecardHttpError = z.infer<typeof adminNamecardHttpErrorSchema>
export type ReactionMutation = z.infer<typeof reactionMutationSchema>
export type LegacyEmojiMutation = z.infer<typeof legacyEmojiMutationSchema>
export type ReactionMutationResponse = z.infer<typeof reactionMutationResponseSchema>
export type ReactionErrorResponse = z.infer<typeof reactionErrorResponseSchema>
