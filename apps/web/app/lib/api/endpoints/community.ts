import type { PlatformAccountLink } from "@imsweb/contracts/namecards"
import { apiPath } from "@imsweb/contracts/paths"
import {
  namecardErrorResponseSchema,
  namecardListErrorResponseSchema,
  randomOwnerlessCardErrorSchema,
  randomOwnerlessCardSchema,
  wallInsightsSchema,
  namecardReactionListQuerySchema,
  namecardReactionRequestSchema,
  reactionMutationSchema,
} from "@imsweb/contracts/namecards"
import { NAMECARD_REACTION_EMOJIS } from "@imsweb/contracts/fudaba/runtime"

import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
} from "../cache-policy"
import { normalizeNamecardPage } from "../media-urls"
import { parsed } from "../parsed"
import { apiClient } from "../client"

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
