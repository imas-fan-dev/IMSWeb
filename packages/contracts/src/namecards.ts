import { z } from "zod"
import { numberedPageInfoSchema, successEnvelope } from "./common.js"

export const cardIdSchema = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  .transform(Number)

export const namecardIdolSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1),
    seriesCode: z.string().min(1),
  })
  .strict()

export const namecardMetadataSchema = {
  seriesCode: z.string().min(1).nullable().default(null),
  favoriteIdols: z.array(namecardIdolSchema).max(20).default([]),
  claimStatus: z.enum(["unclaimed", "pending", "claimed"]).default("unclaimed"),
  viewerClaimState: z
    .enum(["pending", "approving", "approved", "rejected", "cancelled"])
    .nullable()
    .default(null),
}

export const namecardSchema = z.object({
  id: cardIdSchema,
  ...namecardMetadataSchema,
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  image1_thumbnail_url: z.string().min(1),
  image2_thumbnail_url: z.string().min(1),
  status: z.string().optional(),
  created_at: z.string().nullable().optional(),
})

export const namecardPageSchema = z.object({
  list: z.array(namecardSchema),
  total: z.number().int().nonnegative(),
  totalPage: z.number().int().nonnegative(),
})

export const reactionSchema = z.record(z.string(), z.number().int().nonnegative())
export const namecardSubmissionStatusSchema = z.enum([
  "pending",
  "approving",
  "approved",
  "rejected",
  "withdrawn",
])

export const namecardSubmissionSchema = z.object({
  id: cardIdSchema,
  ...namecardMetadataSchema,
  status: namecardSubmissionStatusSchema,
  revision: z.number().int().nonnegative(),
  image1_url: z.string().min(1).optional(),
  image2_url: z.string().min(1).optional(),
  created_at: z.string().nullable().optional(),
  withdrawn_at: z.string().nullable().optional(),
})

export const uploadNamecardResponseSchema = z.object({
  msg: z.string().min(1),
  submission: namecardSubmissionSchema,
  withdrawalToken: z.string().min(32),
})

export const namecardSubmissionResponseSchema = z.object({
  submission: namecardSubmissionSchema,
})

export const withdrawNamecardResponseSchema = successEnvelope({
  submission: namecardSubmissionSchema,
})


export type Namecard = z.infer<typeof namecardSchema>
export type NamecardPage = z.infer<typeof namecardPageSchema>
export type NamecardReactions = z.infer<typeof reactionSchema>
export type NamecardSubmission = z.infer<typeof namecardSubmissionSchema>
export type NamecardSubmissionStatus = z.infer<typeof namecardSubmissionStatusSchema>
export type UploadNamecardResponse = z.infer<typeof uploadNamecardResponseSchema>

export const adminNamecardSchema = z.object({
  id: z
    .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
    .pipe(z.coerce.number().int().positive()),
  image1_url: z.string().min(1),
  image2_url: z.string().min(1),
  status: z.string(),
  revision: z.coerce.number().int().nonnegative(),
})

export const adminNamecardListSchema = successEnvelope({
  data: z.array(adminNamecardSchema),
  pageInfo: numberedPageInfoSchema,
})

export type AdminNamecard = z.infer<typeof adminNamecardSchema>

export type AdminNamecardList = z.infer<typeof adminNamecardListSchema>

export type NamecardInput = z.input<typeof namecardSchema>

export type NamecardIdolInput = z.input<typeof namecardIdolSchema>

export type NamecardPageInput = z.input<typeof namecardPageSchema>

export type NamecardSubmissionInput = z.input<typeof namecardSubmissionSchema>

export type UploadNamecardReceiptInput = z.input<typeof uploadNamecardResponseSchema>

export type NamecardSubmissionDetailInput = z.input<
  typeof namecardSubmissionResponseSchema
>

export type WithdrawNamecardInput = z.input<typeof withdrawNamecardResponseSchema>

export type AdminNamecardInput = z.input<typeof adminNamecardSchema>

export type AdminNamecardListInput = z.input<typeof adminNamecardListSchema>

export const adminNamecardMutationSchema = successEnvelope({
  revision: z.number().int().nonnegative(),
})

export const reactionMutationSchema = z.object({ ok: z.literal(true) })

export type AdminNamecardMutation = z.infer<typeof adminNamecardMutationSchema>

export type ReactionMutation = z.infer<typeof reactionMutationSchema>
