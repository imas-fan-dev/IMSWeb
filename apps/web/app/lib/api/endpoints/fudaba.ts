import { z } from "zod"

import { platformApiClient } from "../platform-client"
import { withPlatformAuth, withPlatformCsrf } from "../types"

const seriesCodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const accentSchema = z.string().regex(/^#[0-9a-f]{6}$/i)
const publicMediaUrlSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })
const regionalCoordinateSchema = (minimum: number, maximum: number) =>
  z
    .number()
    .finite()
    .min(minimum)
    .max(maximum)
    .refine(
      (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8,
      "regional coordinates must use the 0.1 degree grid"
    )

export const fudabaSeriesSchema = z
  .object({
    code: seriesCodeSchema,
    displayName: z.string().trim().min(1),
    displayOrder: z.number().int().nonnegative(),
    activeOfficeCount: z.number().int().nonnegative(),
  })
  .strict()

export const fudabaSeriesListSchema = z
  .object({
    items: z.array(fudabaSeriesSchema),
  })
  .strict()

export const fudabaOfficeSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(1),
  intro: z.string(),
  city: z.string().trim().min(1),
  accent: accentSchema,
  coverUrl: publicMediaUrlSchema.nullable(),
  isOpen: z.boolean(),
  visitorCount: z.number().int().nonnegative(),
  seriesCodes: z.array(seriesCodeSchema),
})

export const fudabaCardSchema = z.object({
  id: z.string().min(1),
  producerName: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  seriesCode: seriesCodeSchema,
  favoriteIdol: z.string(),
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
  interactions: z.object({
    likes: z.number().int().nonnegative(),
    favorites: z.number().int().nonnegative(),
    viewerLiked: z.boolean(),
    viewerFavorited: z.boolean(),
  }),
})

export const fudabaPlacedCardSchema = fudabaCardSchema.extend({
  placement: z.object({
    pinnedAt: timestampSchema,
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    rotation: z.number().min(-12).max(12),
    zIndex: z.number().int().min(1).max(999),
  }),
})

export const fudabaPageInfoSchema = z
  .object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().min(1).nullable(),
  })
  .superRefine((value, context) => {
    if (value.hasNextPage !== Boolean(value.nextCursor)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fudaba pagination state is inconsistent",
      })
    }
  })

export const fudabaOfficePageSchema = z.object({
  items: z.array(fudabaOfficeSchema),
  pageInfo: fudabaPageInfoSchema,
})

export const fudabaCardPageSchema = z.object({
  items: z.array(fudabaCardSchema),
  pageInfo: fudabaPageInfoSchema,
})

export const fudabaOfficeDetailSchema = z.object({
  office: fudabaOfficeSchema.extend({
    cards: z.array(fudabaPlacedCardSchema),
  }),
})

export const fudabaMapOfficeSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().trim().min(1),
    city: z.string().trim().min(1),
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
  .strict()

export const fudabaMapOfficeListSchema = z
  .object({
    items: z.array(fudabaMapOfficeSchema),
    truncated: z.boolean(),
  })
  .strict()

export const fudabaMapConfigSchema = z
  .object({
    styleUrl: z
      .string()
      .refine(
        (value) => !hasAsciiControl(value),
        "map style URL must not contain ASCII control characters"
      )
      .transform((value) => value.trim())
      .refine(
        (value) =>
          value.length > 0 &&
          value.length <= 2048 &&
          value.startsWith("/") &&
          !value.includes("//") &&
          !value.includes("\\") &&
          !value.includes("?") &&
          !value.includes("#"),
        "map style URL must be a same-origin absolute path without query or hash"
      ),
  })
  .strict()

function hasAsciiControl(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

const ownerCardIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      !hasAsciiControl(value) && !value.includes("/") && !value.includes("\\")
  )

const ownerCardTextSchema = (maximum: number, required = false) =>
  z
    .string()
    .trim()
    .min(required ? 1 : 0)
    .max(maximum)
    .refine((value) => !hasAsciiControl(value))

const fudabaRevisionSchema = z.number().int().safe().nonnegative()

const fileSchema = z.custom<File>(
  (value) => typeof File !== "undefined" && value instanceof File,
  "image must be a File"
)

export const fudabaOwnerCardSchema = z
  .object({
    id: ownerCardIdSchema,
    producerName: ownerCardTextSchema(80, true),
    displayName: ownerCardTextSchema(120, true),
    seriesCode: seriesCodeSchema.max(64),
    favoriteIdol: ownerCardTextSchema(200),
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
      "published",
      "hidden",
      "rejected",
    ]),
    revision: fudabaRevisionSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const fudabaOwnerCardListSchema = z
  .object({
    items: z.array(fudabaOwnerCardSchema),
  })
  .strict()

export const fudabaOwnerCardDetailSchema = z
  .object({
    card: fudabaOwnerCardSchema,
  })
  .strict()

export const fudabaCardMutationResponseSchema = z
  .object({
    success: z.literal(true),
    card: fudabaOwnerCardSchema,
  })
  .strict()

export const fudabaCardDeleteResponseSchema = z
  .object({
    success: z.literal(true),
    revision: fudabaRevisionSchema,
  })
  .strict()

export const fudabaCardFieldsSchema = z
  .object({
    producerName: ownerCardTextSchema(80, true),
    displayName: ownerCardTextSchema(120, true),
    seriesCode: seriesCodeSchema.max(64),
    favoriteIdol: ownerCardTextSchema(200),
    accent: accentSchema,
    bio: ownerCardTextSchema(2000),
    tradeNote: ownerCardTextSchema(1000),
    available: z.boolean(),
  })
  .strict()

export const fudabaCardCreateSchema = fudabaCardFieldsSchema
  .extend({
    front: fileSchema,
    back: fileSchema,
  })
  .strict()

export const fudabaCardUpdateSchema = fudabaCardFieldsSchema
  .extend({
    expectedRevision: fudabaRevisionSchema,
  })
  .strict()

export const fudabaCardMediaUploadSchema = z
  .object({
    cardId: ownerCardIdSchema,
    side: z.enum(["front", "back"]),
    image: fileSchema,
    expectedRevision: fudabaRevisionSchema,
  })
  .strict()

export type FudabaSeries = z.infer<typeof fudabaSeriesSchema>
export type FudabaSeriesList = z.infer<typeof fudabaSeriesListSchema>
export type FudabaOffice = z.infer<typeof fudabaOfficeSchema>
export type FudabaCard = z.infer<typeof fudabaCardSchema>
export type FudabaPlacedCard = z.infer<typeof fudabaPlacedCardSchema>
export type FudabaOfficePage = z.infer<typeof fudabaOfficePageSchema>
export type FudabaCardPage = z.infer<typeof fudabaCardPageSchema>
export type FudabaOfficeDetail = z.infer<
  typeof fudabaOfficeDetailSchema
>["office"]
export type FudabaMapOffice = z.infer<typeof fudabaMapOfficeSchema>
export type FudabaMapOfficeList = z.infer<typeof fudabaMapOfficeListSchema>
export type FudabaMapConfig = z.infer<typeof fudabaMapConfigSchema>
export type FudabaOwnerCard = z.infer<typeof fudabaOwnerCardSchema>
export type FudabaOwnerCardList = z.infer<typeof fudabaOwnerCardListSchema>
export type FudabaOwnerCardDetail = z.infer<typeof fudabaOwnerCardDetailSchema>
export type FudabaCardMutationResponse = z.infer<
  typeof fudabaCardMutationResponseSchema
>
export type FudabaCardDeleteResponse = z.infer<
  typeof fudabaCardDeleteResponseSchema
>
export type FudabaCardFields = z.input<typeof fudabaCardFieldsSchema>
export type CreateFudabaCardInput = z.input<typeof fudabaCardCreateSchema>
export type UpdateFudabaCardInput = z.input<typeof fudabaCardUpdateSchema>
export type FudabaCardMediaSide = z.infer<
  typeof fudabaCardMediaUploadSchema
>["side"]

export interface FudabaOfficePageRequest {
  city?: string
  series?: string
  open?: boolean
  limit?: number
  cursor?: string
}

export interface FudabaCardPageRequest {
  series?: string
  available?: boolean
  office?: string
  limit?: number
  cursor?: string
}

export type FudabaMapBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
]

export interface FudabaMapOfficeRequest {
  bbox: FudabaMapBounds
  city?: string
  series?: string
  open?: boolean
  limit?: number
}

function officePageParams({
  city,
  series,
  open,
  limit = 12,
  cursor,
}: FudabaOfficePageRequest) {
  const params: Record<string, string | number> = { limit }
  if (city?.trim()) params.city = city.trim()
  if (series) params.series = series
  if (open !== undefined) params.open = String(open)
  if (cursor) params.cursor = cursor
  return params
}

function cardPageParams({
  series,
  available,
  office,
  limit = 8,
  cursor,
}: FudabaCardPageRequest) {
  const params: Record<string, string | number> = { limit }
  if (series) params.series = series
  if (available !== undefined) params.available = String(available)
  if (office) params.office = office
  if (cursor) params.cursor = cursor
  return params
}

function mapOfficeParams({
  bbox,
  city,
  series,
  open,
  limit = 200,
}: FudabaMapOfficeRequest) {
  const [west, south, east, north] = bbox
  if (
    !bbox.every(Number.isFinite) ||
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    throw new Error("Fudaba map bounds are invalid")
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Fudaba map limit must be between 1 and 500")
  }

  const params: Record<string, string | number> = {
    bbox: bbox.join(","),
    limit,
  }
  if (city?.trim()) params.city = city.trim()
  if (series) params.series = series
  if (open !== undefined) params.open = String(open)
  return params
}

export function getFudabaSeries() {
  return platformApiClient.Get<z.infer<typeof fudabaSeriesListSchema>, unknown>(
    "/api/community/exchange/series",
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaSeriesListSchema.parse(payload),
    }
  )
}

export function getFudabaOwnerSeries() {
  return platformApiClient.Get<FudabaSeriesList, unknown>(
    "/api/community/exchange/me/series",
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaSeriesListSchema.parse(payload),
    }
  )
}

export function getFudabaOfficePage(input: FudabaOfficePageRequest = {}) {
  return platformApiClient.Get<FudabaOfficePage, unknown>(
    "/api/community/exchange/offices",
    {
      meta: withPlatformAuth(),
      params: officePageParams(input),
      transform: (payload) => fudabaOfficePageSchema.parse(payload),
    }
  )
}

export function getFudabaOffice(officeSlug: string) {
  return platformApiClient.Get<FudabaOfficeDetail, unknown>(
    `/api/community/exchange/offices/${encodeURIComponent(officeSlug)}`,
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaOfficeDetailSchema.parse(payload).office,
    }
  )
}

export function getFudabaMapConfig() {
  return platformApiClient.Get<FudabaMapConfig, unknown>(
    "/api/community/exchange/map/config",
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaMapConfigSchema.parse(payload),
    }
  )
}

export function getFudabaMapOffices(input: FudabaMapOfficeRequest) {
  return platformApiClient.Get<FudabaMapOfficeList, unknown>(
    "/api/community/exchange/map/offices",
    {
      meta: withPlatformAuth(),
      params: mapOfficeParams(input),
      transform: (payload) => fudabaMapOfficeListSchema.parse(payload),
    }
  )
}

export function getFudabaCardPage(input: FudabaCardPageRequest = {}) {
  return platformApiClient.Get<FudabaCardPage, unknown>(
    "/api/community/exchange/cards",
    {
      meta: withPlatformAuth(),
      params: cardPageParams(input),
      transform: (payload) => fudabaCardPageSchema.parse(payload),
    }
  )
}

export function getFudabaOwnerCards() {
  return platformApiClient.Get<FudabaOwnerCardList, unknown>(
    "/api/community/exchange/me/cards",
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaOwnerCardListSchema.parse(payload),
    }
  )
}

export function getFudabaOwnerCard(cardId: string) {
  return platformApiClient.Get<FudabaOwnerCardDetail, unknown>(
    `/api/community/exchange/me/cards/${encodeURIComponent(cardId)}`,
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaOwnerCardDetailSchema.parse(payload),
    }
  )
}

function appendCardFields(form: FormData, fields: FudabaCardFields) {
  form.append("producerName", fields.producerName)
  form.append("displayName", fields.displayName)
  form.append("seriesCode", fields.seriesCode)
  form.append("favoriteIdol", fields.favoriteIdol)
  form.append("accent", fields.accent)
  form.append("bio", fields.bio)
  form.append("tradeNote", fields.tradeNote)
  form.append("available", String(fields.available))
}

export function createFudabaCard(input: CreateFudabaCardInput) {
  const { front, back, ...fields } = fudabaCardCreateSchema.parse(input)
  const form = new FormData()
  appendCardFields(form, fields)
  form.append("front", front)
  form.append("back", back)
  return platformApiClient.Post<FudabaCardMutationResponse, unknown>(
    "/api/community/exchange/cards",
    form,
    {
      meta: withPlatformCsrf(),
      transform: (payload) => fudabaCardMutationResponseSchema.parse(payload),
    }
  )
}

export function updateFudabaCard(cardId: string, input: UpdateFudabaCardInput) {
  const submission = fudabaCardUpdateSchema.parse(input)
  return platformApiClient.Put<FudabaCardMutationResponse, unknown>(
    `/api/community/exchange/me/cards/${encodeURIComponent(cardId)}`,
    submission,
    {
      meta: withPlatformCsrf(),
      transform: (payload) => fudabaCardMutationResponseSchema.parse(payload),
    }
  )
}

export function uploadFudabaCardMedia(
  cardId: string,
  side: FudabaCardMediaSide,
  image: File,
  expectedRevision: number
) {
  const upload = fudabaCardMediaUploadSchema.parse({
    cardId,
    side,
    image,
    expectedRevision,
  })
  const form = new FormData()
  form.append("image", upload.image)
  form.append("cardId", upload.cardId)
  form.append("expectedRevision", String(upload.expectedRevision))
  return platformApiClient.Put<FudabaCardMutationResponse, unknown>(
    `/api/community/exchange/uploads/${upload.side}`,
    form,
    {
      meta: withPlatformCsrf(),
      transform: (payload) => fudabaCardMutationResponseSchema.parse(payload),
    }
  )
}

export function deleteFudabaCard(cardId: string, expectedRevision: number) {
  const revision = fudabaRevisionSchema.parse(expectedRevision)
  return platformApiClient.Delete<FudabaCardDeleteResponse, unknown>(
    `/api/community/exchange/me/cards/${encodeURIComponent(cardId)}`,
    { expectedRevision: revision },
    {
      meta: withPlatformCsrf(),
      transform: (payload) => fudabaCardDeleteResponseSchema.parse(payload),
    }
  )
}
