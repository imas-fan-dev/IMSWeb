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
  namecardCreditSchema,
  namecardReactionEmojiSchema,
} from "./fudaba/index.js"
import { NAMECARD_CREDIT_LIMIT } from "./fudaba/namecard-runtime.js"

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

/**
 * The public wall reads the same `fudaba_cards` rows the editor writes, so the
 * detail view can show the lifecycle fields without a second request. Every
 * optional text field is null when the producer left it empty.
 */
export const namecardPublicDetailSchema = {
  /** Fudaba row id, used to deep-link the owner editor. */
  cardId: z.string().min(1),
  cardNumber: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  producerName: z.string().min(1).nullable(),
  /** Sorting aid only, rendered in parentheses after the producer name. */
  producerReading: z.string().min(1).nullable(),
  groupName: z.string().min(1).nullable(),
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; empty parts are dropped. */
  madeOn: z.string().min(1).nullable(),
  isOriginal: z.boolean(),
  madeWithAi: z.boolean(),
  bio: z.string().min(1).nullable(),
  tradeNote: z.string().min(1).nullable(),
  exchangeMode: z.enum(["auto", "manual", "none"]),
  accent: z.string().min(1).nullable(),
  seriesCodes: z.array(z.string().min(1)).max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
  credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
  /** Ordered middle pages; the wall renders them after the back image. */
  middleImageUrls: z.array(z.string().min(1)),
  /** True when the signed-in viewer owns the row; drives the edit action. */
  canEdit: z.boolean(),
  /** False keeps the claim/complete actions visible on the detail dialog. */
  hasOwner: z.boolean(),
}

/**
 * One side of the review diff: the published copy next to the submitted one.
 * Images are ordered front, back, then the middle pages.
 */
export const namecardDiffSideSchema = z
  .object({
    producerName: z.string().min(1).nullable(),
    producerReading: z.string().min(1).nullable(),
    groupName: z.string().min(1).nullable(),
    madeOn: z.string().min(1).nullable(),
    bio: z.string().min(1).nullable(),
    tradeNote: z.string().min(1).nullable(),
    isOriginal: z.boolean(),
    madeWithAi: z.boolean(),
    visible: z.boolean(),
    exchangeMode: z.enum(["auto", "manual", "none"]),
    seriesCodes: z.array(z.string().min(1)),
    credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
    favoriteCharacters: z
      .array(namecardFavoriteCharacterSchema)
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
    frontImageUrl: z.string().min(1),
    backImageUrl: z.string().min(1).nullable(),
    middleImageUrls: z.array(z.string().min(1)),
  })
  .strict()

export const adminNamecardDiffSchema = exactJsonResponse({
  id: cardIdSchema,
  status: z.string(),
  reviewStatus: z.enum(["pending", "rejected", "locked"]).nullable(),
  live: namecardDiffSideSchema,
  /** The revision waiting for review; null when nothing is queued. */
  pending: namecardDiffSideSchema.nullable(),
})

export const namecardSchema = exactJsonResponse({
  id: cardIdSchema,
  ...namecardMetadataSchema,
  ...namecardPublicDetailSchema,
  image1_url: z.string().min(1),
  /** A single-sided card has no back image. */
  image2_url: z.string().min(1).nullable(),
  image1_thumbnail_url: z.string().min(1),
  image2_thumbnail_url: z.string().min(1).nullable(),
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
  /** A single-sided card has no back image. */
  image2_url: z.string().min(1).nullable(),
  status: z.string(),
  revision: z.number().int().nonnegative(),
  producerName: z.string().min(1).nullable(),
  /** 制作人名读法：排序辅助，只有填写过的名片才带值。 */
  producerReading: z.string().min(1).nullable(),
  origin: z.string().min(1),
  /** 锁定理由；只有 `locked` 状态的名片会带值。 */
  lockReason: z.string().min(1).nullable(),
  /**
   * 待审版本的复核结果。为 `pending` 时列表里的内容来自待审版本，
   * 已发布版本仍在对外展示。
   */
  reviewStatus: z.enum(["pending", "rejected", "locked"]).nullable(),
  reviewReason: z.string().min(1).nullable(),
  /** Front, back and every middle page; drives the multi-page badge. */
  pageCount: z.number().int().positive(),
})

export type AdminNamecardDiff = z.infer<typeof adminNamecardDiffSchema>
export type NamecardDiffSide = z.infer<typeof namecardDiffSideSchema>

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
  image2_url: z.string().min(1).nullable(),
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
/** Artwork routes carry the page handle (and the live/draft variant) in the path. */
export const namecardMediaParamsSchema = legacyStripRequestObject({
  id: z.unknown(),
  side: z.unknown(),
  variant: z.unknown().optional(),
})
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
