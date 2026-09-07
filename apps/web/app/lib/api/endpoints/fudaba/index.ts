import {
  adminExchangePath,
  exchangePath,
  mapsPath,
} from "@imsweb/contracts/paths"
import { producerMapGeometrySchema } from "@imsweb/contracts/producer-map"
import { z } from "@imsweb/contracts/z"
import type { GeoJSONSourceSpecification } from "maplibre-gl"

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
import { bundleAssetClient } from "../../bundle-client"
import { STABLE_CONTENT_CACHE_FOR } from "../../cache-policy"
import { parsed } from "../../parsed"
import { platformApiClient } from "../../platform-client"
import {
  withBackofficeAuth,
  withBackofficeCsrf,
  withPlatformAuth,
  withPlatformCsrf,
} from "../../types"

import {
  fudabaCardDeleteResponseSchema,
  fudabaErrorResponseSchema,
  fudabaCardFieldsRequestSchema,
  fudabaCardInteractionKindSchema,
  fudabaCardPlacementDeleteRequestSchema,
  fudabaCardPlacementSaveRequestSchema,
  fudabaCardUpdateRequestSchema,
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
  fudabaOfficeFieldsRequestSchema,
  fudabaOfficeMutationResponseSchema,
  fudabaOfficePageSchema,
  fudabaOfficeUpdateRequestSchema,
  fudabaPlaceSearchResponseSchema,
  fudabaPlaceSearchQuerySchema,
  fudabaReactionRequestSchema,
  fudabaRevisionRequestSchema,
  fudabaOwnerCardDetailSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerLocationDetailSchema,
  fudabaOwnerLocationMutationResponseSchema,
  fudabaOwnerLocationSaveRequestSchema,
  fudabaOwnerLocationWithdrawalResponseSchema,
  fudabaOwnerOfficeDetailSchema,
  fudabaOwnerOfficeListSchema,
  fudabaRevisionSchema,
  fudabaSeriesListSchema,
  hasAsciiControl,
  ownerCardIdSchema,
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
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapSourceActivationSchema,
  fudabaMapSourceDeleteSchema,
  fudabaMapSourceIdSchema,
  fudabaMapSourceNameSchema,
  fudabaMapSourceSchema,
  fudabaMapSourceWriteSchema,
  fudabaMapStyleUrlSchema,
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

export {
  fudabaCardFieldsRequestSchema as fudabaCardFieldsSchema,
  fudabaCardPlacementDeleteRequestSchema as fudabaCardPlacementDeleteSchema,
  fudabaCardPlacementSaveRequestSchema as fudabaCardPlacementSaveSchema,
  fudabaCardUpdateRequestSchema as fudabaCardUpdateSchema,
  fudabaOfficeFieldsRequestSchema as fudabaOfficeFieldsSchema,
  fudabaOfficeUpdateRequestSchema as fudabaOfficeUpdateSchema,
  fudabaOwnerLocationSaveRequestSchema as fudabaOwnerLocationSubmissionSchema,
} from "@imsweb/contracts/fudaba"

export const fudabaCardCreateSchema = fudabaCardFieldsRequestSchema
  .extend({
    front: fileSchema,
    back: fileSchema,
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

const fudabaCardPlacementPathSchema = z
  .object({
    officeId: ownerCardIdSchema,
    cardId: ownerCardIdSchema,
  })
  .strict()

export type FudabaCardFields = z.input<typeof fudabaCardFieldsRequestSchema>

export type CreateFudabaCardInput = z.input<typeof fudabaCardCreateSchema>

export type UpdateFudabaCardInput = z.input<
  typeof fudabaCardUpdateRequestSchema
>

export type FudabaCardMediaSide = z.infer<
  typeof fudabaCardMediaUploadSchema
>["side"]

export type FudabaOfficeFields = z.input<typeof fudabaOfficeFieldsRequestSchema>

export type CreateFudabaOfficeInput = FudabaOfficeFields

export type UpdateFudabaOfficeInput = z.input<
  typeof fudabaOfficeUpdateRequestSchema
>

export type SaveFudabaOwnerLocationInput = z.input<
  typeof fudabaOwnerLocationSaveRequestSchema
>

export type SaveFudabaCardPlacementInput = z.input<
  typeof fudabaCardPlacementSaveRequestSchema
>

export type DeleteFudabaCardPlacementInput = z.input<
  typeof fudabaCardPlacementDeleteRequestSchema
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
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaSeriesList,
    })
  )
}

export function getFudabaOwnerSeries() {
  return platformApiClient.Get(
    exchangePath("/me/series"),
    parsed(fudabaSeriesListSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaSeriesList,
    })
  )
}

export function getFudabaOfficePage(input: FudabaOfficePageRequest = {}) {
  return platformApiClient.Get(
    withQuery(exchangePath("/offices"), officePageParams(input)),
    parsed(fudabaOfficePageSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaOfficePage,
    })
  )
}

export function getFudabaOffice(officeSlug: string) {
  return platformApiClient.Get(
    exchangePath(`/offices/${encodeURIComponent(officeSlug)}`),
    parsed(fudabaOfficeDetailSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: (data) => normalizeFudabaOfficeDetail(data.office),
    })
  )
}

export function getFudabaMapConfig() {
  return platformApiClient.Get(
    exchangePath("/map/config"),
    parsed(fudabaMapConfigSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function getFudabaChinaBoundaryDashSource() {
  return bundleAssetClient.Get(
    mapsPath("/china-boundary-dashes.json"),
    parsed(producerMapGeometrySchema, {
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      select: (data) => data as GeoJSONSourceSpecification["data"],
    })
  )
}

export function getAdminFudabaMapDelivery() {
  return adminApiClient.Get(
    adminExchangePath("/map-delivery"),
    parsed(fudabaMapDeliverySnapshotSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminFudabaMapSource(
  name: string,
  styleUrl: string,
  revision: string | null
) {
  return adminApiClient.Post(
    adminExchangePath("/map-delivery/sources"),
    { name, styleUrl, revision },
    parsed(fudabaMapDeliveryMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminFudabaMapSource(
  sourceId: string,
  name: string,
  styleUrl: string,
  revision: string | null
) {
  return adminApiClient.Put(
    adminExchangePath(`/map-delivery/sources/${encodeURIComponent(sourceId)}`),
    { name, styleUrl, revision },
    parsed(fudabaMapDeliveryMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminFudabaMapSource(
  sourceId: string,
  revision: string | null
) {
  return adminApiClient.Delete(
    adminExchangePath(`/map-delivery/sources/${encodeURIComponent(sourceId)}`),
    { revision },
    parsed(fudabaMapDeliveryMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function activateAdminFudabaMapSource(
  sourceId: string,
  revision: string | null
) {
  return adminApiClient.Put(
    adminExchangePath("/map-delivery/active"),
    { sourceId, revision },
    parsed(fudabaMapDeliveryMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function searchFudabaPlaces(query: string) {
  const search = fudabaPlaceSearchQuerySchema.parse({ q: query }).q
  return platformApiClient.Get(
    withQuery(
      exchangePath("/places/search"),
      new URLSearchParams({ q: search })
    ),
    parsed(fudabaPlaceSearchResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function getFudabaMapOffices(input: FudabaMapOfficeRequest) {
  return platformApiClient.Get(
    withQuery(exchangePath("/map/offices"), mapOfficeParams(input)),
    parsed(fudabaMapOfficeListSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function getFudabaCardPage(input: FudabaCardPageRequest = {}) {
  return platformApiClient.Get(
    withQuery(exchangePath("/cards"), cardPageParams(input)),
    parsed(fudabaCardPageSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
    errorSchema: fudabaErrorResponseSchema,
    businessErrorSchema: fudabaErrorResponseSchema,
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
    parsed(fudabaCardReactionsResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
    })
  )
}

export function setFudabaCardReaction(
  cardId: string,
  emoji: string,
  active: boolean
) {
  const card = ownerCardIdSchema.parse(cardId)
  const reaction = fudabaReactionRequestSchema.parse({ emoji }).emoji
  const path = exchangePath(`/cards/${encodeURIComponent(card)}/reactions`)
  const response = parsed(fudabaCardReactionsResponseSchema, {
    errorSchema: fudabaErrorResponseSchema,
    businessErrorSchema: fudabaErrorResponseSchema,
  })
  return active
    ? platformApiClient.Post(path, { emoji: reaction }, response)
    : platformApiClient.Delete(path, { emoji: reaction }, response)
}

export function getFudabaOwnerCards() {
  return platformApiClient.Get(
    exchangePath("/me/cards"),
    parsed(fudabaOwnerCardListSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerCardList,
    })
  )
}

export function getFudabaOwnerCard(cardId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}`),
    parsed(fudabaOwnerCardDetailSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerCardDetail,
    })
  )
}

export function getFudabaOwnerOffices() {
  return platformApiClient.Get(
    exchangePath("/me/offices"),
    parsed(fudabaOwnerOfficeListSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerOfficeList,
    })
  )
}

export function getFudabaOwnerOffice(officeId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}`),
    parsed(fudabaOwnerOfficeDetailSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeFudabaOwnerOfficeDetail,
    })
  )
}

export function createFudabaOffice(
  input: CreateFudabaOfficeInput,
  idempotencyKey: string
) {
  const submission = fudabaOfficeFieldsRequestSchema.parse(input)
  const key = idempotencyKeySchema.parse(idempotencyKey)
  return platformApiClient.Post(
    exchangePath("/offices"),
    submission,
    parsed(fudabaOfficeMutationResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
  const submission = fudabaOfficeUpdateRequestSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}`),
    submission,
    parsed(fudabaOfficeMutationResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
      select: normalizeFudabaOfficeMutation,
    })
  )
}

export function getFudabaOwnerLocation(officeId: string) {
  return platformApiClient.Get(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    parsed(fudabaOwnerLocationDetailSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function saveFudabaOwnerLocation(
  officeId: string,
  input: SaveFudabaOwnerLocationInput
) {
  const submission = fudabaOwnerLocationSaveRequestSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    submission,
    parsed(fudabaOwnerLocationMutationResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function withdrawFudabaOwnerLocation(
  officeId: string,
  expectedRevision: number
) {
  const submission = fudabaRevisionRequestSchema.parse({ expectedRevision })
  return platformApiClient.Delete(
    exchangePath(`/me/offices/${encodeURIComponent(officeId)}/location`),
    submission,
    parsed(fudabaOwnerLocationWithdrawalResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
      select: normalizeFudabaCardMutation,
    })
  )
}

export function updateFudabaCard(cardId: string, input: UpdateFudabaCardInput) {
  const submission = fudabaCardUpdateRequestSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}`),
    submission,
    parsed(fudabaCardMutationResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
  const submission = fudabaCardPlacementSaveRequestSchema.parse(input)
  return platformApiClient.Put(
    exchangePath(
      `/offices/${encodeURIComponent(path.officeId)}/cards/${encodeURIComponent(path.cardId)}/placement`
    ),
    submission,
    parsed(fudabaCardPlacementSaveResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
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
  const submission = fudabaCardPlacementDeleteRequestSchema.parse({
    expectedRevision,
  })
  return platformApiClient.Delete(
    exchangePath(
      `/offices/${encodeURIComponent(path.officeId)}/cards/${encodeURIComponent(path.cardId)}/placement`
    ),
    submission,
    parsed(fudabaCardPlacementDeleteResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}
