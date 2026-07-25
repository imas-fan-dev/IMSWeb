import { z } from "zod"

import { apiClient } from "../client"

const cardIdSchema = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  .transform(Number)

export const namecardSchema = z.object({
  id: cardIdSchema,
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  status: z.string().optional(),
  created_at: z.string().nullable().optional(),
})

const namecardPageSchema = z.object({
  list: z.array(namecardSchema),
  total: z.number().int().nonnegative(),
  totalPage: z.number().int().nonnegative(),
})

const reactionSchema = z.record(z.string(), z.number().int().nonnegative())
const messageSchema = z.object({ msg: z.string().min(1) })

export type Namecard = z.infer<typeof namecardSchema>
export type NamecardPage = z.infer<typeof namecardPageSchema>
export type NamecardReactions = z.infer<typeof reactionSchema>

export function getNamecardPage(page = 1, size = 12) {
  return apiClient.Get<NamecardPage, unknown>("/api/cards", {
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
  return apiClient.Post<z.infer<typeof messageSchema>, unknown>(
    "/api/uploadNameCard",
    form,
    { transform: (payload) => messageSchema.parse(payload) }
  )
}
