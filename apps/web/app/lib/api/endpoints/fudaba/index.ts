import {
  adminExchangePath,
  apiPath,
  exchangeCardRequestPath,
  exchangeCardShareCommitPath,
  exchangeMyCardsLayoutPath,
  exchangeMyQuickPath,
  exchangePath,
  exchangeQuickCommitPath,
  exchangeScanCommitPath,
  exchangeScanSessionPath,
  mapsPath,
} from "@imsweb/contracts/paths"
export { createMapboxNearbySearch } from "./mapbox-place-search"
import {
  createNamecardFeedbackRequestSchema,
  namecardCardLayoutRequestSchema,
  namecardCardLayoutSchema,
  namecardCardShareLinkSchema,
  namecardExchangeCommitSchema,
  namecardExchangeGiftSchema,
  namecardExchangeResultSchema,
  namecardFeedbackMutationSchema,
  namecardQuickSettingsSchema,
  namecardScanSessionRequestSchema,
  namecardScanSessionSchema,
  namecardScanSessionStatusResponseSchema,
  namecardTagCardParamsSchema,
  namecardTagErrorSchema,
  namecardTagSuggestFailureSchema,
  namecardTagSetRequestSchema,
  namecardTagSetResponseSchema,
  namecardTagValidateRequestSchema,
  namecardTagValidateResponseSchema,
  namecardTagSuggestQuerySchema,
  namecardTagSuggestResponseSchema,
  type NamecardCardLayoutRequest,
  type NamecardFeedbackReason,
} from "@imsweb/contracts/namecards"
export type { NamecardTagSuggestionPreset } from "@imsweb/contracts/namecards"
import { producerMapGeometrySchema } from "@imsweb/contracts/producer-map"
import { z } from "@imsweb/contracts/z"
import type { GeoJSONSourceSpecification } from "maplibre-gl"
import type {
  FudabaMapSourceWrite,
  FudabaMapRouting,
  FudabaPlaceReverseQuery,
} from "@imsweb/contracts/fudaba"

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
  normalizeNamecardQuickSettings,
} from "../../media-urls"
import { adminApiClient } from "../../admin-client"
import { apiClient } from "../../client"
import { bundleAssetClient } from "../../bundle-client"
import { STABLE_CONTENT_CACHE_FOR, NO_CLIENT_CACHE } from "../../cache-policy"
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
  fudabaPlaceReverseQuerySchema,
  fudabaPlaceReverseResponseSchema,
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
  fudabaCharacterSelectionSchema,
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
  fudabaPlaceReverseResultSchema,
  fudabaPlaceReverseResponseSchema,
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
    /** Single-sided cards have no back page. */
    back: fileSchema.optional(),
    /** Ordered middle pages, submitted after the first and last image. */
    images: z.array(fileSchema).optional(),
    /** 保存时应用的旋转圈数（0-3），与上传同一次写入。 */
    rotations: z
      .object({
        front: z.number().int().min(0).max(3).optional(),
        back: z.number().int().min(0).max(3).optional(),
        middles: z.array(z.number().int().min(0).max(3)).optional(),
      })
      .strict()
      .optional(),
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

export type CreateFudabaCardInput = z.input<typeof fudabaCardCreateSchema> & {
  /** First page of the ordered artwork list. */
  front: File
  /** Last page; single-sided cards have none. */
  back?: File | undefined
  /** Everything between the front and the back, in display order. */
  images?: readonly File[] | undefined
  rotations?: { front?: number; back?: number; middles?: number[] } | undefined
}

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
  q,
  city,
  series,
  open,
  limit = 12,
  cursor,
}: FudabaOfficePageRequest) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (q?.trim()) params.set("q", q.trim())
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
  q?: string
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

/**
 * The same series catalog, for surfaces that only hold a backoffice session:
 * the route accepts an anonymous caller, so no platform token is attached.
 */
export function getPublicFudabaSeries() {
  return apiClient.Get(
    exchangePath("/series"),
    parsed(fudabaSeriesListSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      cacheFor: STABLE_CONTENT_CACHE_FOR,
      select: normalizeFudabaSeriesList,
    })
  )
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
      // Main map and dialog picker own independent cancellation lifecycles.
      shareRequest: false,
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

export function createAdminFudabaMapSource(source: FudabaMapSourceWrite) {
  return adminApiClient.Post(
    adminExchangePath("/map-delivery/sources"),
    source,
    parsed(fudabaMapDeliveryMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminFudabaMapSource(
  sourceId: string,
  source: FudabaMapSourceWrite
) {
  return adminApiClient.Put(
    adminExchangePath(`/map-delivery/sources/${encodeURIComponent(sourceId)}`),
    source,
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
  revision: string | null,
  routing?: FudabaMapRouting | null
) {
  return adminApiClient.Put(
    adminExchangePath("/map-delivery/active"),
    { sourceId, revision, ...(routing === undefined ? {} : { routing }) },
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
      shareRequest: false,
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function reverseFudabaPlace(input: FudabaPlaceReverseQuery) {
  const point = fudabaPlaceReverseQuerySchema.parse(input)
  return platformApiClient.Get(
    withQuery(
      exchangePath("/places/reverse"),
      new URLSearchParams({
        longitude: String(point.longitude),
        latitude: String(point.latitude),
      })
    ),
    parsed(fudabaPlaceReverseResponseSchema, {
      shareRequest: false,
      cacheFor: 0,
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

/**
 * 属主清单的布局（分组 / 顺序 / 快速清单），服务端已归一。
 *
 * 只影响展示，所以调用方在失败时退化成「只有默认分组」，不要让它拖垮整个工作区。
 */
export function getCardLayout() {
  return platformApiClient.Get(
    exchangeMyCardsLayoutPath(),
    parsed(namecardCardLayoutSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

/**
 * 选卡窗口的候选：自己**全部** `published` 的名片（含 `manual` / `none`），
 * `selected` 标记它是否在快速交换清单里。
 *
 * 带 `target` 或 `targetCard` 时接口叠加对方视角：逐卡 `targetOwns`（对方名片册里
 * 已有）与顶层 `targetMissingCount`（我有、对方还没有的张数）。目标未知 —— App
 * 出示二维码之前 —— 就不传，两个字段整份省略。`target` 认 uid / 主页 slug / 账号 ID；
 * `targetCard` 是目标的公开卡号（名片墙只剩卡号可用）。两者互斥，服务端会拒绝同时传。
 */
export function getExchangeCandidates({
  target,
  targetCard,
}: { target?: string; targetCard?: number } = {}) {
  const query = new URLSearchParams()
  if (target) query.set("target", target)
  if (targetCard !== undefined) query.set("targetCard", String(targetCard))
  const search = query.toString()
  const path = search
    ? `${exchangeMyQuickPath()}?${search}`
    : exchangeMyQuickPath()
  return platformApiClient.Get(
    path,
    parsed(namecardQuickSettingsSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
      select: normalizeNamecardQuickSettings,
    })
  )
}

/**
 * 整份保存属主清单：布局 + 快速清单 + 批量字段差异，一次原子写（§4.2）。
 *
 * 服务端返回归一后的布局（含它分配的 `group.id` 与 `limit`），调用方直接用它覆盖本地草稿，
 * 不要在前端复算顺序。
 */
export function putCardLayout(input: NamecardCardLayoutRequest) {
  const submission = namecardCardLayoutRequestSchema.parse(input)
  return platformApiClient.Put(
    exchangeMyCardsLayoutPath(),
    submission,
    parsed(namecardCardLayoutSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/** 一次交换的请求体：本轮幂等锚点 + 我交出的名片编号（0 张也合法）。 */
export interface ExchangeCommitInput {
  clientExchangeId: string
  giveCardNumbers: readonly number[]
}

/**
 * 三条交换写路径共用的请求：编号在轮次内复用（离线重放靠同一锚点幂等），
 * 所以 `clientExchangeId` 由调用方保管，这里只负责按线上契约发出去。
 *
 * 目标为 `none` 的卡回 409「这张名片不接受交换」，由调用方直出后端文案。
 */
function postExchangeCommit(path: string, input: ExchangeCommitInput) {
  const submission = namecardExchangeCommitSchema.parse({
    clientExchangeId: input.clientExchangeId,
    giveCardNumbers: [...input.giveCardNumbers],
  })
  return platformApiClient.Post(
    path,
    submission,
    parsed(namecardExchangeResultSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/** 名片墙 / 主页的详情窗：直接向对方的一张名片发起交换。 */
export function requestCardExchange(
  cardNumber: number,
  input: ExchangeCommitInput
) {
  return postExchangeCommit(exchangeCardRequestPath(cardNumber), input)
}

/** 单卡分享页 `/exchange/card/<slug>`：收下这张卡并把我的名片交出去。 */
export function commitCardShare(slug: string, input: ExchangeCommitInput) {
  return postExchangeCommit(exchangeCardShareCommitPath(slug), input)
}

/** 快速清单分享页 `/exchange/<handle>`：一次收下对方清单里的全部名片。 */
export function commitQuickExchange(
  handle: string,
  input: ExchangeCommitInput
) {
  return postExchangeCommit(exchangeQuickCommitPath(handle), input)
}

/** 单向送片的请求体：字段名是 `cardNumbers`，与其它交换的 `giveCardNumbers` 不同。 */
export interface GiftCardsInput {
  clientExchangeId: string
  cardNumbers: readonly number[]
}

/**
 * 他人主页的【发送名片】：把我选中的名片直接放进对方名片册，对方无需确认。
 *
 * 路由 `/exchange/users/:accountId/gift` 只有 API 侧的契约（`namecardExchangeGiftSchema`），
 * 所以路径用 `exchangePath` 拼；响应与其它交换共用 `namecardExchangeResultSchema`。
 */
export function giftCards(accountId: string, input: GiftCardsInput) {
  const submission = namecardExchangeGiftSchema.parse({
    clientExchangeId: input.clientExchangeId,
    cardNumbers: [...input.cardNumbers],
  })
  return platformApiClient.Post(
    exchangePath(`users/${encodeURIComponent(accountId)}/gift`),
    submission,
    parsed(namecardExchangeResultSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/**
 * 出示方开一个扫码会话：拿到的 `token` 就是二维码内容，对方扫码后由对方提交。
 *
 * 只登记「本轮交出哪几张」，不写交换记录；真正的交换发生在扫码端 commit 时。
 */
export function createScanSession(cardNumbers: readonly number[]) {
  const submission = namecardScanSessionRequestSchema.parse({
    cardNumbers: [...cardNumbers],
  })
  return platformApiClient.Post(
    exchangeScanSessionPath(),
    submission,
    parsed(namecardScanSessionSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/**
 * 扫码方提交：把扫到的令牌换成一次交换。
 *
 * 出示方在会话里已经登记了要交出的名片，这里只补「我给出哪几张」；
 * `clientExchangeId` 由调用方保管，重放沿用同一锚点时后端拿回同一条记录。
 */
export function commitScanSession(token: string, input: ExchangeCommitInput) {
  return postExchangeCommit(exchangeScanCommitPath(token), input)
}

/**
 * 出示方轮询会话状态（`active` / `expired` / `committed`）。
 *
 * 只有创建者能读；`exchangeId` 仅在 `committed` 后给值，前端只需要状态与到期时间。
 */
export function getScanSession(token: string) {
  return platformApiClient.Get(
    `${exchangeScanSessionPath()}/${encodeURIComponent(token)}`,
    parsed(namecardScanSessionStatusResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
    })
  )
}

/**
 * 属主某张名片的分享短链（懒加载：只在点「分享」时调一次）。
 *
 * 只读语义但会为该卡补一行短链（幂等），所以走平台身份、不带 CSRF；
 * 卡片不存在或不属于自己时 404。
 */
export function getCardShareLink(cardNumber: number | string) {
  return platformApiClient.Get(
    exchangePath(
      `/me/cards/${encodeURIComponent(String(cardNumber))}/share-link`
    ),
    parsed(namecardCardShareLinkSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformAuth(),
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
  form.append("isGroupCard", String(fields.isGroupCard ?? false))
  form.append("producerReading", fields.producerReading ?? "")
  form.append("seriesCodes", JSON.stringify(fields.seriesCodes))
  form.append(
    "favoriteCharacterIds",
    JSON.stringify(fields.favoriteCharacterIds)
  )
  form.append("bio", fields.bio)
  form.append("tradeNote", fields.tradeNote)
  form.append("exchangeMode", fields.exchangeMode)
  form.append("madeOn", fields.madeOn ?? "")
  form.append("groupName", fields.groupName ?? "")
  form.append("isOriginal", String(fields.isOriginal))
  form.append("madeWithAi", String(fields.madeWithAi))
  form.append("visible", String(fields.visible))
  form.append("credits", JSON.stringify(fields.credits))
  // 标签随保存一起提交，multipart 里是 JSON 字符串；没填就整个省略。
  if (fields.tags) form.append("tags", JSON.stringify(fields.tags))
}

export function createFudabaCard(input: CreateFudabaCardInput) {
  const {
    front,
    back,
    images = [],
    rotations,
    ...fields
  } = fudabaCardCreateSchema.parse(input)
  const form = new FormData()
  appendCardFields(form, fields)
  form.append("front", front)
  if (back) form.append("back", back)
  for (const image of images) form.append("images", image)
  if (rotations) form.append("rotations", JSON.stringify(rotations))
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

/**
 * Replaces the whole ordered artwork set of one card in a single request. Slot 0
 * is the front, slot 1 the back and the rest are the middle pages, so a submit
 * can replace an image, reorder the set and move a page across roles at once —
 * the editor keeps every local change until the owner presses save.
 *
 * `order` never carries object keys: `#i` keeps the image the card already has
 * at slot i (in the order the API returned them), `@n` is the n-th uploaded file.
 */
export function replaceFudabaCardMedia(
  cardId: string,
  input: {
    images: readonly File[]
    order: readonly string[]
    rotations?: { front?: number; back?: number; middles?: number[] }
  },
  expectedRevision: number
) {
  const revision = fudabaRevisionSchema.parse(expectedRevision)
  const form = new FormData()
  for (const image of input.images) form.append("images", image)
  form.append("order", JSON.stringify(input.order))
  if (input.rotations) form.append("rotations", JSON.stringify(input.rotations))
  form.append("expectedRevision", String(revision))
  return platformApiClient.Put(
    exchangePath(`/me/cards/${encodeURIComponent(cardId)}/media`),
    form,
    parsed(fudabaCardMutationResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
      select: normalizeFudabaCardMutation,
    })
  )
}

/**
 * 标签候选（公开）：只回预设标签，名称/别名包含即命中、前缀优先；自由标签
 * 由用户输入的原文直接创建，所以不进候选。
 */
export function getNamecardTagSuggestions(query: string, limit = 8) {
  const request = namecardTagSuggestQuerySchema.parse({ q: query, limit })
  const params = new URLSearchParams({ limit: String(request.limit) })
  if (request.q) params.set("q", request.q)
  return apiClient.Get(
    `${apiPath("/cards/tags/suggest")}?${params.toString()}`,
    parsed(namecardTagSuggestResponseSchema, {
      errorSchema: namecardTagSuggestFailureSchema,
      businessErrorSchema: namecardTagSuggestFailureSchema,
      // 预设会随管理台改名/合并变化，候选不做客户端缓存。
      cacheFor: NO_CLIENT_CACHE,
    })
  )
}

/**
 * 墙 / 详情窗的内联标签保存：整组替换、即时生效。这条写入口只要登录会话，
 * 因此不带 CSRF（见后端路由注释）。
 */
export function setNamecardCardTags(cardId: string, tags: readonly string[]) {
  const params = namecardTagCardParamsSchema.parse({ cardId })
  const submission = namecardTagSetRequestSchema.parse({ tags })
  return platformApiClient.Put(
    exchangePath(`/cards/${encodeURIComponent(params.cardId)}/tags`),
    submission,
    parsed(namecardTagSetResponseSchema, {
      errorSchema: namecardTagErrorSchema,
      businessErrorSchema: namecardTagErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

/**
 * 标签提交前自检：命中屏蔽词时编辑器即时提示并丢弃草稿。
 * 匿名可调用，响应只含被命中的原文，不暴露规则。
 */
export function validateNamecardTags(names: readonly string[]) {
  const body = namecardTagValidateRequestSchema.parse({ names })
  return apiClient.Post(
    apiPath("/cards/tags/validate"),
    body,
    parsed(namecardTagValidateResponseSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
    })
  )
}

/** Wall readers report a published card; the backoffice queue answers it. */
export function reportFudabaCardFeedback(
  cardId: string,
  input: { reason: NamecardFeedbackReason; detail: string | null }
) {
  return platformApiClient.Post(
    exchangePath(`/cards/${encodeURIComponent(cardId)}/feedback`),
    createNamecardFeedbackRequestSchema.parse(input),
    parsed(namecardFeedbackMutationSchema, {
      errorSchema: fudabaErrorResponseSchema,
      businessErrorSchema: fudabaErrorResponseSchema,
      meta: withPlatformCsrf(),
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
