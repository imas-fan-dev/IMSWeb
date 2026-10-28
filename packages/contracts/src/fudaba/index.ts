import { z } from "zod";
import {
  cursorPageInfoSchema,
  exactJsonError,
  exactJsonResponse,
  hasAsciiControl,
  legacyStripRequestObject,
  strictRequestObject,
  successEnvelope,
  successFlagSchema,
} from "../common.js";

import { NAMECARD_FAVORITE_CHARACTER_LIMIT } from "./characters.js";
import {
  NAMECARD_CREDIT_LIMIT,
  NAMECARD_CREDIT_ROLES,
  NAMECARD_CREDIT_ROLE_LIMIT,
  NAMECARD_MIDDLE_IMAGE_LIMIT,
  NAMECARD_PRODUCTION_YEAR_MAX,
  NAMECARD_PRODUCTION_YEAR_MIN,
  NAMECARD_SERIES_LIMIT,
} from "./namecard-runtime.js";
import { NAMECARD_REACTION_EMOJIS } from "./reactions-runtime.js";

import { wikiImageTransformSchema } from "../wiki.js";

export {
  fudabaMapConfigSchema,
  fudabaRegionalProviderMapConfigSchema,
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapSourceActivationSchema,
  fudabaMapSourceDeleteSchema,
  fudabaMapSourceIdSchema,
  fudabaMapSourceNameSchema,
  fudabaMapSourceSchema,
  fudabaMapSourceWriteSchema,
  fudabaMapStyleUrlSchema,
  fudabaMapProviderConfigSchema,
  fudabaMapRoutingSchema,
  fudabaMapSearchConfigSchema,
} from "./map-delivery.js";
export { NAMECARD_REACTION_EMOJIS } from "./reactions-runtime.js";
export { NAMECARD_FAVORITE_CHARACTER_LIMIT } from "./characters.js";
export { isFudabaMapStyleUrl } from "./runtime.js";
export type {
  FudabaMapConfig,
  FudabaRegionalProviderMapConfig,
  FudabaMapDeliveryMutation,
  FudabaMapDeliverySnapshot,
  FudabaMapSource,
  FudabaMapSourceActivation,
  FudabaMapSourceDelete,
  FudabaMapSourceWrite,
  FudabaMapProviderConfig,
  FudabaMapRouting,
  FudabaMapSearchConfig,
} from "./map-delivery.js";
export { hasAsciiControl };

export const seriesCodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Ordered series of a card: the first entry is what the legacy column keeps. */
export const namecardSeriesCodesSchema = z
  .array(seriesCodeSchema.max(64))
  .min(1)
  .max(NAMECARD_SERIES_LIMIT)
  .refine((codes) => new Set(codes).size === codes.length, "企划不能重复");
export const accentSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const publicMediaUrlSchema = z.string().min(1);
export const timestampSchema = z.string().datetime({ offset: true });
export const fudabaRevisionSchema = z.number().int().safe().nonnegative();
export const wallCoordinateSchema = z.number().finite().min(0).max(100);
export const wallRotationSchema = z.number().finite().min(-12).max(12);
export const wallZIndexSchema = z.number().int().min(1).max(999);
export const exactCoordinateSchema = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum);
export const regionalCoordinateSchema = (minimum: number, maximum: number) =>
  z
    .number()
    .finite()
    .min(minimum)
    .max(maximum)
    .refine(
      (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8,
      "regional coordinates must use the 0.1 degree grid",
    );

export const fudabaSeriesSchema = z
  .object({
    id: z.number().int().positive(),
    code: seriesCodeSchema,
    displayName: z.string().min(1),
    color: accentSchema,
    iconUrl: publicMediaUrlSchema.nullable(),
    imageTransform: wikiImageTransformSchema,
    displayOrder: z.number().int().nonnegative(),
    activeOfficeCount: z.number().int().nonnegative(),
  })
  .strict();

export const fudabaSeriesListSchema = z
  .object({
    items: z.array(fudabaSeriesSchema),
  })
  .strict();

export const fudabaPublicOfficeLocationSchema = z.object({
  latitude: exactCoordinateSchema(-90, 90),
  longitude: exactCoordinateSchema(-180, 180),
  precision: z.literal("exact"),
}).strict();

const publicOfficeLocationSchema = fudabaPublicOfficeLocationSchema;

export const fudabaOfficeSchema = exactJsonResponse({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  intro: z.string(),
  city: z.string().min(1),
  address: z.string().min(1),
  accent: accentSchema,
  coverUrl: publicMediaUrlSchema.nullable(),
  isOpen: z.boolean(),
  visitorCount: z.number().int().nonnegative(),
  seriesCodes: z.array(seriesCodeSchema),
  location: publicOfficeLocationSchema.nullable().optional(),
});

export const fudabaCharacterSelectionSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    seriesCode: seriesCodeSchema,
  })
  .strict();

export const fudabaCardInteractionsSchema = z
  .object({
    likes: z.number().int().nonnegative(),
    favorites: z.number().int().nonnegative(),
    viewerLiked: z.boolean(),
    viewerFavorited: z.boolean(),
  })
  .strict();

export const fudabaCardInteractionKindSchema = z.enum(["like", "favorite"]);

export const namecardReactionEmojiSchema = z.enum(NAMECARD_REACTION_EMOJIS);

export const fudabaCardReactionSchema = z
  .object({
    emoji: namecardReactionEmojiSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export const ownerCardIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      !hasAsciiControl(value) && !value.includes("/") && !value.includes("\\"),
  );

export const ownerCardTextSchema = (maximum: number, required = false) =>
  z
    .string()
    .min(required ? 1 : 0)
    .max(maximum)
    .refine((value) => !hasAsciiControl(value));

export const ownerOfficeTextSchema = (maximum: number, required = false) =>
  z
    .string()
    .min(required ? 1 : 0)
    .max(maximum)
    .refine((value) => !hasAsciiControl(value));

const ownerCardRequestTextSchema = (maximum: number, required = false) =>
  z.string().transform((value) => value.trim()).pipe(ownerCardTextSchema(maximum, required));
const ownerOfficeRequestTextSchema = (maximum: number, required = false) =>
  z.string().transform((value) => value.trim()).pipe(ownerOfficeTextSchema(maximum, required));
export const ownerOfficeSeriesCodesSchema = z
  .array(seriesCodeSchema.max(40))
  .max(8)
  .refine((codes) => new Set(codes).size === codes.length);

/** 交换模式：自动允许、手动允许、不可交换。 */
export const namecardExchangeModeSchema = z.enum(["auto", "manual", "none"]);

export const namecardCreditRoleSchema = z.enum(NAMECARD_CREDIT_ROLES);

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; precision is whatever the owner filled in. */
export const namecardProductionDateSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= NAMECARD_PRODUCTION_YEAR_MIN && year <= NAMECARD_PRODUCTION_YEAR_MAX;
  }, { message: "制作日期超出可接受范围" });

/** A designer or illustrator credited for the artwork. */
export const namecardCreditSchema = z
  .object({
    /** Site member the credit points at, when it points at one. */
    accountId: z.string().min(1).nullable(),
    displayName: ownerCardTextSchema(80, true),
    /** Public profile elsewhere; optional for members, optional in general. */
    url: z.string().url().max(300).nullable(),
    roles: z
      .array(namecardCreditRoleSchema)
      .min(1)
      .max(NAMECARD_CREDIT_ROLE_LIMIT)
      .refine((roles) => new Set(roles).size === roles.length),
  })
  .strict();

export type NamecardCredit = z.infer<typeof namecardCreditSchema>;

/**
 * Sort key for 制作人名: kana and Latin letters only, as the name is read.
 * Apostrophes and hyphens may split the syllables; sorting strips them.
 */
export const namecardProducerReadingSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[ぁ-ゖァ-ヺーA-Za-z '-]+$/,
    "制作人名读法只能使用日文假名、英文字母、撇号与连字符"
  );

export const fudabaCardSchema = exactJsonResponse({
  id: z.string().min(1),
  producerName: z.string().min(1),
  seriesCodes: namecardSeriesCodesSchema,
  favoriteCharacters: z
    .array(fudabaCharacterSelectionSchema)
    .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
  frontImageUrl: publicMediaUrlSchema,
  middleImageUrls: z
    .array(publicMediaUrlSchema)
    .max(NAMECARD_MIDDLE_IMAGE_LIMIT),
  /** Single-sided cards are allowed, so this can be absent. */
  backImageUrl: publicMediaUrlSchema.nullable(),
  /** Derived from the artwork, never submitted. */
  accent: accentSchema,
  bio: z.string(),
  tradeNote: z.string(),
  exchangeMode: namecardExchangeModeSchema,
  madeOn: namecardProductionDateSchema.nullable(),
  groupName: z.string().max(80).nullable(),
  producerReading: z.string().max(80).nullable(),
  isOriginal: z.boolean(),
  madeWithAi: z.boolean(),
  visible: z.boolean(),
  credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
  createdAt: timestampSchema,
  interactions: fudabaCardInteractionsSchema,
});

export const fudabaCardPlacementSchema = z
  .object({
    pinnedAt: timestampSchema,
    x: wallCoordinateSchema,
    y: wallCoordinateSchema,
    rotation: wallRotationSchema,
    zIndex: wallZIndexSchema,
    revision: fudabaRevisionSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const fudabaPlacedCardSchema = fudabaCardSchema.extend({
  viewerOwned: z.boolean(),
  placement: fudabaCardPlacementSchema,
}).strict();

export const fudabaPageInfoSchema = cursorPageInfoSchema.superRefine(
  (value, context) => {
    if (value.hasNextPage !== Boolean(value.nextCursor)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fudaba pagination state is inconsistent",
      });
    }
  },
);

export const fudabaOfficePageSchema = exactJsonResponse({
  items: z.array(fudabaOfficeSchema),
  pageInfo: fudabaPageInfoSchema,
});

export const fudabaCardPageSchema = exactJsonResponse({
  items: z.array(fudabaCardSchema),
  pageInfo: fudabaPageInfoSchema,
});

export const fudabaOfficeDetailSchema = exactJsonResponse({
  office: fudabaOfficeSchema.extend({
    cards: z.array(fudabaPlacedCardSchema),
  }).strict(),
});

export const fudabaMapOfficeSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    city: z.string().min(1),
    address: z.string().min(1),
    accent: accentSchema,
    isOpen: z.boolean(),
    seriesCodes: z.array(seriesCodeSchema),
    location: publicOfficeLocationSchema,
  })
  .strict();

export const fudabaMapOfficeListSchema = z
  .object({
    items: z.array(fudabaMapOfficeSchema),
    truncated: z.boolean(),
  })
  .strict();

export const fudabaPlaceSearchResultSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    address: z.string().min(1),
    city: z.string().min(1),
    location: z
      .object({
        latitude: exactCoordinateSchema(-90, 90),
        longitude: exactCoordinateSchema(-180, 180),
        precision: z.literal("exact"),
      })
      .strict(),
  })
  .strict();

export const fudabaPlaceSearchResponseSchema = successEnvelope({
  items: z.array(fudabaPlaceSearchResultSchema).max(5),
  attribution: z.string().min(1),
}).strict();

// Missing city/address text stays empty for the owner to complete before saving.
export const fudabaPlaceReverseResultSchema = fudabaPlaceSearchResultSchema.extend({
  city: z.string(),
  address: z.string(),
}).strict();
export const fudabaPlaceReverseResponseSchema = exactJsonResponse({
  place: fudabaPlaceReverseResultSchema.nullable(),
  attribution: exactJsonResponse({
    text: z.string().min(1),
    url: z.string().url(),
  }).nullable(),
});

/** The copy a submitter is asking to replace the published card with. */
export const fudabaPendingCardContentSchema = z
  .object({
    producerName: ownerCardTextSchema(80, true),
    seriesCodes: namecardSeriesCodesSchema,
    /** Character ids; the editor already holds the catalogue to name them. */
    favoriteCharacterIds: z.array(z.number().int().positive()),
    frontImageUrl: publicMediaUrlSchema,
    middleImageUrls: z
      .array(publicMediaUrlSchema)
      .max(NAMECARD_MIDDLE_IMAGE_LIMIT),
    backImageUrl: publicMediaUrlSchema.nullable(),
    bio: ownerCardTextSchema(2000),
    tradeNote: ownerCardTextSchema(1000),
    exchangeMode: namecardExchangeModeSchema,
    madeOn: namecardProductionDateSchema.nullable(),
    groupName: z.string().max(80).nullable(),
    producerReading: z.string().max(80).nullable(),
    isOriginal: z.boolean(),
    madeWithAi: z.boolean(),
    visible: z.boolean(),
    credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
  })
  .strict();

export const fudabaOwnerCardSchema = z
  .object({
    id: ownerCardIdSchema,
    /** Public number shown as 名片 #编号. */
    cardNumber: z.number().int().positive(),
    producerName: ownerCardTextSchema(80, true),
    seriesCodes: namecardSeriesCodesSchema,
    favoriteCharacters: z
      .array(fudabaCharacterSelectionSchema)
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
    frontImageUrl: publicMediaUrlSchema,
    middleImageUrls: z
      .array(publicMediaUrlSchema)
      .max(NAMECARD_MIDDLE_IMAGE_LIMIT),
    /** Single-sided cards leave this null. */
    backImageUrl: publicMediaUrlSchema.nullable(),
    /** Derived from the artwork; the editor only displays it. */
    accent: accentSchema,
    bio: ownerCardTextSchema(2000),
    tradeNote: ownerCardTextSchema(1000),
    exchangeMode: namecardExchangeModeSchema,
    madeOn: namecardProductionDateSchema.nullable(),
    groupName: z.string().max(80).nullable(),
    producerReading: z.string().max(80).nullable(),
    isOriginal: z.boolean(),
    madeWithAi: z.boolean(),
    visible: z.boolean(),
    credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
    publicationStatus: z.enum([
      "draft",
      "pending",
      "approving",
      "published",
      "hidden",
      "rejected",
      "withdrawn",
      "locked",
    ]),
    revision: fudabaRevisionSchema,
    /**
     * Verdict on the newest submission of an already published card. While this
     * is set the published version keeps serving the wall and exchange.
     */
    reviewStatus: z.enum(["pending", "rejected", "locked"]).nullable(),
    reviewReason: z.string().nullable(),
    reviewSubmittedAt: timestampSchema.nullable(),
    pendingContent: fudabaPendingCardContentSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const fudabaOwnerCardListSchema = z
  .object({
    items: z.array(fudabaOwnerCardSchema),
  })
  .strict();

export const fudabaOwnerCardDetailSchema = z
  .object({
    card: fudabaOwnerCardSchema,
  })
  .strict();

export const fudabaCardMutationResponseSchema = successEnvelope({
  card: fudabaOwnerCardSchema,
}).strict();

export const fudabaCardDeleteResponseSchema = successEnvelope({
  revision: fudabaRevisionSchema,
}).strict();

export const fudabaCardInteractionResponseSchema = successEnvelope({
  cardId: z.string().min(1),
  interactions: fudabaCardInteractionsSchema,
}).strict();

export const fudabaCardReactionsResponseSchema = successEnvelope({
  cardId: z.string().min(1),
  reactions: z.array(fudabaCardReactionSchema).max(64),
}).strict();

export const fudabaOwnerOfficeSchema = z
  .object({
    id: ownerCardIdSchema,
    slug: z.string().min(1),
    name: ownerOfficeTextSchema(80, true),
    intro: ownerOfficeTextSchema(2000),
    city: ownerOfficeTextSchema(100, true),
    address: ownerOfficeTextSchema(240, true),
    location: z
      .object({
        latitude: exactCoordinateSchema(-90, 90),
        longitude: exactCoordinateSchema(-180, 180),
        precision: z.literal("exact"),
      })
      .strict(),
    accent: accentSchema,
    coverUrl: publicMediaUrlSchema.nullable(),
    pendingCoverUrl: publicMediaUrlSchema.nullable(),
    pendingCoverSubmittedAt: timestampSchema.nullable(),
    isOpen: z.boolean(),
    visitorCount: z.number().int().nonnegative(),
    status: z.enum(["active", "hidden", "archived"]),
    reviewState: z.enum(["pending", "published", "rejected"]),
    submittedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
    reviewedBy: z.number().int().positive().nullable(),
    reviewNote: z.string().max(1000),
    reviewInProgress: z.boolean(),
    revision: fudabaRevisionSchema,
    seriesCodes: ownerOfficeSeriesCodesSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    archivedAt: timestampSchema.nullable(),
  })
  .strict();

export const fudabaOwnerOfficeListSchema = z
  .object({ items: z.array(fudabaOwnerOfficeSchema) })
  .strict();

export const fudabaOwnerOfficeDetailSchema = z
  .object({ office: fudabaOwnerOfficeSchema })
  .strict();

export const fudabaOfficeMutationResponseSchema = successEnvelope({
  office: fudabaOwnerOfficeSchema,
}).strict();
export const fudabaOfficeConflictResponseSchema = exactJsonResponse({
  success: z.literal(false),
  code: z.literal("FUDABA_OFFICE_STATE_CONFLICT"),
  revision: fudabaRevisionSchema,
  officeStatus: z.enum(["active", "hidden", "archived"]),
});

export const fudabaOwnerLocationSchema = z
  .object({
    officeId: ownerCardIdSchema,
    location: fudabaPublicOfficeLocationSchema,
    exactLocationConsentAt: timestampSchema.nullable(),
    reviewState: z.enum(["pending", "published", "rejected"]),
    revision: fudabaRevisionSchema,
    submittedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
    reviewNote: z.string().max(1000),
  })
  .strict();

export const fudabaOwnerLocationDetailSchema = z
  .object({ location: fudabaOwnerLocationSchema.nullable() })
  .strict();

export const fudabaOwnerLocationMutationResponseSchema = successEnvelope({
  officeLocation: fudabaOwnerLocationSchema,
}).strict();

export const fudabaOwnerLocationWithdrawalResponseSchema =
  successFlagSchema.strict();

export const fudabaCardPlacementSaveResponseSchema = successEnvelope({
  placement: fudabaCardPlacementSchema,
}).strict();

export const fudabaCardPlacementDeleteResponseSchema = successEnvelope({
  revision: fudabaRevisionSchema,
}).strict();

// Request carriers retain their recorded policy. Directory queries reject
// unknown keys while media queries retain their historic projected behavior.
const queryValueSchema = z.union([z.string(), z.array(z.string())]);
export const fudabaEmptyQuerySchema = strictRequestObject({});
// Legacy owner and moderation reads historically ignore query keys.
export const fudabaIgnoredQuerySchema = legacyStripRequestObject({});
export const fudabaOfficeQuerySchema = strictRequestObject({
  q: queryValueSchema.optional(),
  city: queryValueSchema.optional(),
  series: queryValueSchema.optional(),
  open: queryValueSchema.optional(),
  limit: queryValueSchema.optional(),
  cursor: queryValueSchema.optional(),
});
export const fudabaCardQuerySchema = strictRequestObject({
  series: queryValueSchema.optional(),
  available: queryValueSchema.optional(),
  office: queryValueSchema.optional(),
  limit: queryValueSchema.optional(),
  cursor: queryValueSchema.optional(),
});
export const fudabaMapQuerySchema = strictRequestObject({
  bbox: queryValueSchema.optional(),
  city: queryValueSchema.optional(),
  series: queryValueSchema.optional(),
  open: queryValueSchema.optional(),
  limit: queryValueSchema.optional(),
});
export const fudabaOfficeSlugParamsSchema = strictRequestObject({ officeSlug: z.unknown() });
export const fudabaCardIdParamsSchema = strictRequestObject({ cardId: z.unknown() });
export const fudabaOfficeIdParamsSchema = strictRequestObject({ officeId: z.unknown() });
export const fudabaCardOfficePlacementParamsSchema = strictRequestObject({
  officeId: z.unknown(),
  cardId: z.unknown(),
});
export const fudabaCardMediaParamsSchema = strictRequestObject({
  cardId: z.unknown(),
  side: z.unknown(),
});
// JSON mutations reject unknown keys.
export const fudabaCardFieldsRequestSchema = z.object({
  producerName: ownerCardRequestTextSchema(80, true),
  seriesCodes: namecardSeriesCodesSchema,
  favoriteCharacterIds: z
    .array(z.number().int().positive())
    .max(NAMECARD_FAVORITE_CHARACTER_LIMIT)
    .refine((ids) => new Set(ids).size === ids.length),
  bio: ownerCardRequestTextSchema(2000),
  tradeNote: ownerCardRequestTextSchema(1000),
  exchangeMode: namecardExchangeModeSchema,
  madeOn: namecardProductionDateSchema.nullable(),
  groupName: z.string().max(80).nullable(),
  producerReading: namecardProducerReadingSchema.nullable(),
  isOriginal: z.boolean(),
  madeWithAi: z.boolean(),
  visible: z.boolean(),
  credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
}).strict();
export const fudabaCardUpdateRequestSchema = fudabaCardFieldsRequestSchema.extend({
  expectedRevision: fudabaRevisionSchema,
}).strict();
export const fudabaRevisionRequestSchema = z.object({
  expectedRevision: fudabaRevisionSchema,
}).strict();
export const fudabaPlacementRevisionSchema = z.number().int().min(0).max(2_147_483_647);
export const fudabaCardPlacementSaveRequestSchema = z.object({
  x: wallCoordinateSchema,
  y: wallCoordinateSchema,
  rotation: wallRotationSchema,
  zIndex: wallZIndexSchema,
  expectedRevision: fudabaPlacementRevisionSchema.nullable(),
}).strict();
export const fudabaCardPlacementDeleteRequestSchema = z.object({
  expectedRevision: fudabaPlacementRevisionSchema,
}).strict();
export const fudabaOfficeFieldsRequestSchema = z.object({
  name: ownerOfficeRequestTextSchema(80, true),
  intro: ownerOfficeRequestTextSchema(2000),
  city: ownerOfficeRequestTextSchema(100, true),
  address: ownerOfficeRequestTextSchema(240, true),
  latitude: exactCoordinateSchema(-90, 90),
  longitude: exactCoordinateSchema(-180, 180),
  accent: accentSchema,
  isOpen: z.boolean(),
  seriesCodes: ownerOfficeSeriesCodesSchema,
}).strict();
export const fudabaOfficeUpdateRequestSchema = fudabaOfficeFieldsRequestSchema.extend({
  expectedRevision: fudabaRevisionSchema,
}).strict();
export const fudabaOwnerLocationSaveRequestSchema = z.union([z.object({
  latitude: exactCoordinateSchema(-60, 60),
  longitude: exactCoordinateSchema(-180, 180),
  expectedRevision: fudabaRevisionSchema.nullable(),
  precision: z.literal("regional").optional(),
}).strict(), z.object({
  latitude: exactCoordinateSchema(-60, 60),
  longitude: exactCoordinateSchema(-180, 180),
  expectedRevision: fudabaRevisionSchema.nullable(),
  precision: z.literal("exact"),
  exactLocationConsent: z.literal(true),
}).strict()]);
export const fudabaReactionRequestSchema = legacyStripRequestObject({
  // The handler owns the legacy error code for an unsupported palette entry.
  emoji: z.unknown(),
});
export const fudabaMediaQuerySchema = legacyStripRequestObject({
  v: z.string().optional(),
  /** `1` serves the media of the revision still under review. */
  draft: z.enum(["1"]).optional(),
});
export const fudabaPlaceSearchQuerySchema = legacyStripRequestObject({
  q: z.string().trim().min(2).max(120).refine((value) => !hasAsciiControl(value)),
});
const reverseCoordinateQuery = (minimum: number, maximum: number) =>
  z.union([z.number(), z.string().trim().min(1)])
    .pipe(z.coerce.number().finite().min(minimum).max(maximum));
export const fudabaPlaceReverseQuerySchema = strictRequestObject({
  longitude: reverseCoordinateQuery(-180, 180),
  latitude: reverseCoordinateQuery(-90, 90),
});
export const fudabaCardReactionErrorSchema = z.union([
  exactJsonError({ success: z.literal(false), code: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string(), message: z.string() }),
]);
export const fudabaErrorResponseSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ message: z.string() }),
  exactJsonError({ success: z.literal(false), message: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string(), message: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string(), revision: fudabaRevisionSchema }),
  fudabaCardReactionErrorSchema,
]);

export type FudabaSeries = z.infer<typeof fudabaSeriesSchema>;
export type FudabaSeriesList = z.infer<typeof fudabaSeriesListSchema>;
export type FudabaCharacterSelection = z.infer<typeof fudabaCharacterSelectionSchema>;
export type FudabaOffice = z.infer<typeof fudabaOfficeSchema>;
export type FudabaCard = z.infer<typeof fudabaCardSchema>;
export type FudabaCardPlacement = z.infer<typeof fudabaCardPlacementSchema>;
export type FudabaPlacedCard = z.infer<typeof fudabaPlacedCardSchema>;
export type FudabaOfficePage = z.infer<typeof fudabaOfficePageSchema>;
export type FudabaCardPage = z.infer<typeof fudabaCardPageSchema>;
export type FudabaOfficeDetailResponse = z.infer<
  typeof fudabaOfficeDetailSchema
>;
export type FudabaOfficeDetail = FudabaOfficeDetailResponse["office"];
export type FudabaMapOffice = z.infer<typeof fudabaMapOfficeSchema>;
export type FudabaMapOfficeList = z.infer<typeof fudabaMapOfficeListSchema>;
export type FudabaPlaceSearchResult = z.infer<
  typeof fudabaPlaceSearchResultSchema
>;
export type FudabaPlaceSearchResponse = z.infer<
  typeof fudabaPlaceSearchResponseSchema
>;
export type FudabaPlaceReverseQuery = z.infer<typeof fudabaPlaceReverseQuerySchema>;
export type FudabaPlaceReverseResult = z.infer<typeof fudabaPlaceReverseResultSchema>;
export type FudabaPlaceReverseResponse = z.infer<typeof fudabaPlaceReverseResponseSchema>;
export type FudabaPendingCardContent = z.infer<
  typeof fudabaPendingCardContentSchema
>;
export type FudabaOwnerCard = z.infer<typeof fudabaOwnerCardSchema>;
export type FudabaOwnerCardList = z.infer<typeof fudabaOwnerCardListSchema>;
export type FudabaOwnerCardDetail = z.infer<typeof fudabaOwnerCardDetailSchema>;
export type FudabaCardMutationResponse = z.infer<
  typeof fudabaCardMutationResponseSchema
>;
export type FudabaCardDeleteResponse = z.infer<
  typeof fudabaCardDeleteResponseSchema
>;
export type FudabaCardInteractions = z.infer<
  typeof fudabaCardInteractionsSchema
>;
export type FudabaCardInteractionKind = z.infer<
  typeof fudabaCardInteractionKindSchema
>;
export type NamecardReactionEmoji = z.infer<typeof namecardReactionEmojiSchema>;
export type FudabaCardReaction = z.infer<typeof fudabaCardReactionSchema>;
export type FudabaCardReactionsResponse = z.infer<
  typeof fudabaCardReactionsResponseSchema
>;
export type FudabaCardInteractionResponse = z.infer<
  typeof fudabaCardInteractionResponseSchema
>;
export type FudabaOwnerOffice = z.infer<typeof fudabaOwnerOfficeSchema>;
export type FudabaOwnerOfficeList = z.infer<typeof fudabaOwnerOfficeListSchema>;
export type FudabaOwnerOfficeDetail = z.infer<
  typeof fudabaOwnerOfficeDetailSchema
>;
export type FudabaOfficeMutationResponse = z.infer<
  typeof fudabaOfficeMutationResponseSchema
>;
export type FudabaOfficeConflictResponse = z.infer<
  typeof fudabaOfficeConflictResponseSchema
>;
export type FudabaOwnerLocation = z.infer<typeof fudabaOwnerLocationSchema>;
export type FudabaOwnerLocationDetail = z.infer<
  typeof fudabaOwnerLocationDetailSchema
>;
export type FudabaOwnerLocationMutationResponse = z.infer<
  typeof fudabaOwnerLocationMutationResponseSchema
>;
export type FudabaOwnerLocationWithdrawalResponse = z.infer<
  typeof fudabaOwnerLocationWithdrawalResponseSchema
>;
export type FudabaCardPlacementSaveResponse = z.infer<
  typeof fudabaCardPlacementSaveResponseSchema
>;
export type FudabaCardPlacementDeleteResponse = z.infer<
  typeof fudabaCardPlacementDeleteResponseSchema
>;
export type FudabaCardFieldsRequest = z.infer<typeof fudabaCardFieldsRequestSchema>;
export type FudabaCardUpdateRequest = z.infer<typeof fudabaCardUpdateRequestSchema>;
export type FudabaOfficeFieldsRequest = z.infer<typeof fudabaOfficeFieldsRequestSchema>;
export type FudabaOfficeUpdateRequest = z.infer<typeof fudabaOfficeUpdateRequestSchema>;
export type FudabaOwnerLocationSaveRequest = z.infer<typeof fudabaOwnerLocationSaveRequestSchema>;
