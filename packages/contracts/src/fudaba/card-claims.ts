import { z } from "zod"
import { cardPageSchema } from "./index.js"
import {
  backofficeProtectedHttpErrorSchema,
  exactJsonError,
  exactJsonResponse,
  numberedPageInfoSchema,
  strictRequestObject,
  successEnvelope,
} from "../common.js"
import { namecardDiffSideSchema } from "../namecards.js"

import {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  fudabaCharacterSelectionSchema,
  fudabaOwnerCardSchema,
  fudabaRevisionSchema,
  namecardProducerReadingSchema,
  namecardProductionDateSchema,
  namecardSeriesCodesSchema,
  ownerCardIdSchema,
  ownerCardRequestTextSchema,
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

/**
 * The wall edits a card through two shorter forms than the owner editor: a
 * claim carries the six basic fields, a supplement the four that need no
 * artwork. Both send only what the visitor changed, so every key is optional
 * and an empty payload is rejected instead of stored as a no-op revision.
 */
const claimFieldSchema = {
  producerName: ownerCardRequestTextSchema(80, true),
  producerReading: namecardProducerReadingSchema.nullable(),
  groupName: ownerCardRequestTextSchema(80).nullable(),
  madeOn: namecardProductionDateSchema.nullable(),
  seriesCodes: namecardSeriesCodesSchema,
  favoriteCharacterIds: z
    .array(z.number().int().positive())
    .max(NAMECARD_FAVORITE_CHARACTER_LIMIT)
    .refine((ids) => new Set(ids).size === ids.length),
} as const

const filledInAtLeastOnce = (value: object) => Object.keys(value).length > 0

/**
 * 审核通过后要执行的旋转，按顺时针 90° 的圈数记（0-3）。目前上线版本只有正反面，
 * 中间页不上传新图，所以旋转也只支持这两面。
 */
export const cardMediaRotationsSchema = z
  .object({
    front: z.number().int().min(0).max(3).optional(),
    back: z.number().int().min(0).max(3).optional(),
  })
  .strict();

/** 认领记录里的字段快照：空对象表示「只提交归属关系」。 */
export const fudabaCardClaimPayloadSchema = z
  .object({
    producerName: claimFieldSchema.producerName.optional(),
    /** 团体标记：认领时可以把一张无主卡标成团体名片。 */
    isGroupCard: z.boolean().optional(),
    /** 审核通过后再执行的旋转，提交人不动原始对象。 */
    rotations: cardMediaRotationsSchema.optional(),
    producerReading: claimFieldSchema.producerReading.optional(),
    groupName: claimFieldSchema.groupName.optional(),
    madeOn: claimFieldSchema.madeOn.optional(),
    seriesCodes: claimFieldSchema.seriesCodes.optional(),
    favoriteCharacterIds: claimFieldSchema.favoriteCharacterIds.optional(),
  })
  .strict()

export const fudabaCardClaimSchema = z
  .object({
    id: z.string().min(1),
    legacyCardId: legacyCardIdSchema,
    targetCardId: z.string().min(1).nullable(),
    seriesCode: z.string().min(1),
    /** The fields the claimant touched; omitted keys keep the live value. */
    payload: fudabaCardClaimPayloadSchema,
    favoriteCharacters: z
      .array(fudabaCharacterSelectionSchema)
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
    state: claimStateSchema,
    message: z.string(),
    reviewNote: z.string(),
    revision: revisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
  })
  .strict()

export const ownerClaimListSchema = z
  .object({ items: z.array(fudabaCardClaimSchema) })
  .strict()
export const claimMutationSchema = successEnvelope({ claim: fudabaCardClaimSchema })
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
    /** The wall number of the card a binding claim merges into. */
    targetCardNumber: z.number().int().positive().nullable(),
    claimant: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
    legacyCard: z
      .object({
        id: legacyCardIdSchema,
        /** 统一布局的页面（后台作用域）。 */
        pages: z.array(cardPageSchema).optional(),
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

/** Supplements cover identity, series and idols; artwork stays with the owner. */
export const fudabaCardSupplementPayloadSchema = z
  .object({
    producerName: claimFieldSchema.producerName.optional(),
    /** 团体标记：补充者可以提出把这张无主卡标成团体名片。 */
    isGroupCard: z.boolean().optional(),
    /** 审核通过后按顺序执行的旋转，提交人不动原始对象。 */
    rotations: cardMediaRotationsSchema.optional(),
    groupName: claimFieldSchema.groupName.optional(),
    seriesCodes: claimFieldSchema.seriesCodes.optional(),
    favoriteCharacterIds: claimFieldSchema.favoriteCharacterIds.optional(),
  })
  .strict()
  .refine(filledInAtLeastOnce, { message: "至少要改动一处资料" })

export const fudabaLegacyCardClaimRequestSchema = z.object({
  targetCardId: ownerCardIdSchema.nullable(),
  /**
   * The six fields as the claimant left them; omitted keys stay untouched.
   * Binding to an existing card sends nothing: that card's data wins.
   */
  payload: fudabaCardClaimPayloadSchema.optional(),
  message: ownerCardTextSchema(1000),
}).strict()

/** A supplement waiting for review, exactly as the wall submitted it. */
export const adminCardSupplementSchema = z
  .object({
    id: z.string().min(1),
    cardId: ownerCardIdSchema,
    state: claimStateSchema,
    payload: fudabaCardSupplementPayloadSchema,
    submitter: z
      .object({
        id: z.string().min(1),
        displayName: z.string().min(1),
      })
      .strict(),
    reviewNote: z.string(),
    revision: revisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
  })
  .strict()

/** A wall card waiting for a supplement review, as the queue row shows it. */
const supplementCardSchema = z
  .object({
    id: ownerCardIdSchema,
    cardNumber: z.number().int().positive(),
    producerName: z.string().nullable(),
    /** 统一布局的页面（后台作用域）。 */
    pages: z.array(cardPageSchema).optional(),
    pageCount: z.number().int().positive(),
  })
  .strict()

export const fudabaCardSupplementRequestSchema = fudabaCardSupplementPayloadSchema

export const supplementMutationSchema = successEnvelope({
  supplement: adminCardSupplementSchema,
}).strict()

export const supplementListSchema = exactJsonResponse({
  items: z.array(adminCardSupplementSchema),
})

/**
 * The review queue lists three kinds of work under one filter. A claim carries
 * its own legacy card, a supplement the wall card it wants to correct, and a
 * submission the registered card the owner staged.
 */
export const reviewQueueRowSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("submission"),
      submittedAt: timestampSchema,
      review: fudabaRegisteredCardReviewSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("claim"),
      submittedAt: timestampSchema,
      claim: fudabaAdminCardClaimSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("supplement"),
      submittedAt: timestampSchema,
      card: supplementCardSchema,
      supplement: adminCardSupplementSchema,
    })
    .strict(),
])

export const reviewQueueTypeSchema = z.enum([
  "submission",
  "claim",
  "supplement",
  /** Both ownerless-card review kinds, for the claim tab's default view. */
  "all",
])

export const reviewQueueListSchema = successEnvelope({
  data: z.array(reviewQueueRowSchema),
  pageInfo: numberedPageInfoSchema,
}).strict()

export const adminCardClaimDetailSchema = successEnvelope({
  claim: fudabaAdminCardClaimSchema,
  live: namecardDiffSideSchema,
}).strict()

/**
 * Supplements only touch identity, series and idols, so the review compare
 * panel reads exactly those four fields off the wall card.
 */
export const supplementLiveSchema = z
  .object({
    producerName: z.string().nullable(),
    groupName: z.string().nullable(),
    seriesCodes: z.array(z.string().min(1)),
    favoriteCharacters: z.array(
      z
        .object({
          id: z.number().int().positive(),
          name: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()

export const adminCardSupplementDetailSchema = successEnvelope({
  supplement: adminCardSupplementSchema,
  live: supplementLiveSchema,
}).strict()

export const adminCardSupplementParamsSchema = strictRequestObject({
  supplementId: z.unknown(),
})
export const fudabaCardSupplementSubmitParamsSchema = strictRequestObject({
  cardId: z.unknown(),
})
export const reviewQueueQuerySchema = strictRequestObject({
  type: z.unknown().optional(),
  query: z.unknown().optional(),
  page: z.unknown().optional(),
  pageSize: z.unknown().optional(),
})
export const fudabaCardReviewRequestSchema = strictRequestObject({
  /** `flag` marks the submission as a violation instead of a plain rejection. */
  decision: z.enum(["approve", "reject", "flag"]),
  expectedRevision: fudabaRevisionSchema,
  note: ownerCardTextSchema(1000),
})
export const fudabaSupplementReviewRequestSchema = strictRequestObject({
  decision: z.enum(["approve", "reject"]),
  expectedRevision: fudabaRevisionSchema,
  note: ownerCardTextSchema(1000),
})
export const fudabaLegacyCardClaimParamsSchema = strictRequestObject({
  legacyCardId: z.unknown(),
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
  exactJsonError({ success: z.literal(false), code: z.string(), supplementId: z.string(), state: claimStateSchema }),
  exactJsonError({ success: z.literal(false), code: z.string(), revision: revisionSchema, state: claimStateSchema }),
  exactJsonError({ success: z.literal(false), code: z.string(), message: z.string() }),
])
export const fudabaAdminCardClaimHttpErrorSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  fudabaCardClaimErrorSchema,
])

export type FudabaCardClaim = z.infer<typeof fudabaCardClaimSchema>
export type FudabaOwnerClaimListResponse = z.infer<typeof ownerClaimListSchema>
export type FudabaClaimMutationResponse = z.infer<typeof claimMutationSchema>
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
export type FudabaCardClaimPayload = z.infer<typeof fudabaCardClaimPayloadSchema>
export type FudabaCardSupplementPayload = z.infer<
  typeof fudabaCardSupplementPayloadSchema
>
export type FudabaCardSupplementRequestInput = z.input<
  typeof fudabaCardSupplementRequestSchema
>
export type AdminCardSupplement = z.infer<typeof adminCardSupplementSchema>
export type SupplementMutationResponse = z.infer<typeof supplementMutationSchema>
export type SupplementListResponse = z.infer<typeof supplementListSchema>
export type FudabaCardClaimRequestInput = z.input<
  typeof fudabaLegacyCardClaimRequestSchema
>
export type ReviewQueueRow = z.infer<typeof reviewQueueRowSchema>
export type ReviewQueueType = z.infer<typeof reviewQueueTypeSchema>
export type ReviewQueueListResponse = z.infer<typeof reviewQueueListSchema>
export type AdminCardClaimDetailResponse = z.infer<
  typeof adminCardClaimDetailSchema
>
export type AdminCardSupplementDetailResponse = z.infer<
  typeof adminCardSupplementDetailSchema
>

/**
 * Every row the inbox can hold. The API derives its own union from this list,
 * so a new kind cannot reach the database without the reader accepting it.
 */
export const NAMECARD_NOTIFICATION_KINDS = [
  "card-approved",
  "card-rejected",
  "card-locked",
  "card-unlocked",
  // The management window tells the owner about its own edits and transfers.
  "card-admin-edited",
  "card-transferred-in",
  "card-transferred-out",
  // Report outcomes go back to whoever filed them.
  "card-feedback-accepted",
  "card-feedback-rejected",
  "claim-approved",
  "claim-rejected",
  // Wall corrections made by other visitors report back to the submitter.
  "card-supplement-approved",
  "card-supplement-rejected",
  // An ownerless card whose producer name matches an account invites that
  // account to claim it.
  "legacy-card-match",
  // 手动交换：待确认与两种结果各通知一次。
  "card-exchange-requested",
  "card-exchange-accepted",
  "card-exchange-declined",
  // Backoffice station messages share this inbox; they carry no card number.
  "station-message",
] as const

export const namecardNotificationKindSchema = z.enum(NAMECARD_NOTIFICATION_KINDS)

export type NamecardNotificationKind = z.infer<
  typeof namecardNotificationKindSchema
>

export const namecardNotificationSchema = z
  .object({
    id: z.string().min(1),
    kind: namecardNotificationKindSchema,
    cardNumber: z.number().int().positive().nullable(),
    title: z.string().min(1),
    body: z.string().max(4000),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict()

export const namecardNotificationListResponseSchema = z
  .object({
    items: z.array(namecardNotificationSchema),
    unread: z.number().int().nonnegative(),
  })
  .strict()

export const namecardNotificationReadRequestSchema = strictRequestObject({
  ids: z.array(z.string().min(1)).max(200).optional(),
})

export const namecardNotificationReadResponseSchema = successEnvelope({
  updated: z.number().int().nonnegative(),
})

export type NamecardNotification = z.infer<typeof namecardNotificationSchema>
export type NamecardNotificationListResponse = z.infer<
  typeof namecardNotificationListResponseSchema
>
export type NamecardNotificationReadResponse = z.infer<
  typeof namecardNotificationReadResponseSchema
>
export type FudabaCardClaimPayloadInput = z.input<
  typeof fudabaCardClaimPayloadSchema
>
export type FudabaCardSupplementPayloadInput = z.input<
  typeof fudabaCardSupplementPayloadSchema
>
export type FudabaLegacyCardClaimRequestInput = z.input<
  typeof fudabaLegacyCardClaimRequestSchema
>
export type FudabaAdminCardClaimHttpError = z.infer<
  typeof fudabaAdminCardClaimHttpErrorSchema
>
