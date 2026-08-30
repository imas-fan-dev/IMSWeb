import { z } from "zod";
import {
  cursorPageInfoSchema,
  hasAsciiControl,
  successEnvelope,
  successFlagSchema,
} from "../common.js";

import { isFudabaMapStyleUrl } from "./map-delivery.js";

import {
  defaultWikiImageTransform,
  wikiImageTransformSchema,
} from "../wiki.js";

export {
  fudabaMapAssetName,
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapDeliveryUpdateSchema,
  fudabaMapPrefixFromStyleUrl,
  fudabaMapPrefixSchema,
  fudabaMapStyleUrlForPrefix,
  isFudabaMapPrefix,
  isFudabaMapStyleUrl,
} from "./map-delivery.js";
export type {
  FudabaMapDeliveryMutation,
  FudabaMapDeliverySnapshot,
  FudabaMapDeliveryUpdate,
} from "./map-delivery.js";
export { hasAsciiControl };

export const seriesCodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const accentSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const publicMediaUrlSchema = z.string().trim().min(1);
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
    displayName: z.string().trim().min(1),
    color: accentSchema,
    iconUrl: publicMediaUrlSchema.nullable(),
    imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
    displayOrder: z.number().int().nonnegative(),
    activeOfficeCount: z.number().int().nonnegative(),
  })
  .strict();

export const fudabaSeriesListSchema = z
  .object({
    items: z.array(fudabaSeriesSchema),
  })
  .strict();

export const fudabaOfficeSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(1),
  intro: z.string(),
  city: z.string().trim().min(1),
  address: z.string().trim().min(1),
  accent: accentSchema,
  coverUrl: publicMediaUrlSchema.nullable(),
  isOpen: z.boolean(),
  visitorCount: z.number().int().nonnegative(),
  seriesCodes: z.array(seriesCodeSchema),
});

export const fudabaIdolSelectionSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
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

// The reaction palette is shared with the compatibility namecard pages so both
// surfaces count the same emoji.
export const NAMECARD_REACTION_EMOJIS = [
  "❤️", "👍", "😂", "🤣", "😭", "😍", "🥰", "😘", "🤯", "😱",
  "😎", "🤩", "😤", "🙏", "👏", "✨", "💯", "🎉", "💥", "🌟",
  "🐵", "🐶", "🐱", "🦊", "🐼", "🐳", "🔥", "💀", "👀", "🍀",
  "🌈", "🐛", "💎", "🚀", "🏆", "🍕", "🍔", "🎮", "🌹", "🍭",
  "🔨", "🔫", "❓", "🧒", "😙", "🔘",
] as const;

export const namecardReactionEmojiSchema = z.enum(NAMECARD_REACTION_EMOJIS);

export const fudabaCardReactionSchema = z
  .object({
    emoji: namecardReactionEmojiSchema,
    count: z.number().int().nonnegative(),
  })
  .strict();

export const fudabaCardSchema = z.object({
  id: z.string().min(1),
  producerName: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  seriesCode: seriesCodeSchema,
  favoriteIdol: z.string(),
  favoriteIdols: z.array(fudabaIdolSelectionSchema).max(20).default([]),
  frontImageUrl: publicMediaUrlSchema,
  backImageUrl: publicMediaUrlSchema,
  accent: accentSchema,
  bio: z.string(),
  tradeNote: z.string(),
  available: z.boolean(),
  source: z
    .object({
      url: z.string().url(),
      label: z.string().nullable(),
      credit: z.string().nullable(),
    })
    .nullable(),
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
});

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

export const fudabaOfficePageSchema = z.object({
  items: z.array(fudabaOfficeSchema),
  pageInfo: fudabaPageInfoSchema,
});

export const fudabaCardPageSchema = z.object({
  items: z.array(fudabaCardSchema),
  pageInfo: fudabaPageInfoSchema,
});

export const fudabaOfficeDetailSchema = z.object({
  office: fudabaOfficeSchema.extend({
    cards: z.array(fudabaPlacedCardSchema),
  }),
});

export const fudabaMapOfficeSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().trim().min(1),
    city: z.string().trim().min(1),
    address: z.string().trim().min(1),
    accent: accentSchema,
    isOpen: z.boolean(),
    seriesCodes: z.array(seriesCodeSchema),
    location: z
      .object({
        latitude: regionalCoordinateSchema(-60, 60),
        longitude: regionalCoordinateSchema(-180, 180),
        precision: z.literal("regional"),
      })
      .strict(),
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
    label: z.string().trim().min(1),
    address: z.string().trim().min(1),
    city: z.string().trim().min(1),
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
  attribution: z.string().trim().min(1),
}).strict();

export const fudabaMapConfigSchema = z
  .object({
    styleUrl: z
      .string()
      .refine(
        (value) => !hasAsciiControl(value),
        "map style URL must not contain ASCII control characters",
      )
      .transform((value) => value.trim())
      .refine(
        isFudabaMapStyleUrl,
        "map style URL must be a same-origin absolute path or an absolute " +
          "http(s) URL without credentials, query, or hash",
      ),
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
    .trim()
    .min(required ? 1 : 0)
    .max(maximum)
    .refine((value) => !hasAsciiControl(value));

export const ownerOfficeTextSchema = (maximum: number, required = false) =>
  z
    .string()
    .trim()
    .min(required ? 1 : 0)
    .max(maximum)
    .refine((value) => !hasAsciiControl(value));
export const ownerOfficeSeriesCodesSchema = z
  .array(seriesCodeSchema.max(40))
  .max(8)
  .refine((codes) => new Set(codes).size === codes.length);

export const fudabaOwnerCardSchema = z
  .object({
    id: ownerCardIdSchema,
    producerName: ownerCardTextSchema(80, true),
    displayName: ownerCardTextSchema(120, true),
    seriesCode: seriesCodeSchema.max(64),
    favoriteIdol: ownerCardTextSchema(200),
    favoriteIdols: z.array(fudabaIdolSelectionSchema).max(20).default([]),
    frontImageUrl: publicMediaUrlSchema,
    backImageUrl: publicMediaUrlSchema,
    accent: accentSchema,
    bio: ownerCardTextSchema(2000),
    tradeNote: ownerCardTextSchema(1000),
    available: z.boolean(),
    mediaRightsStatus: z.enum(["unknown", "approved", "denied"]),
    publicationStatus: z.enum([
      "draft",
      "pending",
      "approving",
      "published",
      "hidden",
      "rejected",
    ]),
    revision: fudabaRevisionSchema,
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
    slug: z.string().trim().min(1),
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

export const fudabaOwnerLocationSchema = z
  .object({
    officeId: ownerCardIdSchema,
    location: z
      .object({
        latitude: regionalCoordinateSchema(-60, 60),
        longitude: regionalCoordinateSchema(-180, 180),
        precision: z.literal("regional"),
      })
      .strict(),
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

export type FudabaSeries = z.infer<typeof fudabaSeriesSchema>;
export type FudabaSeriesList = z.infer<typeof fudabaSeriesListSchema>;
export type FudabaIdolSelection = z.infer<typeof fudabaIdolSelectionSchema>;
export type FudabaOffice = z.infer<typeof fudabaOfficeSchema>;
export type FudabaCard = z.infer<typeof fudabaCardSchema>;
export type FudabaCardPlacement = z.infer<typeof fudabaCardPlacementSchema>;
export type FudabaPlacedCard = z.infer<typeof fudabaPlacedCardSchema>;
export type FudabaOfficePage = z.infer<typeof fudabaOfficePageSchema>;
export type FudabaCardPage = z.infer<typeof fudabaCardPageSchema>;
export type FudabaOfficeDetail = z.infer<
  typeof fudabaOfficeDetailSchema
>["office"];
export type FudabaMapOffice = z.infer<typeof fudabaMapOfficeSchema>;
export type FudabaMapOfficeList = z.infer<typeof fudabaMapOfficeListSchema>;
export type FudabaMapConfig = z.infer<typeof fudabaMapConfigSchema>;
export type FudabaPlaceSearchResult = z.infer<
  typeof fudabaPlaceSearchResultSchema
>;
export type FudabaPlaceSearchResponse = z.infer<
  typeof fudabaPlaceSearchResponseSchema
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
