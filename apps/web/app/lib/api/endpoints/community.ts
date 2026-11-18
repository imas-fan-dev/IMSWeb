import type { PlatformAccountLink } from "@imsweb/contracts/namecards"
import {
  apiPath,
  exchangeCardSharePath,
  exchangeDecisionPath,
  exchangeMyCollectionEntryPath,
  exchangeMyCollectionPath,
  exchangePath,
  exchangeQuickPath,
  namecardPath,
} from "@imsweb/contracts/paths"
import {
  namecardCollectionPageSchema,
  namecardCollectionVisibilityResponseSchema,
  namecardCardShareSchema,
  namecardErrorResponseSchema,
  namecardExchangeDecisionSchema,
  namecardExchangeDetailSchema,
  namecardListErrorResponseSchema,
  namecardQuickExchangeSchema,
  randomOwnerlessCardErrorSchema,
  randomOwnerlessCardSchema,
  publicNamecardResponseSchema,
  wallInsightsSchema,
  namecardContributorsSchema,
  namecardReactionListQuerySchema,
  namecardReactionRequestSchema,
  reactionMutationSchema,
} from "@imsweb/contracts/namecards"
import type {
  NamecardCollectionDirection,
  NamecardCollectionSort,
} from "@imsweb/contracts/namecards"
import { NAMECARD_REACTION_EMOJIS } from "@imsweb/contracts/fudaba/runtime"

import {
  NAMECARD_COLLECTION_DEFAULT_DIRECTION,
  NAMECARD_COLLECTION_PAGE_SIZE,
} from "../../namecards/collection-query"
import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
} from "../cache-policy"
import {
  normalizeNamecard,
  normalizeNamecardCollectionPage,
  normalizeNamecardPage,
} from "../media-urls"
import { parsed } from "../parsed"
import { apiClient } from "../client"
import { platformApiClient } from "../platform-client"
import { withPlatformAuth, withPlatformCsrf } from "../types"

import {
  namecardPageSchema,
  publicProfileSchema,
  reactionSchema,
} from "@imsweb/contracts/namecards"

export {
  cardIdSchema,
  namecardFavoriteCharacterSchema,
  namecardMetadataSchema,
  namecardSchema,
  namecardPageSchema,
  publicProfileSchema,
  reactionSchema,
  adminNamecardSchema,
  adminNamecardListSchema,
  adminNamecardMutationSchema,
  reactionMutationSchema,
} from "@imsweb/contracts/namecards"
export type * from "@imsweb/contracts/namecards"

export const NAMECARD_REACTIONS = NAMECARD_REACTION_EMOJIS

/** 名片墙顶部面板：进度、贡献榜前五与自己的名次。 */
export function getWallInsights() {
  return apiClient.Get(
    apiPath("/cards/wall-insights"),
    parsed(wallInsightsSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

export function getNamecardContributors(page = 1) {
  return apiClient.Get(
    apiPath("/cards/contributors"),
    parsed(namecardContributorsSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
      params: { page, limit: 25 },
    })
  )
}

/** 抽一张缺少企划的无主名片；池子空了返回 404 `FUDABA_NO_OWNERLESS_CARD`。 */
export function getRandomOwnerlessCard() {
  return apiClient.Get(
    apiPath("/cards/random-ownerless"),
    parsed(randomOwnerlessCardSchema, {
      errorSchema: randomOwnerlessCardErrorSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    })
  )
}

/** 用户主页：公开资料与本人名片分开取。 */
export function getPublicProfile(accountId: string) {
  return apiClient.Get(
    apiPath(`/users/${encodeURIComponent(accountId)}`),
    parsed(publicProfileSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
    })
  )
}

export function getProfileCards(accountId: string, page = 1, size = 24) {
  return apiClient.Get(
    apiPath(`/users/${encodeURIComponent(accountId)}/cards`),
    parsed(namecardPageSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      params: { page, size },
      select: normalizeNamecardPage,
    })
  )
}

/** 深链与随机补充：按编号取单张公开名片，当前分页里可能没有它。 */
export function getPublicCard(cardNumber: number) {
  return apiClient.Get(
    namecardPath(cardNumber),
    parsed(publicNamecardResponseSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
      select: (payload) => ({
        ...payload,
        card: payload.card ? normalizeNamecard(payload.card) : null,
      }),
    })
  )
}

export function getNamecardPage(page = 1, size = 12) {
  return apiClient.Get(
    apiPath("/cards"),
    parsed(namecardPageSchema, {
      errorSchema: namecardErrorResponseSchema,
      businessErrorSchema: namecardListErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
      params: { page, size },
      select: normalizeNamecardPage,
    })
  )
}

/** 名片册列表的查询：页面把筛选状态原样交进来，缺省值在这里补齐。 */
export interface NamecardCollectionListQuery {
  page?: number
  size?: number
  sort?: NamecardCollectionSort
  dir?: NamecardCollectionDirection
  /** 制作人名称；团体名片按团体名称检索。 */
  q?: string
  series?: readonly string[]
  group?: string
  character?: readonly number[]
  /** `all` = 【同时包含】。 */
  match?: "any" | "all"
  excludeOther?: boolean
  excludeCross?: boolean
  includeOwn?: boolean
  includeHidden?: boolean
}

function namecardCollectionSearch(query: NamecardCollectionListQuery) {
  const sort = query.sort ?? "exchange"
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    size: String(query.size ?? NAMECARD_COLLECTION_PAGE_SIZE),
    sort,
    dir: query.dir ?? NAMECARD_COLLECTION_DEFAULT_DIRECTION[sort],
  })
  const q = query.q?.trim()
  if (q) params.set("q", q)
  for (const code of query.series ?? []) params.append("series", code)
  const group = query.group?.trim()
  if (group) params.set("group", group)
  for (const id of query.character ?? []) {
    params.append("character", String(id))
  }
  params.set("match", query.match ?? "any")
  if (query.excludeOther) params.set("excludeOther", "true")
  if (query.excludeCross) params.set("excludeCross", "true")
  if (query.includeOwn) params.set("includeOwn", "true")
  if (query.includeHidden) params.set("includeHidden", "true")
  return params.toString()
}

/**
 * 名片册（PRD §7.1）：分页 + 排序 + 搜索 + 高级筛选 + 两个开关。
 *
 * `series` / `character` 是重复键；alova 的 `params` 会把数组拼成 `a,b`，
 * 所以这里自己拼查询串。
 */
export function getNamecardCollectionPage(
  query: NamecardCollectionListQuery = {}
) {
  return platformApiClient.Get(
    `${exchangeMyCollectionPath()}?${namecardCollectionSearch(query)}`,
    parsed(namecardCollectionPageSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      meta: withPlatformAuth(),
      select: normalizeNamecardCollectionPage,
    })
  )
}

/** 手动隐藏 / 恢复名片册里的一条；隐藏后原卡改动仍然同步。 */
export function setNamecardCollectionHidden(
  cardNumber: number,
  hidden: boolean
) {
  return platformApiClient.Put(
    exchangeMyCollectionEntryPath(cardNumber),
    { hidden },
    parsed(namecardCollectionVisibilityResponseSchema, {
      errorSchema: namecardErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/**
 * 单卡分享页：卡片下架 / 未认领 / slug 不存在都回 404，页面按「这张名片当前不开放交换」处理。
 * 逐卡 `collected` 由接口按浏览者补齐（登录才带上）。
 */
export function getCardSharePage(slug: string) {
  return apiClient.Get(
    exchangeCardSharePath(slug),
    parsed(namecardCardShareSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      select: (payload) => ({
        ...payload,
        card: normalizeNamecard(payload.card),
      }),
    })
  )
}

/** 快速交换清单分享页：`handle` 可以是 uid、主页地址或账号 ID，找不到时 404。 */
export function getQuickExchangePage(handle: string) {
  return apiClient.Get(
    exchangeQuickPath(handle),
    parsed(namecardQuickExchangeSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      select: (payload) => ({
        ...payload,
        cards: payload.cards.map(normalizeNamecard),
      }),
    })
  )
}

/**
 * 通知窗口的交换详情：只有发起方或目标方能读，其它人一律 404。
 *
 * 两侧卡片是分享页同一份投影（`pages[].thumbUrl`），媒体地址在这里按同一口径
 * 归一 —— 窗口直接拿 `pages[].thumbUrl` 画 1:1 缩略图。
 */
export function getExchangeDetail(exchangeId: string) {
  return platformApiClient.Get(
    exchangePath(`exchanges/${encodeURIComponent(exchangeId)}`),
    parsed(namecardExchangeDetailSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      meta: withPlatformAuth(),
      select: (payload) => ({
        ...payload,
        targetCards: payload.targetCards.map(normalizeNamecard),
        initiatorCards: payload.initiatorCards.map(normalizeNamecard),
      }),
    })
  )
}

/** 同意或婉拒一笔交换：成功回 `completed` / `declined`；过期或已处理是 409。 */
function decideExchange(
  exchangeId: string,
  decision: "accept" | "decline"
) {
  return platformApiClient.Post(
    exchangeDecisionPath(exchangeId, decision),
    {},
    parsed(namecardExchangeDecisionSchema, {
      errorSchema: namecardErrorResponseSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function acceptExchange(exchangeId: string) {
  return decideExchange(exchangeId, "accept")
}

export function declineExchange(exchangeId: string) {
  return decideExchange(exchangeId, "decline")
}

export function getNamecardReactions(cardId: number) {
  const params = namecardReactionListQuerySchema.parse({ id: cardId })
  return apiClient.Get(
    apiPath("/reactions"),
    parsed(reactionSchema, {
      errorSchema: namecardErrorResponseSchema,
      params,
    })
  )
}

export function addNamecardReaction(cardId: number, emoji: string) {
  const submission = namecardReactionRequestSchema.parse({ id: cardId, emoji })
  return apiClient.Post(
    apiPath("/reactions"),
    submission,
    parsed(reactionMutationSchema, { errorSchema: namecardErrorResponseSchema })
  )
}

export type { PlatformAccountLink }
