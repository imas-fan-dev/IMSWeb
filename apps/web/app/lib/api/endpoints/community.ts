import { apiPath } from "@imsweb/contracts/paths"
import { reactionMutationSchema } from "@imsweb/contracts/namecards"

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

export const NAMECARD_REACTIONS = [
  "❤️",
  "👍",
  "😂",
  "🤣",
  "😭",
  "😍",
  "🥰",
  "😘",
  "🤯",
  "😱",
  "😎",
  "🤩",
  "😤",
  "🙏",
  "👏",
  "✨",
  "💯",
  "🎉",
  "💥",
  "🌟",
  "🐵",
  "🐶",
  "🐱",
  "🦊",
  "🐼",
  "🐳",
  "🔥",
  "💀",
  "👀",
  "🍀",
  "🌈",
  "🐛",
  "💎",
  "🚀",
  "🏆",
  "🍕",
  "🍔",
  "🎮",
  "🌹",
  "🍭",
  "🔨",
  "🔫",
  "❓",
  "🧒",
  "😙",
  "🔘",
] as const

export function getNamecardPage(page = 1, size = 12) {
  return apiClient.Get(
    apiPath("/cards"),
    parsed(namecardPageSchema, {
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
      params: { page, size },
      select: normalizeNamecardPage,
    })
  )
}

export function getNamecardReactions(cardId: number) {
  return apiClient.Get(
    apiPath("/reactions"),
    parsed(reactionSchema, {
      params: { id: cardId },
    })
  )
}

export function addNamecardReaction(cardId: number, emoji: string) {
  return apiClient.Post(
    apiPath("/reactions"),
    { id: cardId, emoji },
    parsed(reactionMutationSchema)
  )
}
