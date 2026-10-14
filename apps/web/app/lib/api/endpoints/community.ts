import { apiPath } from "@imsweb/contracts/paths"
import {
  namecardErrorResponseSchema,
  namecardListErrorResponseSchema,
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

import { namecardPageSchema, reactionSchema } from "@imsweb/contracts/namecards"

export {
  cardIdSchema,
  namecardIdolSchema,
  namecardMetadataSchema,
  namecardSchema,
  namecardPageSchema,
  reactionSchema,
  adminNamecardSchema,
  adminNamecardListSchema,
  adminNamecardMutationSchema,
  reactionMutationSchema,
} from "@imsweb/contracts/namecards"
export type * from "@imsweb/contracts/namecards"

export const NAMECARD_REACTIONS = NAMECARD_REACTION_EMOJIS

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
