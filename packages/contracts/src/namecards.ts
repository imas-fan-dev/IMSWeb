import { z } from "zod"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonError,
  exactJsonResponse,
  legacyStripRequestObject,
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "./common.js"
import {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  fudabaCardFieldsRequestSchema,
  namecardCreditSchema,
  namecardReactionEmojiSchema,
  type NamecardCredit,
} from "./fudaba/index.js"
import {
  NAMECARD_CREDIT_LIMIT,
  NAMECARD_MIDDLE_IMAGE_LIMIT,
  NAMECARD_SERIES_LIMIT,
} from "./fudaba/namecard-runtime.js"

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
  /** The claimant's account name, shown on the wall badge. */
  claimerName: z.string().min(1).nullable(),
  /** Where that name links to; null for the legacy rows with no account. */
  claimerAccountId: z.string().min(1).nullable(),
  /** Someone's supplement is waiting for review, so nobody else may submit. */
  supplementPending: z.boolean(),
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
  producerName: z.string().nullable(),
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
    producerName: z.string().nullable(),
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

/** The lifecycle column, verbatim; `status` above stays in the legacy
 * vocabulary the review badges read. */
export const namecardLifecycleStatusSchema = z.enum([
  "draft",
  "pending",
  "approving",
  "published",
  "hidden",
  "rejected",
  "withdrawn",
  "locked",
])

export const namecardReviewStatusSchema = z.enum([
  "pending",
  "rejected",
  "locked",
])

/**
 * Addresses one page of the live artwork: `#0` is the front, `#n-1` the back.
 * The admin console may reorder or drop pages but never adds new artwork.
 */
export const namecardMediaSlotTokenSchema = z.string().regex(/^#\d{1,2}$/)

export const adminNamecardDiffSchema = exactJsonResponse({
  id: cardIdSchema,
  status: z.string(),
  publicationStatus: namecardLifecycleStatusSchema,
  reviewStatus: namecardReviewStatusSchema.nullable(),
  revision: z.number().int().nonnegative(),
  /** The account the card belongs to; null for an unclaimed row. */
  ownerAccountId: z.string().min(1).nullable(),
  ownerDisplayName: z.string().min(1).nullable(),
  lockReason: z.string().min(1).nullable(),
  reviewReason: z.string().min(1).nullable(),
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

/** One platform handle as the profile page renders it. */
export const platformAccountLinkSchema = exactJsonResponse({
  kindId: z.string().min(1),
  name: z.string().min(1),
  group: z.enum(["game", "social", "link"]),
  value: z.string().min(1),
  /** Null for id-only platforms, which show a copy button instead of a link. */
  url: z.string().min(1).nullable(),
  color: z.string().min(1).nullable(),
  icon: z.string().min(1).nullable(),
})

export type PlatformAccountLink = z.infer<typeof platformAccountLinkSchema>

/** Someone's public page: the profile half, then their own wall cards. */
export const publicProfileSchema = exactJsonResponse({
  accountId: z.string().min(1),
  /** Short, permanent handle: /user/<uid>. */
  uid: z.number().int().positive(),
  /** Vanity path segment the owner picked, when they picked one. */
  pageSlug: z.string().min(1).nullable(),
  displayName: z.string().min(1),
  avatarUrl: z.string().min(1).nullable(),
  homeCity: z.string().min(1).nullable(),
  bio: z.string(),
  accounts: z.array(platformAccountLinkSchema),
})

export const reactionSchema = z.record(z.string(), z.number().int().nonnegative())

export type Namecard = z.infer<typeof namecardSchema>
export type NamecardPage = z.infer<typeof namecardPageSchema>
export type PublicProfile = z.infer<typeof publicProfileSchema>
export type NamecardReactions = z.infer<typeof reactionSchema>

export const adminNamecardSchema = exactJsonResponse({
  id: z.number().int().positive(),
  image1_url: z.string().min(1),
  /** A single-sided card has no back image. */
  image2_url: z.string().min(1).nullable(),
  status: z.string(),
  revision: z.number().int().nonnegative(),
  producerName: z.string().nullable(),
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

/**
 * The management window always submits the whole card, so the API can diff it
 * against the live copy and tell the owner exactly what changed.
 *
 * `ownerAccountId` is omitted to keep the current owner and `null` to clear it;
 * `reason` is required whenever the submission changes anything.
 */
/**
 * The backoffice may save a card whose producer name or series list is still
 * empty; the owner editor keeps the strict shape.
 */
const adminNamecardFieldsSchema = fudabaCardFieldsRequestSchema
  .extend({
    producerName: z.string().trim().max(80),
    seriesCodes: z.array(z.string().trim().min(1)).max(NAMECARD_SERIES_LIMIT),
  })
  .strict()

export const adminNamecardUpdateRequestSchema = adminNamecardFieldsSchema
  .extend({
    expected_revision: z.number().int().nonnegative(),
    reason: z.string().trim().max(400).nullable(),
    ownerAccountId: z.string().trim().min(1).max(128).nullable().optional(),
    status: namecardLifecycleStatusSchema,
    review_status: namecardReviewStatusSchema.nullable(),
    media_order: z
      .array(namecardMediaSlotTokenSchema)
      .min(1)
      .max(2 + NAMECARD_MIDDLE_IMAGE_LIMIT),
  })
  .strict()

/**
 * Readers report a published card from the wall. The three presets cover every
 * case the queue is meant to handle; `detail` carries whatever the reporter
 * wants to add.
 */
export const namecardFeedbackReasonSchema = z.enum([
  "info-error",
  "ownership-error",
  "content-violation",
])

export const NAMECARD_FEEDBACK_NOTE_LIMIT = 400

export const createNamecardFeedbackRequestSchema = z
  .object({
    reason: namecardFeedbackReasonSchema,
    /** The reporter describes the problem themselves; the server never fills it. */
    detail: z.string().trim().min(1).max(NAMECARD_FEEDBACK_NOTE_LIMIT),
  })
  .strict()

export const namecardFeedbackMutationSchema = successEnvelope({})

/** One row of the report queue: the card on the wall plus who reported it. */
export const adminNamecardFeedbackSchema = exactJsonResponse({
  id: z.number().int().positive(),
  cardNumber: z.number().int().positive(),
  producerName: z.string().nullable(),
  image1_url: z.string().min(1),
  image2_url: z.string().min(1).nullable(),
  pageCount: z.number().int().positive(),
  reporterName: z.string().min(1),
  reason: namecardFeedbackReasonSchema,
  detail: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
})

export const adminNamecardFeedbackListSchema = successEnvelope({
  data: z.array(adminNamecardFeedbackSchema),
  pageInfo: numberedPageInfoSchema,
})

/** The queue can also refuse: the operator session died or the read failed. */
export const adminNamecardFeedbackListResponseSchema = z.union([
  adminNamecardFeedbackListSchema,
  z.object({ success: z.literal(false) }).strict(),
])

/** Resolving a report answers a flag, or a reason when the row is already gone. */
export const namecardFeedbackResponseSchema = z.union([
  namecardFeedbackMutationSchema,
  z.object({ success: z.literal(false), message: z.string().min(1) }).strict(),
])

export const adminNamecardFeedbackListQuerySchema = legacyStripRequestObject({
  page: z.unknown().optional(),
})

/** A person as the audit tables show them: a name plus both tallies. */
export const namecardAuditUserSchema = exactJsonResponse({
  /** Display name, falling back to the account id when no profile exists. */
  name: z.string().min(1),
  /** Records for this account across the whole audit. */
  total: z.number().int().nonnegative(),
  /** Records for this account inside the returned page. */
  pageCount: z.number().int().nonnegative(),
})

export const namecardLockAuditActionSchema = z.enum([
  "locked",
  "unlocked",
  "flagged",
])

export const namecardLockAuditRowSchema = exactJsonResponse({
  id: z.number().int().positive(),
  cardNumber: z.number().int().positive(),
  producerName: z.string().nullable(),
  owner: namecardAuditUserSchema.nullable(),
  action: namecardLockAuditActionSchema,
  /** Present on a lock entry; releases keep whatever the operator typed. */
  reason: z.string().min(1).nullable(),
  handledBy: z.string().min(1).nullable(),
  occurredAt: z.string().min(1),
})

export const namecardLockAuditListSchema = successEnvelope({
  data: z.array(namecardLockAuditRowSchema),
  pageInfo: numberedPageInfoSchema,
})

export const namecardFeedbackAuditRowSchema = exactJsonResponse({
  id: z.number().int().positive(),
  cardNumber: z.number().int().positive(),
  producerName: z.string().nullable(),
  owner: namecardAuditUserSchema.nullable(),
  reporter: namecardAuditUserSchema,
  reason: namecardFeedbackReasonSchema,
  outcome: z.enum(["accepted", "rejected"]),
  handledBy: z.string().min(1).nullable(),
  handledAt: z.string().min(1).nullable(),
})

export const namecardFeedbackAuditListSchema = successEnvelope({
  data: z.array(namecardFeedbackAuditRowSchema),
  pageInfo: numberedPageInfoSchema,
})

const namecardAuditFailureSchema = z.object({ success: z.literal(false) }).strict()

export const namecardLockAuditListResponseSchema = z.union([
  namecardLockAuditListSchema,
  namecardAuditFailureSchema,
])

export const namecardFeedbackAuditListResponseSchema = z.union([
  namecardFeedbackAuditListSchema,
  namecardAuditFailureSchema,
])

export const namecardLockAuditQuerySchema = legacyStripRequestObject({
  page: z.unknown().optional(),
  owner: z.unknown().optional(),
  reason: z.unknown().optional(),
  handler: z.unknown().optional(),
  action: z.unknown().optional(),
})

export const namecardFeedbackAuditQuerySchema = legacyStripRequestObject({
  page: z.unknown().optional(),
  owner: z.unknown().optional(),
  reporter: z.unknown().optional(),
  outcome: z.unknown().optional(),
  handler: z.unknown().optional(),
})

export type NamecardAuditUser = z.infer<typeof namecardAuditUserSchema>
export type NamecardLockAuditRow = z.infer<typeof namecardLockAuditRowSchema>
export type NamecardFeedbackAuditRow = z.infer<typeof namecardFeedbackAuditRowSchema>
export type NamecardLockAuditList = z.infer<typeof namecardLockAuditListSchema>
export type NamecardFeedbackAuditList = z.infer<typeof namecardFeedbackAuditListSchema>
export type AdminNamecardLockAuditListResponse = z.infer<
  typeof namecardLockAuditListResponseSchema
>
export type AdminNamecardFeedbackAuditListResponse = z.infer<
  typeof namecardFeedbackAuditListResponseSchema
>

export const namecardFeedbackIdParamsSchema = z.object({
  feedbackId: z.coerce.number().int().positive(),
})

/** The reporter always gets the same template; only the outcome varies. */
export const resolveNamecardFeedbackRequestSchema = z
  .object({
    outcome: z.enum(["accepted", "rejected"]),
    /** Required when rejecting: it travels to the reporter verbatim. */
    note: z.string().trim().max(NAMECARD_FEEDBACK_NOTE_LIMIT).nullable(),
  })
  .strict()

export type AdminNamecardFeedback = z.infer<typeof adminNamecardFeedbackSchema>
/** The success payload the client parses. */
export type AdminNamecardFeedbackList = z.infer<
  typeof adminNamecardFeedbackListSchema
>
export type AdminNamecardFeedbackListResponse = z.infer<
  typeof adminNamecardFeedbackListResponseSchema
>
export type NamecardFeedbackResponse = z.infer<
  typeof namecardFeedbackResponseSchema
>
export type NamecardFeedbackReason = z.infer<typeof namecardFeedbackReasonSchema>
export type ResolveNamecardFeedbackInput = z.input<
  typeof resolveNamecardFeedbackRequestSchema
>
export type CreateNamecardFeedbackInput = z.input<
  typeof createNamecardFeedbackRequestSchema
>
export type CreateNamecardFeedbackRequest = z.infer<
  typeof createNamecardFeedbackRequestSchema
>
export type ResolveNamecardFeedbackRequest = z.infer<
  typeof resolveNamecardFeedbackRequestSchema
>
export type NamecardFeedbackIdParams = z.infer<
  typeof namecardFeedbackIdParamsSchema
>

export const adminNamecardDeleteRequestSchema = z
  .object({
    expected_revision: z.number().int().nonnegative(),
  })
  .strict()
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
export const publicProfileParamsSchema = legacyStripRequestObject({
  accountId: z.string().min(1),
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
  /** The backoffice points the operator at the field that failed. */
  exactJsonError({ error: z.string(), field: z.literal("reason") }),
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
export type AdminNamecardUpdateRequest = z.infer<
  typeof adminNamecardUpdateRequestSchema
>
export type AdminNamecardDeleteRequest = z.infer<
  typeof adminNamecardDeleteRequestSchema
>
export type NamecardLifecycleStatus = z.infer<
  typeof namecardLifecycleStatusSchema
>
export type NamecardReviewStatus = z.infer<typeof namecardReviewStatusSchema>
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

/** 名片墙顶部的临时面板：进度、贡献榜与当前用户的贡献。 */
export const wallInsightContributorSchema = z
  .object({
    accountId: z.string().min(1),
    displayName: z.string().min(1),
    points: z.number().int().nonnegative(),
    cards: z.number().int().nonnegative(),
  })
  .strict()

export const wallInsightViewerSchema = z
  .object({
    accountId: z.string().min(1),
    displayName: z.string().min(1),
    points: z.number().int().nonnegative(),
    /** 1 起的全局名次；没有贡献时为 null。 */
    rank: z.number().int().positive().nullable(),
  })
  .strict()

export const wallInsightsSchema = exactJsonResponse({
  /** 名片墙上还没有主人的名片总数（认领进度的分母）。 */
  /** Every published guest submission, the shared denominator of both bars. */
  guestTotal: z.number().int().nonnegative(),
  ownerless: z.number().int().nonnegative(),
  /** 这些无主名片里连企划都没有的张数（补充进度的分母）。 */
  ownerlessMissingSeries: z.number().int().nonnegative(),
  claimed: z.number().int().nonnegative(),
  claimsPending: z.number().int().nonnegative(),
  supplemented: z.number().int().nonnegative(),
  supplementsPending: z.number().int().nonnegative(),
  contributors: z.array(wallInsightContributorSchema).max(10),
  viewer: wallInsightViewerSchema.nullable(),
})

export const randomOwnerlessCardSchema = exactJsonResponse({
  cardNumber: z.number().int().positive(),
})

export const randomOwnerlessCardErrorSchema = exactJsonError({
  success: z.literal(false),
  code: z.literal("FUDABA_NO_OWNERLESS_CARD"),
})

export type WallInsightContributor = z.infer<typeof wallInsightContributorSchema>
export type WallInsights = z.infer<typeof wallInsightsSchema>
export type RandomOwnerlessCard = z.infer<typeof randomOwnerlessCardSchema>

/** The catalogue the backoffice edits; the profile page renders it as-is. */
export const platformAccountKindSchema = exactJsonResponse({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(40),
  group: z.enum(["game", "social", "link"]),
  pattern: z.string().min(1).max(200),
  baseUrl: z.string().min(1).nullable(),
  color: z.string().min(4).max(9).nullable(),
  icon: z.string().min(1).max(40).nullable(),
  displayOrder: z.number().int().nonnegative(),
  enabled: z.boolean(),
})

/** One account the visitor filled in, normalized to the bare identifier. */
export const platformAccountEntrySchema = exactJsonResponse({
  kindId: z.string().min(1).max(32),
  value: z.string().min(1).max(200),
})

export const myPlatformAccountsSchema = exactJsonResponse({
  catalog: z.array(platformAccountKindSchema),
  entries: z.array(platformAccountEntrySchema),
})

export const platformAccountValueRequestSchema = strictRequestObject({
  value: z.string().trim().min(1).max(200),
})

export type PlatformAccountKind = z.infer<typeof platformAccountKindSchema>
export type PlatformAccountEntry = z.infer<typeof platformAccountEntrySchema>
export type MyPlatformAccounts = z.infer<typeof myPlatformAccountsSchema>
