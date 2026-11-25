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
  NAMECARD_CREDIT_ACCOUNT_ID_MAX_LENGTH,
  NAMECARD_CREDIT_LIMIT,
  NAMECARD_CREDIT_ROLES,
  NAMECARD_CREDIT_ROLE_LIMIT,
  NAMECARD_CREDIT_URL_MAX_LENGTH,
  NAMECARD_MIDDLE_IMAGE_LIMIT,
  NAMECARD_PRODUCTION_YEAR_MAX,
  NAMECARD_PRODUCTION_YEAR_MIN,
  NAMECARD_SERIES_LIMIT,
} from "./namecard-runtime.js";
import { NAMECARD_REACTION_EMOJIS } from "./reactions-runtime.js";
import {
  namecardTagListSchema,
  namecardTagNamesSchema,
} from "../namecard-tags.js";

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
    viewerLiked: z.boolean(),
  })
  .strict();

export const fudabaCardInteractionKindSchema = z.enum(["like"]);

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

export const ownerCardRequestTextSchema = (maximum: number, required = false) =>
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

/**
 * One credited person. Submission and read share the row; only the URL is split,
 * because rows written before the strict (http/https) parser existed are still
 * out there and must keep reading back.
 */
const namecardCreditRowFields = (url: z.ZodType<string | null>) => ({
  /** Site member the credit points at, when it points at one. */
  accountId: z
    .string()
    .trim()
    .min(1)
    .max(NAMECARD_CREDIT_ACCOUNT_ID_MAX_LENGTH)
    .nullable(),
  /** 署名先修剪再判长度与内容；回读的值本来就已经修剪过。 */
  displayName: ownerCardRequestTextSchema(80, true),
  url,
  roles: z
    .array(namecardCreditRoleSchema)
    .min(1)
    .max(NAMECARD_CREDIT_ROLE_LIMIT)
    .refine((roles) => new Set(roles).size === roles.length),
});

/**
 * 回读侧（墙上详情、属主视图、评审 diff）：URL 沿用历史上的宽松形态——只要是
 * 绝对地址就行。写路径一直只收 http(s)，但旧契约更宽，收紧会把已写进库的链接
 * 变成读不出来的卡。
 */
export const namecardCreditSchema = z
  .object(
    namecardCreditRowFields(
      z.string().url().max(NAMECARD_CREDIT_URL_MAX_LENGTH).nullable(),
    ),
  )
  .strict();

/** 提交侧：只有 http(s) 链接真的存得下来，所以只接受 http(s)。 */
const namecardCreditRequestSchema = z
  .object(
    namecardCreditRowFields(
      z
        .string()
        .trim()
        .max(NAMECARD_CREDIT_URL_MAX_LENGTH)
        .regex(/^https?:\/\/[^\s]+$/)
        .refine((value) => !hasAsciiControl(value))
        .nullable(),
    ),
  )
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

/** 统一布局下的一页：身份、角色、顺序与可直接渲染的地址。 */
export const cardPageSchema = z
  .object({
    pageId: z.string().min(1),
    role: z.enum(["front", "back", "middle"]),
    order: z.number().int().positive(),
    /** 原图地址：全屏预览用，不做二次压缩。 */
    url: z.string().min(1),
    /** 画廊用（800 档）。 */
    previewUrl: z.string().min(1),
    /** 列表瓦片用（400 档）。 */
    thumbUrl: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export type CardPage = z.infer<typeof cardPageSchema>

/**
 * 卡片内容字段的公共块。名片本体、待审副本、所有者视图、提交请求、公开详情、
 * 评审 diff 与名片册快照都声明同一批字段，这里按「所有者侧 / 只读侧」收敛成两
 * 处，各 schema 用 `...` / `.extend()` 组合，再用 `.omit()` 与显式重声明表达子集
 * 和约束差异。每个字段的约束都与收敛前逐字一致。
 */

/** 所有者侧内容字段：编辑器、待审副本与提交请求共用。 */
export const cardContentFields = {
  producerName: ownerCardTextSchema(80, true),
  seriesCodes: namecardSeriesCodesSchema,
  bio: ownerCardTextSchema(2000),
  tradeNote: ownerCardTextSchema(1000),
  exchangeMode: namecardExchangeModeSchema,
  madeOn: namecardProductionDateSchema.nullable(),
  groupName: z.string().max(80).nullable(),
  /** 团体名片：制作人名称由团体名称派生，交换模式固定为自动。 */
  isGroupCard: z.boolean(),
  producerReading: z.string().max(80).nullable(),
  isOriginal: z.boolean(),
  madeWithAi: z.boolean(),
  visible: z.boolean(),
  credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
};

export const cardContentFieldsSchema = z.object(cardContentFields);

/**
 * 只读侧内容字段：公开墙详情与评审 diff 逐字相同，名片册快照复用其子集。
 * 这一侧沿用「空串即 null」的历史形态，故与所有者侧不是同一批约束。
 */
export const readonlyCardContentFields = {
  producerName: z.string().nullable(),
  /** Sorting aid only, rendered in parentheses after the producer name. */
  producerReading: z.string().min(1).max(80).nullable(),
  groupName: z.string().min(1).nullable(),
  /** 团体名片：制作人名称由团体名称派生，交换模式固定为自动。 */
  isGroupCard: z.boolean().optional(),
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`; empty parts are dropped. */
  madeOn: z.string().min(1).nullable(),
  bio: z.string().min(1).nullable(),
  tradeNote: z.string().min(1).nullable(),
  isOriginal: z.boolean(),
  madeWithAi: z.boolean(),
  exchangeMode: z.enum(["auto", "manual", "none"]),
  credits: z.array(namecardCreditSchema).max(NAMECARD_CREDIT_LIMIT),
};

export const readonlyCardContentFieldsSchema = z.object(
  readonlyCardContentFields,
);

export const fudabaCardSchema = cardContentFieldsSchema
  .omit({ isGroupCard: true })
  .extend({
    id: z.string().min(1),
    /** 墙上的名片与编辑器不同：内容字段由只读形态承担。 */
    producerName: z.string().min(1),
    favoriteCharacters: z
      .array(fudabaCharacterSelectionSchema)
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
    frontImageUrl: publicMediaUrlSchema,
    /** Single-sided cards are allowed, so this can be absent. */
    backImageUrl: publicMediaUrlSchema.nullable(),
    /** Derived from the artwork, never submitted. */
    accent: accentSchema,
    bio: z.string(),
    tradeNote: z.string(),
    createdAt: timestampSchema,
    interactions: fudabaCardInteractionsSchema,
    /** 统一布局的页面；旧字段保留一个版本。 */
    pages: z.array(cardPageSchema).optional(),
  })
  .strict();

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
export const fudabaPendingCardContentSchema = cardContentFieldsSchema
  .extend({
    /** Character ids; the editor already holds the catalogue to name them. */
    favoriteCharacterIds: z.array(z.number().int().positive()),
    frontImageUrl: publicMediaUrlSchema,
    backImageUrl: publicMediaUrlSchema.nullable(),
  })
  .strict();

export const fudabaOwnerCardSchema = cardContentFieldsSchema
  .extend({
    id: ownerCardIdSchema,
    /** 线上页面。 */
    pages: z.array(cardPageSchema).optional(),
    /** 待审页面（存在暂存图时）。 */
    pendingPages: z.array(cardPageSchema).optional(),
    /** Public number shown as 名片 #编号. */
    cardNumber: z.number().int().positive(),
    favoriteCharacters: z
      .array(fudabaCharacterSelectionSchema)
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT),
    frontImageUrl: publicMediaUrlSchema,
    /** Single-sided cards leave this null. */
    backImageUrl: publicMediaUrlSchema.nullable(),
    /** Derived from the artwork; the editor only displays it. */
    accent: accentSchema,
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
    /** 已保存标签：即时生效，不随待审内容变化。 */
    tags: namecardTagListSchema.optional(),
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

export const fudabaGuestSubmissionSettingsResponseSchema = successEnvelope({
  enabled: z.boolean(),
}).strict();
export const fudabaGuestSubmissionResponseSchema = successEnvelope({}).strict();
export const adminFudabaGuestSubmissionSettingsRequestSchema = z.object({
  enabled: z.boolean(),
}).strict();
export type AdminFudabaGuestSubmissionSettingsRequest = z.infer<
  typeof adminFudabaGuestSubmissionSettingsRequestSchema
>;
export type FudabaGuestSubmissionSettingsResponse = z.infer<
  typeof fudabaGuestSubmissionSettingsResponseSchema
>;
export type FudabaGuestSubmissionResponse = z.infer<typeof fudabaGuestSubmissionResponseSchema>;

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
export const fudabaCardPageParamsSchema = strictRequestObject({
  cardId: z.unknown(),
  pageId: z.unknown(),
});

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
/**
 * 跨字段规则：个人名片必须有制作人名称；团体名片没有制作人名称，改由团体名称
 * 承担展示与检索。规则读两个字段，所以挂在对象上（报错路径为根），业务文案也
 * 由这一层给出——调用方只负责把它翻回客户端读惯的措辞。
 */
function checkCardFieldPair(
  value: {
    producerName: string;
    isGroupCard?: boolean | undefined;
    groupName: string | null;
  },
  context: z.RefinementCtx,
): void {
  if (value.isGroupCard) {
    if (!value.groupName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "团体名片需要填写团体名称",
      });
    }
    return;
  }
  if (!value.producerName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "producerName 长度或内容无效",
    });
  }
}

// JSON mutations reject unknown keys.
export const fudabaCardFieldsRequestSchema = cardContentFieldsSchema
  .extend({
    /** 团体名片没有制作人名称，改由团体名称承担展示与检索。 */
    producerName: ownerCardRequestTextSchema(80),
    /** 一张名片属于某个团体而不是某位制作人。 */
    isGroupCard: z.boolean().optional(),
    bio: ownerCardRequestTextSchema(2000),
    tradeNote: ownerCardRequestTextSchema(1000),
    /** 团体名称与制作人名称同样先修剪再判长度。 */
    groupName: ownerCardRequestTextSchema(80).nullable(),
    /** 提交侧的名称读法要求可排序，与只读返回的宽松形态不同。 */
    producerReading: namecardProducerReadingSchema.nullable(),
    /** 提交侧只接受真的存得下来的 credit（回读侧对旧数据更宽容）。 */
    credits: z.array(namecardCreditRequestSchema).max(NAMECARD_CREDIT_LIMIT),
    favoriteCharacterIds: z
      .array(z.number().int().positive())
      .max(NAMECARD_FAVORITE_CHARACTER_LIMIT)
      .refine((ids) => new Set(ids).size === ids.length),
    /**
     * 标签随保存一起提交，但即时生效、不进审核载荷；multipart 里是 JSON 字符串。
     */
    tags: namecardTagNamesSchema.optional(),
  })
  .strict();

/**
 * 提交侧（<form> 创建）字段规则：字段约束与 JSON 请求完全一致，另加跨字段规则。
 * 创建只送 multipart 字符串，转换层把它们还原成这里的规范形态再交给 schema。
 */
export const fudabaCardFieldsSubmissionSchema =
  fudabaCardFieldsRequestSchema.superRefine(checkCardFieldPair);

export const fudabaCardUpdateRequestSchema = fudabaCardFieldsRequestSchema
  .extend({
    expectedRevision: fudabaRevisionSchema,
  })
  .strict()
  .superRefine(checkCardFieldPair);
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
  /** 统一媒体路由的宽度档位；不传则返回原图。 */
  w: z.enum(["160", "400", "800", "1400"]).optional(),
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
/**
 * 卡片字段 schema 的一条报错。提交侧的强制转换层只读它的 `code` / `path` /
 * `message` / `type`，把首个报错翻回客户端一直在读的中文文案。
 */
export type NamecardCardFieldIssue = z.ZodIssue;
export type FudabaOfficeFieldsRequest = z.infer<typeof fudabaOfficeFieldsRequestSchema>;
export type FudabaOfficeUpdateRequest = z.infer<typeof fudabaOfficeUpdateRequestSchema>;
export type FudabaOwnerLocationSaveRequest = z.infer<typeof fudabaOwnerLocationSaveRequestSchema>;

export type FudabaErrorResponse = z.infer<typeof fudabaErrorResponseSchema>;
