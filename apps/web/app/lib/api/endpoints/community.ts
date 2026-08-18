import { z } from "@imsweb/contracts/z"

import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
} from "../cache-policy"
import { apiClient } from "../client"

import {
  namecardPageSchema,
  namecardSubmissionResponseSchema,
  reactionSchema,
  uploadNamecardResponseSchema,
  withdrawNamecardResponseSchema,
} from "@imsweb/contracts/namecards"

export * from "@imsweb/contracts/namecards"

import type {
  NamecardPage,
  NamecardReactions,
  UploadNamecardResponse,
} from "@imsweb/contracts/namecards"

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
  return apiClient.Get<NamecardPage, unknown>("/api/cards", {
    cacheFor: NO_CLIENT_CACHE,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.community,
    params: { page, size },
    transform: (payload) => namecardPageSchema.parse(payload),
  })
}

export function getNamecardReactions(cardId: number) {
  return apiClient.Get<NamecardReactions, unknown>("/api/reactions", {
    params: { id: cardId },
    transform: (payload) => reactionSchema.parse(payload),
  })
}

export function addNamecardReaction(cardId: number, emoji: string) {
  return apiClient.Post<{ ok: true }, unknown>("/api/reactions", {
    id: cardId,
    emoji,
  })
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
  return apiClient.Post<UploadNamecardResponse, unknown>(
    "/api/uploadNameCard",
    form,
    { transform: (payload) => uploadNamecardResponseSchema.parse(payload) }
  )
}

export function getNamecardSubmission(id: number, withdrawalToken: string) {
  return apiClient.Get<
    z.infer<typeof namecardSubmissionResponseSchema>,
    unknown
  >(`/api/namecards/submissions/${id}`, {
    headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
    transform: (payload) => namecardSubmissionResponseSchema.parse(payload),
  })
}

export function withdrawNamecardSubmission(
  id: number,
  withdrawalToken: string,
  expectedRevision: number
) {
  return apiClient.Post<
    z.infer<typeof withdrawNamecardResponseSchema>,
    unknown
  >(
    `/api/namecards/submissions/${id}/withdraw`,
    { expected_revision: expectedRevision },
    {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
      transform: (payload) => withdrawNamecardResponseSchema.parse(payload),
    }
  )
}
