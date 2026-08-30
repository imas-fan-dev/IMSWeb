import { adminExchangePath, exchangePath } from "@imsweb/contracts/paths"
import { z } from "@imsweb/contracts/z"

import {
  normalizeFudabaCardMutation,
  normalizeFudabaCardPage,
  normalizeFudabaOfficeDetail,
  normalizeFudabaOfficeMutation,
  normalizeFudabaOfficePage,
  normalizeFudabaOwnerCardDetail,
  normalizeFudabaOwnerCardList,
  normalizeFudabaOwnerOfficeDetail,
  normalizeFudabaOwnerOfficeList,
  normalizeFudabaSeriesList,
} from "../../media-urls"
import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { platformApiClient } from "../../platform-client"
import {
  withBackofficeAuth,
  withBackofficeCsrf,
  withPlatformAuth,
  withPlatformCsrf,
} from "../../types"

import {
  accentSchema,
  exactCoordinateSchema,
  fudabaCardDeleteResponseSchema,
  fudabaCardInteractionKindSchema,
  fudabaCardInteractionResponseSchema,
  fudabaCardMutationResponseSchema,
  fudabaCardPageSchema,
  fudabaCardPlacementDeleteResponseSchema,
  fudabaCardPlacementSaveResponseSchema,
  fudabaCardReactionSchema,
  fudabaCardReactionsResponseSchema,
  namecardReactionEmojiSchema,
  NAMECARD_REACTION_EMOJIS,
  fudabaMapConfigSchema,
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapOfficeListSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficeMutationResponseSchema,
  fudabaOfficePageSchema,
  fudabaPlaceSearchResponseSchema,
  fudabaOwnerCardDetailSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerLocationDetailSchema,
  fudabaOwnerLocationMutationResponseSchema,
  fudabaOwnerLocationWithdrawalResponseSchema,
  fudabaOwnerOfficeDetailSchema,
  fudabaOwnerOfficeListSchema,
  fudabaRevisionSchema,
  fudabaSeriesListSchema,
  hasAsciiControl,
  ownerCardIdSchema,
  ownerCardTextSchema,
  ownerOfficeSeriesCodesSchema,
  ownerOfficeTextSchema,
  regionalCoordinateSchema,
  seriesCodeSchema,
  wallCoordinateSchema,
  wallRotationSchema,
  wallZIndexSchema,
} from "@imsweb/contracts/fudaba"

export {
  seriesCodeSchema,
  accentSchema,
  publicMediaUrlSchema,
  timestampSchema,
  fudabaRevisionSchema,
  wallCoordinateSchema,
  wallRotationSchema,
  wallZIndexSchema,
  exactCoordinateSchema,
  regionalCoordinateSchema,
  fudabaSeriesSchema,
  fudabaSeriesListSchema,
  fudabaOfficeSchema,
  fudabaIdolSelectionSchema,
  fudabaCardInteractionsSchema,
  fudabaCardInteractionKindSchema,
  namecardReactionEmojiSchema,
  fudabaCardReactionSchema,
  fudabaCardSchema,
  fudabaCardPlacementSchema,
  fudabaPlacedCardSchema,
  fudabaPageInfoSchema,
  fudabaOfficePageSchema,
  fudabaCardPageSchema,
  fudabaOfficeDetailSchema,
  fudabaMapOfficeSchema,
  fudabaMapOfficeListSchema,
  fudabaPlaceSearchResultSchema,
  fudabaPlaceSearchResponseSchema,
  fudabaMapConfigSchema,
  ownerCardIdSchema,
  ownerCardTextSchema,
  ownerOfficeTextSchema,
  ownerOfficeSeriesCodesSchema,
  fudabaOwnerCardSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerCardDetailSchema,
  fudabaCardMutationResponseSchema,
  fudabaCardDeleteResponseSchema,
  fudabaCardInteractionResponseSchema,
  fudabaCardReactionsResponseSchema,
  fudabaOwnerOfficeSchema,
  fudabaOwnerOfficeListSchema,
  fudabaOwnerOfficeDetailSchema,
  fudabaOfficeMutationResponseSchema,
  fudabaOwnerLocationSchema,
  fudabaOwnerLocationDetailSchema,
  fudabaOwnerLocationMutationResponseSchema,
  fudabaOwnerLocationWithdrawalResponseSchema,
  fudabaCardPlacementSaveResponseSchema,
  fudabaCardPlacementDeleteResponseSchema,
  fudabaMapAssetName,
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapDeliveryUpdateSchema,
  fudabaMapPrefixFromStyleUrl,
  fudabaMapPrefixSchema,
  fudabaMapStyleUrlForPrefix,
  isFudabaMapPrefix,
  isFudabaMapStyleUrl,
  hasAsciiControl,
} from "@imsweb/contracts/fudaba"
export type * from "@imsweb/contracts/fudaba"

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => value === value.trim() && !hasAsciiControl(value),
    "idempotency key is invalid"
  )

const fileSchema = z.custom<File>(
  (value) => typeof File !== "undefined" && value instanceof File,
  "image must be a File"
)

const placeSearchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .refine((value) => !hasAsciiControl(value))

export const fudabaCardFieldsSchema = z
  .object({
    producerName: ownerCardTextSchema(80, true),
    displayName: ownerCardTextSchema(120, true),
    seriesCode: seriesCodeSchema.max(64),
    favoriteIdolIds: z
      .array(z.number().int().positive())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
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

export const fudabaOfficeFieldsSchema = z
  .object({
    name: ownerOfficeTextSchema(80, true),
    intro: ownerOfficeTextSchema(2000),
    city: ownerOfficeTextSchema(100, true),
    address: ownerOfficeTextSchema(240, true),
    latitude: exactCoordinateSchema(-90, 90),
    longitude: exactCoordinateSchema(-180, 180),
    accent: accentSchema.transform((value) => value.toLowerCase()),
    isOpen: z.boolean(),
    seriesCodes: ownerOfficeSeriesCodesSchema,
  })
  .strict()

export const fudabaOfficeUpdateSchema = fudabaOfficeFieldsSchema
  .extend({ expectedRevision: fudabaRevisionSchema })
  .strict()

export const fudabaOwnerLocationSubmissionSchema = z
  .object({
    latitude: regionalCoordinateSchema(-60, 60),
    longitude: regionalCoordinateSchema(-180, 180),
    expectedRevision: fudabaRevisionSchema.nullable(),
  })
  .strict()

export const fudabaCardPlacementSaveSchema = z
  .object({
    x: wallCoordinateSchema,
    y: wallCoordinateSchema,
    rotation: wallRotationSchema,
    zIndex: wallZIndexSchema,
    expectedRevision: fudabaRevisionSchema.nullable(),
  })
  .strict()

export const fudabaCardPlacementDeleteSchema = z
  .object({ expectedRevision: fudabaRevisionSchema })
  .strict()

const fudabaCardPlacementPathSchema = z
  .object({
    officeId: ownerCardIdSchema,
    cardId: ownerCardIdSchema,
  })
  .strict()

export type FudabaCardFields = z.input<typeof fudabaCardFieldsSchema>

export type CreateFudabaCardInput = z.input<typeof fudabaCardCreateSchema>

export type UpdateFudabaCardInput = z.input<typeof fudabaCardUpdateSchema>

export type FudabaCardMediaSide = z.infer<
  typeof fudabaCardMediaUploadSchema
>["side"]

export type FudabaOfficeFields = z.input<typeof fudabaOfficeFieldsSchema>

export type CreateFudabaOfficeInput = FudabaOfficeFields

export type UpdateFudabaOfficeInput = z.input<typeof fudabaOfficeUpdateSchema>

export type SaveFudabaOwnerLocationInput = z.input<
  typeof fudabaOwnerLocationSubmissionSchema
>

export type SaveFudabaCardPlacementInput = z.input<
  typeof fudabaCardPlacementSaveSchema
>

export type DeleteFudabaCardPlacementInput = z.input<
  typeof fudabaCardPlacementDeleteSchema
>

export type FudabaMapBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
]

export interface FudabaMapOfficeRequest {
  bbox: FudabaMapBounds
  city?: string
  series?: readonly string[]
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
  const params = new URLSearchParams({ limit: String(limit) })
  if (city?.trim()) params.set("city", city.trim())
  for (const seriesCode of series ?? []) params.append("series", seriesCode)
  if (open !== undefined) params.set("open", String(open))
  if (cursor) params.set("cursor", cursor)
  return params
}

function cardPageParams({
  series,
  available,
  office,
  limit = 8,
  cursor,
}: FudabaCardPageRequest) {
  const params = new URLSearchParams({ limit: String(limit) })
  for (const seriesCode of series ?? []) params.append("series", seriesCode)
  if (available !== undefined) params.set("available", String(available))
  if (office) params.set("office", office)
  if (cursor) params.set("cursor", cursor)
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

  const params = new URLSearchParams({
    bbox: bbox.join(","),
    limit: String(limit),
  })
  if (city?.trim()) params.set("city", city.trim())
  for (const seriesCode of series ?? []) params.append("series", seriesCode)
  if (open !== undefined) params.set("open", String(open))
  return params
}

function withQuery(path: string, parameters: URLSearchParams) {
  const query = parameters.toString()
  return query ? `${path}?${query}` : path
}

export interface FudabaOfficePageRequest {
  city?: string
  series?: readonly string[]
  open?: boolean
  limit?: number
  cursor?: string
}

export interface FudabaCardPageRequest {
  series?: readonly string[]
  available?: boolean
  office?: string
  limit?: number
  cursor?: string
}

export function getFudabaSeries() {
  return platformApiClient.Get(
    exchangePath("/series"),
    parsed(fudabaSeriesListSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaSeriesList,
    })
  )
}

export function getFudabaOwnerSeries() {
  return platformApiClient.Get(
    exchangePath("/me/series"),
    parsed(fudabaSeriesListSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaSeriesList,
    })
  )
}

export function getFudabaOfficePage(input: FudabaOfficePageRequest = {}) {
  return platformApiClient.Get(
    withQuery(exchangePath("/offices"), officePageParams(input)),
    parsed(fudabaOfficePageSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaOfficePage,
    })
  )
}

export function getFudabaOffice(officeSlug: string) {
  return platformApiClient.Get(
    exchangePath(`/offices/${encodeURIComponent(officeSlug)}`),
    parsed(fudabaOfficeDetailSchema, {
      meta: withPlatformAuth(),
      select: (data) => normalizeFudabaOfficeDetail(data.office),
    })
  )
}

export function getFudabaMapConfig() {
  return platformApiClient.Get(
    exchangePath("/map/config"),
    parsed(fudabaMapConfigSchema, {
      meta: withPlatformAuth(),
    })
  )
}

export function getAdminFudabaMapDelivery() {
  return adminApiClient.Get(
    adminExchangePath("/map-delivery"),
    parsed(fudabaMapDeliverySnapshotSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminFudabaMapDelivery(
  prefix: string,
  revision: string | null
) {
  return adminApiClient.Put(
    adminExchangePath("/map-delivery"),
    { prefix, revision },
    parsed(fudabaMapDeliveryMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function searchFudabaPlaces(query: string) {
  const search = placeSearchQuerySchema.parse(query)
  return platformApiClient.Get(
    withQuery(
      exchangePath("/places/search"),
      new URLSearchParams({ q: search })
    ),
    parsed(fudabaPlaceSearchResponseSchema, {
      meta: withPlatformAuth(),
    })
  )
}

export function getFudabaMapOffices(input: FudabaMapOfficeRequest) {
  return platformApiClient.Get(
    withQuery(exchangePath("/map/offices"), mapOfficeParams(input)),
    parsed(fudabaMapOfficeListSchema, {
      meta: withPlatformAuth(),
    })
  )
}

export function getFudabaCardPage(input: FudabaCardPageRequest = {}) {
  return platformApiClient.Get(
    withQuery(exchangePath("/cards"), cardPageParams(input)),
    parsed(fudabaCardPageSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaCardPage,
    })
  )
}

export type FudabaCardInteractionKind = z.infer<
  typeof fudabaCardInteractionKindSchema
>

export function getFudabaFavoriteCardPage(input: FudabaCardPageRequest = {}) {
  return platformApiClient.Get(
    withQuery(exchangePath("/me/favorites"), cardPageParams(input)),
    parsed(fudabaCardPageSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaCardPage,
    })
  )
}

export function setFudabaCardInteraction(
  cardId: string,
  kind: FudabaCardInteractionKind,
  active: boolean
) {
  const card = ownerCardIdSchema.parse(cardId)
  const interaction = fudabaCardInteractionKindSchema.parse(kind)
  const path = exchangePath(`/cards/${encodeURIComponent(card)}/${interaction}`)
  const response = parsed(fudabaCardInteractionResponseSchema, {
    meta: withPlatformCsrf(),
  })
  return active
    ? platformApiClient.Put(path, {}, response)
    : platformApiClient.Delete(path, {}, response)
}

export type FudabaCardReaction = z.infer<typeof fudabaCardReactionSchema>
export type NamecardReactionEmoji = z.infer<typeof namecardReactionEmojiSchema>

export { NAMECARD_REACTION_EMOJIS }

// Reactions are anonymous counters, so they carry no session and no CSRF token.
export function getFudabaCardReactions(cardId: string) {
  const card = ownerCardIdSchema.parse(cardId)
  return platformApiClient.Get(
    exchangePath(`/cards/${encodeURIComponent(card)}/reactions`),
    parsed(fudabaCardReactionsResponseSchema)
  )
}

export function setFudabaCardReaction(
  cardId: string,
  emoji: string,
  active: boolean
) {
  const card = ownerCardIdSchema.parse(cardId)
  const reaction = namecardReactionEmojiSchema.parse(emoji)
  const path = exchangePath(`/cards/${encodeURIComponent(card)}/reactions`)
  const response = parsed(fudabaCardReactionsResponseSchema)
  return active
    ? platformApiClient.Post(path, { emoji: reaction }, response)
    : platformApiClient.Delete(path, { emoji: reaction }, response)
}

export function getFudabaOwnerCards() {
  return platformApiClient.Get(
    exchangePath("/me/cards"),
    parsed(fudabaOwnerCardListSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerCardList,
    })
  )
}

export function getFudabaOwnerCard(cardId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}`),
    parsed(fudabaOwnerCardDetailSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerCardDetail,
    })
  )
}

export function getFudabaOwnerOffices() {
  return platformApiClient.Get(
    exchangePath("/me/offices"),
    parsed(fudabaOwnerOfficeListSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerOfficeList,
    })
  )
}

export function getFudabaOwnerOffice(officeId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}`),
    parsed(fudabaOwnerOfficeDetailSchema, {
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerOfficeDetail,
    })
  )
}

export function createFudabaOffice(
  input: CreateFudabaOfficeInput,
  idempotencyKey: string
) {
  const submission = fudabaOfficeFieldsSchema.parse(input)
  const key = idempotencyKeySchema.parse(idempotencyKey)
  return platformApiClient.Post(
    exchangePath("/offices"),
    submission,
    parsed(fudabaOfficeMutationResponseSchema, {
      headers: { "Idempotency-Key": key },
      meta: withPlatformCsrf(),
      select: normalizeFudabaOfficeMutation,
    })
  )
}

export function updateFudabaOwnerOffice(
  officeId: string,
  input: UpdateFudabaOfficeInput
) {
  const submission = fudabaOfficeUpdateSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}`),
    submission,
    parsed(fudabaOfficeMutationResponseSchema, {
      meta: withPlatformCsrf(),
      select: normalizeFudabaOfficeMutation,
    })
  )
}

export function getFudabaOwnerLocation(officeId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    parsed(fudabaOwnerLocationDetailSchema, {
      meta: withPlatformAuth(),
    })
  )
}

export function saveFudabaOwnerLocation(
  officeId: string,
  input: SaveFudabaOwnerLocationInput
) {
  const submission = fudabaOwnerLocationSubmissionSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    submission,
    parsed(fudabaOwnerLocationMutationResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function withdrawFudabaOwnerLocation(
  officeId: string,
  expectedRevision: number
) {
  const revision = fudabaRevisionSchema.parse(expectedRevision)
  return platformApiClient.Delete(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    { expectedRevision: revision },
    parsed(fudabaOwnerLocationWithdrawalResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

function appendCardFields(form: FormData, fields: FudabaCardFields) {
  form.append("producerName", fields.producerName)
  form.append("displayName", fields.displayName)
  form.append("seriesCode", fields.seriesCode)
  form.append("favoriteIdolIds", JSON.stringify(fields.favoriteIdolIds))
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
  return platformApiClient.Post(
    exchangePath("/cards"),
    form,
    parsed(fudabaCardMutationResponseSchema, {
      meta: withPlatformCsrf(),
      select: normalizeFudabaCardMutation,
    })
  )
}

export function updateFudabaCard(cardId: string, input: UpdateFudabaCardInput) {
  const submission = fudabaCardUpdateSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}`),
    submission,
    parsed(fudabaCardMutationResponseSchema, {
      meta: withPlatformCsrf(),
      select: normalizeFudabaCardMutation,
    })
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
  return platformApiClient.Put(
    exchangePath(`/uploads/${upload.side}`),
    form,
    parsed(fudabaCardMutationResponseSchema, {
      meta: withPlatformCsrf(),
      select: normalizeFudabaCardMutation,
    })
  )
}

export function deleteFudabaCard(cardId: string, expectedRevision: number) {
  const revision = fudabaRevisionSchema.parse(expectedRevision)
  return platformApiClient.Delete(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}`),
    { expectedRevision: revision },
    parsed(fudabaCardDeleteResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function saveFudabaCardPlacement(
  officeId: string,
  cardId: string,
  input: SaveFudabaCardPlacementInput
) {
  const path = fudabaCardPlacementPathSchema.parse({ officeId, cardId })
  const submission = fudabaCardPlacementSaveSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(
      `/offices/${encodeURIComponent(path.officeId)}/cards/${encodeURIComponent(path.cardId)}/placement`
    ),
    submission,
    parsed(fudabaCardPlacementSaveResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function deleteFudabaCardPlacement(
  officeId: string,
  cardId: string,
  expectedRevision: number
) {
  const path = fudabaCardPlacementPathSchema.parse({ officeId, cardId })
  const submission = fudabaCardPlacementDeleteSchema.parse({
    expectedRevision,
  })
  return platformApiClient.Delete(
    exchangePath(
      `/offices/${encodeURIComponent(path.officeId)}/cards/${encodeURIComponent(path.cardId)}/placement`
    ),
    submission,
    parsed(fudabaCardPlacementDeleteResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}
