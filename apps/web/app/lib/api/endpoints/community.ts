import { z } from "zod"

import {
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
} from "../cache-policy"
import { apiClient } from "../client"

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

const cardIdSchema = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  .transform(Number)

export const namecardSchema = z.object({
  id: cardIdSchema,
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  image1_thumbnail_url: z.string().min(1),
  image2_thumbnail_url: z.string().min(1),
  status: z.string().optional(),
  created_at: z.string().nullable().optional(),
})

const namecardPageSchema = z.object({
  list: z.array(namecardSchema),
  total: z.number().int().nonnegative(),
  totalPage: z.number().int().nonnegative(),
})

const reactionSchema = z.record(z.string(), z.number().int().nonnegative())
const namecardSubmissionStatusSchema = z.enum([
  "pending",
  "approving",
  "approved",
  "rejected",
  "withdrawn",
])

const namecardSubmissionSchema = z.object({
  id: cardIdSchema,
  status: namecardSubmissionStatusSchema,
  revision: z.number().int().nonnegative(),
  image1_url: z.string().min(1).optional(),
  image2_url: z.string().min(1).optional(),
  created_at: z.string().nullable().optional(),
  withdrawn_at: z.string().nullable().optional(),
})

const uploadNamecardResponseSchema = z.object({
  msg: z.string().min(1),
  submission: namecardSubmissionSchema,
  withdrawalToken: z.string().min(32),
})

const namecardSubmissionResponseSchema = z.object({
  submission: namecardSubmissionSchema,
})

const withdrawNamecardResponseSchema = z.object({
  success: z.literal(true),
  submission: namecardSubmissionSchema,
})

const namecardResubmitResponseSchema = z.object({
  success: z.literal(true),
  submission: namecardSubmissionSchema,
})

export type Namecard = z.infer<typeof namecardSchema>
export type NamecardPage = z.infer<typeof namecardPageSchema>
export type NamecardReactions = z.infer<typeof reactionSchema>
export type NamecardSubmission = z.infer<typeof namecardSubmissionSchema>
export type NamecardSubmissionStatus = z.infer<
  typeof namecardSubmissionStatusSchema
>
export type UploadNamecardResponse = z.infer<
  typeof uploadNamecardResponseSchema
>

export function getNamecardPage(page = 1, size = 12) {
  return apiClient.Get<NamecardPage, unknown>("/api/cards", {
    cacheFor: PUBLIC_QUERY_CACHE_FOR,
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

export function uploadNamecard(front: File, back: File) {
  const form = new FormData()
  form.append("images", front)
  form.append("images", back)
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

export function replaceNamecardSubmissionImage(
  id: number,
  withdrawalToken: string,
  side: "front" | "back",
  expectedRevision: number,
  file: File
) {
  const form = new FormData()
  form.append("image", file)
  return apiClient.Post<
    z.infer<typeof namecardResubmitResponseSchema>,
    unknown
  >(
    `/api/namecards/submissions/${id}/images/${side}?expected_revision=${expectedRevision}`,
    form,
    {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
      transform: (payload) => namecardResubmitResponseSchema.parse(payload),
    }
  )
}

export function resubmitNamecardSubmission(
  id: number,
  withdrawalToken: string,
  expectedRevision: number
) {
  return apiClient.Post<
    z.infer<typeof namecardResubmitResponseSchema>,
    unknown
  >(
    `/api/namecards/submissions/${id}/resubmit`,
    { expected_revision: expectedRevision },
    {
      headers: { "X-Namecard-Withdrawal-Token": withdrawalToken },
      transform: (payload) => namecardResubmitResponseSchema.parse(payload),
    }
  )
}
