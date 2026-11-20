import type { PlatformAccountLink } from "@imsweb/contracts/namecards"
import {
  apiPath,
  exchangeCardSharePath,
  exchangeDecisionPath,
  exchangeMyCollectionEntryPath,
  exchangeMyCollectionPath,
  exchangeMyHistoryPath,
  exchangePath,
  exchangeQuickPath,
  namecardPath,
} from "@imsweb/contracts/paths"
import {
  namecardCollectionOwnersSchema,
  namecardCollectionPageSchema,
  namecardCollectionVisibilityResponseSchema,
  namecardCardShareSchema,
  namecardErrorResponseSchema,
  namecardExchangeDecisionSchema,
  namecardExchangeDetailSchema,
  namecardExchangeHistoryPageSchema,
  namecardExchangeHistoryQuerySchema,
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
  normalizeNamecardCollectionOwners,
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

/**
 * 公开名片墙的筛选：与名片册共用控件，但排序键是墙的 `created` 系。
 * 墙不认 owner / includeOwn / includeHidden。
 */
export interface NamecardWallListFilters {
  sort?: "created" | "name" | "series" | "date"
  dir?: NamecardCollectionDirection
  q?: string
  series?: readonly string[]
  group?: string
  character?: readonly number[]
  /** 标签筛选：重复参数，词之间 OR（服务端最多 5 个）。 */
  tags?: readonly string[]
  /** `all` = 【同时包含】。 */
  match?: "any" | "all"
  excludeOther?: boolean
  excludeCross?: boolean
  declaration?: "original" | "ai"
  /** 【反向排除】：把内容条件整体取反。 */
  invert?: boolean
}

function namecardWallSearch(
  page: number,
  size: number,
  filters: NamecardWallListFilters
) {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
  })
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.dir) params.set("dir", filters.dir)
  const q = filters.q?.trim()
  if (q) params.set("q", q)
  for (const code of filters.series ?? []) params.append("series", code)
  const group = filters.group?.trim()
  if (group) params.set("group", group)
  for (const id of filters.character ?? []) {
    params.append("character", String(id))
  }
  // 重复键：服务端按 OR 组合，每个词一个 EXISTS。
  for (const tag of filters.tags ?? []) params.append("tags", tag)
  if (filters.match) params.set("match", filters.match)
  if (filters.excludeOther) params.set("excludeOther", "true")
  if (filters.excludeCross) params.set("excludeCross", "true")
  if (filters.declaration) params.set("declaration", filters.declaration)
  if (filters.invert) params.set("invert", "true")
  return params.toString()
}

export function getNamecardPage(
  page = 1,
  size = 12,
  filters: NamecardWallListFilters = {}
) {
  return apiClient.Get(
    `${apiPath("/cards")}?${namecardWallSearch(page, size, filters)}`,
    parsed(namecardPageSchema, {
      errorSchema: namecardErrorResponseSchema,
      businessErrorSchema: namecardListErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
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
  /** 所属用户：卡主的平台账号 id。 */
  owner?: string
  /** `all` = 【同时包含】。 */
  match?: "any" | "all"
  /** 创作声明：`original` / `ai`，缺省不限。 */
  declaration?: "original" | "ai"
  /** 【反向排除】：把内容条件整体取反。 */
  invert?: boolean
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
  const owner = query.owner?.trim()
  if (owner) params.set("owner", owner)
  for (const id of query.character ?? []) {
    params.append("character", String(id))
  }
  params.set("match", query.match ?? "any")
  if (query.excludeOther) params.set("excludeOther", "true")
  if (query.excludeCross) params.set("excludeCross", "true")
  if (query.declaration) params.set("declaration", query.declaration)
  if (query.invert) params.set("invert", "true")
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

/**
 * 名片册「所属用户」选择器：只返回自己册内出现过的卡主与自己，按昵称搜索。
 *
 * 范围由后端钉死，前端不做二次过滤；头像地址按其它账号头像同一口径归一。
 */
export function getNamecardCollectionOwners(
  query: { q?: string; limit?: number } = {}
) {
  const q = query.q?.trim()
  return platformApiClient.Get(
    `${exchangeMyCollectionPath()}/owners`,
    parsed(namecardCollectionOwnersSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      meta: withPlatformAuth(),
      params: { ...(q ? { q } : {}), limit: query.limit ?? 20 },
      select: normalizeNamecardCollectionOwners,
    })
  )
}

/**
 * 交换记录：发起与收到都算一条，服务端按创建时间倒序分页。
 *
 * 只翻服务端记录；本机待重放的扫码交换由离线队列单独提供，页面自己合并置顶。
 */
export function getExchangeHistory(
  query: { page?: number; size?: number } = {}
) {
  const params = namecardExchangeHistoryQuerySchema.parse(query)
  return platformApiClient.Get(
    exchangeMyHistoryPath(),
    parsed(namecardExchangeHistoryPageSchema, {
      errorSchema: namecardErrorResponseSchema,
      cacheFor: NO_CLIENT_CACHE,
      meta: withPlatformAuth(),
      params,
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
function decideExchange(exchangeId: string, decision: "accept" | "decline") {
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
