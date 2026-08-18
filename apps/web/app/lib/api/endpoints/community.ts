import { reactionMutationSchema } from "@imsweb/contracts/namecards"

import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
} from "../cache-policy"
import { parsed } from "../parsed"
import { apiClient } from "../client"

import {
  namecardPageSchema,
  namecardSubmissionResponseSchema,
  reactionSchema,
  uploadNamecardResponseSchema,
  withdrawNamecardResponseSchema,
} from "@imsweb/contracts/namecards"

export * from "@imsweb/contracts/namecards"

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
    "/api/cards",
    parsed(namecardPageSchema, {
      cacheFor: NO_CLIENT_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
      params: { page, size },
    })
  )
}

export function getNamecardReactions(cardId: number) {
  return apiClient.Get(
    "/api/reactions",
    parsed(reactionSchema, {
      params: { id: cardId },
    })
  )
}

export function addNamecardReaction(cardId: number, emoji: string) {
  return apiClient.Post(
    "/api/reactions",
    { id: cardId, emoji },
    parsed(reactionMutationSchema)
  )
}

export function uploadNamecard(
  front: File,
  back: File,
  metadata: { seriesCode: string; favoriteIdolIds: number[] }
) {
  const form = new FormData()
  form.append("images", front)
  form.append("images", back)
  form.append("seriesCode", metadata.seriesCode)
  form.append("favoriteIdolIds", JSON.stringify(metadata.favoriteIdolIds))
  return apiClient.Post(
    "/api/uploadNameCard",
    form,
    parsed(uploadNamecardResponseSchema)
  )
}

export function getNamecardSubmission(id: number, withdrawalToken: string) {
  return apiClient.Get(
    `/api/namecards/submissions/${id}`,
    parsed(namecardSubmissionResponseSchema, {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
    })
  )
}

export function withdrawNamecardSubmission(
  id: number,
  withdrawalToken: string,
  expectedRevision: number
) {
  return apiClient.Post(
    `/api/namecards/submissions/${id}/withdraw`,
    { expected_revision: expectedRevision },
    parsed(withdrawNamecardResponseSchema, {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
    })
  )
}
