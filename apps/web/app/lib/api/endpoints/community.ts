import { apiPath } from "@imsweb/contracts/paths"
import { reactionMutationSchema } from "@imsweb/contracts/namecards"

import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
} from "../cache-policy"
import {
  normalizeNamecardPage,
  normalizeNamecardSubmissionEnvelope,
} from "../media-urls"
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

export interface UploadNamecardMetadata {
  seriesCode: string
  favoriteIdolIds: number[]
  producerName?: string
  displayName?: string
  bio?: string
  accent?: string
}

export function uploadNamecard(
  front: File,
  back: File,
  metadata: UploadNamecardMetadata
) {
  const form = new FormData()
  form.append("images", front)
  form.append("images", back)
  form.append("seriesCode", metadata.seriesCode)
  form.append("favoriteIdolIds", JSON.stringify(metadata.favoriteIdolIds))
  // The submission stays anonymous, so these describe the card, not a person.
  for (const field of [
    "producerName",
    "displayName",
    "bio",
    "accent",
  ] as const) {
    const value = metadata[field]?.trim()
    if (value) form.append(field, value)
  }
  return apiClient.Post(
    apiPath("/uploadNameCard"),
    form,
    parsed(uploadNamecardResponseSchema, {
      select: normalizeNamecardSubmissionEnvelope,
    })
  )
}

export function getNamecardSubmission(id: number, withdrawalToken: string) {
  return apiClient.Get(
    apiPath(`/namecards/submissions/${id}`),
    parsed(namecardSubmissionResponseSchema, {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
      select: normalizeNamecardSubmissionEnvelope,
    })
  )
}

export function withdrawNamecardSubmission(
  id: number,
  withdrawalToken: string,
  expectedRevision: number
) {
  return apiClient.Post(
    apiPath(`/namecards/submissions/${id}/withdraw`),
    { expected_revision: expectedRevision },
    parsed(withdrawNamecardResponseSchema, {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
      select: normalizeNamecardSubmissionEnvelope,
    })
  )
}
