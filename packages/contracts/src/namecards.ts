import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonError,
  exactJsonResponse,
  legacyStripRequestObject,
  numberedPageInfoSchema,
  successEnvelope,
} from "./common.js"
import {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  namecardReactionEmojiSchema,
} from "./fudaba/index.js"

export const cardIdSchema = z.number().int().positive()

export const namecardFavoriteCharacterSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    seriesCode: z.string().min(1),
  })
  .strict()

export const namecardMetadataSchema = {
  seriesCode: z.string().min(1).nullable(),
  favoriteCharacters: z
    .array(namecardFavoriteCharacterSchema)
    .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
  claimStatus: z.enum(["unclaimed", "pending", "claimed"]),
  viewerClaimState: z
    .enum(["pending", "approving", "approved", "rejected", "cancelled"])
    .nullable(),
  claimerName: z.string().min(1).nullable(),
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
  displayName: z.string().min(1).nullable(),
  producerName: z.string().min(1).nullable(),
  origin: z.string().min(1),
  /** 锁定理由；只有 `locked` 状态的名片会带值。 */
  lockReason: z.string().min(1).nullable(),
  /**
   * 待审版本的复核结果。为 `pending` 时列表里的内容来自待审版本，
   * 已发布版本仍在对外展示。
   */
  reviewStatus: z.enum(["pending", "rejected", "locked"]).nullable(),
  reviewReason: z.string().min(1).nullable(),
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

export type NamecardFavoriteCharacterInput = z.input<
  typeof namecardFavoriteCharacterSchema
>

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
export const adminNamecardListQuerySchema = legacyStripRequestObject({
  page: z.unknown().optional(),
  query: z.unknown().optional(),
  status: z.unknown().optional(),
  origin: z.unknown().optional(),
})
export const expectedNamecardRevisionRequestSchema = legacyStripRequestObject({
  expected_revision: z.unknown(),
})
/** 驳回请求额外带驳回理由（通过请求仍用上面那个 schema，忽略 reason）。 */
export const rejectedNamecardRequestSchema = legacyStripRequestObject({
  expected_revision: z.unknown(),
  reason: z.unknown().optional(),
})
/** 锁定请求必须带锁定理由，解锁请求沿用 {@link expectedNamecardRevisionRequestSchema}。 */
export const lockedNamecardRequestSchema = legacyStripRequestObject({
  expected_revision: z.unknown(),
  reason: z.unknown(),
})

/**
 * Marks the pending submission as a violation. Same shape as locking, but the
 * verdict lands on the submission: the published version stays online.
 */
export const flaggedNamecardRequestSchema = legacyStripRequestObject({
  expected_revision: z.unknown(),
  reason: z.unknown(),
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
