import { z } from "zod"
import { successEnvelope } from "../common.js"
import {
  fudabaIdolSelectionSchema,
  fudabaRevisionSchema,
  publicMediaUrlSchema,
  seriesCodeSchema,
  timestampSchema,
} from "./index.js"

export const fudabaGuestSubmissionIdSchema = z.number().int().positive()

export const fudabaGuestSubmissionStatusSchema = z.enum([
  "pending",
  "approving",
  "published",
  "rejected",
  "withdrawn",
])

export const fudabaGuestSubmissionSummarySchema = z
  .object({
    id: fudabaGuestSubmissionIdSchema,
    publicationStatus: fudabaGuestSubmissionStatusSchema,
    revision: fudabaRevisionSchema,
  })
  .strict()

export const fudabaGuestSubmissionSchema = fudabaGuestSubmissionSummarySchema
  .extend({
    seriesCode: seriesCodeSchema.nullable(),
    favoriteIdols: z.array(fudabaIdolSelectionSchema).max(20),
    frontImageUrl: publicMediaUrlSchema,
    backImageUrl: publicMediaUrlSchema,
    createdAt: timestampSchema.nullable(),
  })
  .strict()

export const fudabaGuestSubmissionReceiptSchema = successEnvelope({
  message: z.string().trim().min(1),
  submission: fudabaGuestSubmissionSummarySchema,
  withdrawalToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const fudabaGuestSubmissionDetailSchema = successEnvelope({
  submission: fudabaGuestSubmissionSchema,
}).strict()

export const fudabaGuestSubmissionWithdrawalSchema = successEnvelope({
  submission: fudabaGuestSubmissionSchema,
}).strict()

export type FudabaGuestSubmissionStatus = z.infer<
  typeof fudabaGuestSubmissionStatusSchema
>
export type FudabaGuestSubmissionSummary = z.infer<
  typeof fudabaGuestSubmissionSummarySchema
>
export type FudabaGuestSubmission = z.infer<typeof fudabaGuestSubmissionSchema>
export type FudabaGuestSubmissionReceipt = z.infer<
  typeof fudabaGuestSubmissionReceiptSchema
>
export type FudabaGuestSubmissionDetail = z.infer<
  typeof fudabaGuestSubmissionDetailSchema
>
export type FudabaGuestSubmissionWithdrawal = z.infer<
  typeof fudabaGuestSubmissionWithdrawalSchema
>

export type FudabaGuestSubmissionInput = z.input<
  typeof fudabaGuestSubmissionSchema
>
export type FudabaGuestSubmissionReceiptInput = z.input<
  typeof fudabaGuestSubmissionReceiptSchema
>
export type FudabaGuestSubmissionDetailInput = z.input<
  typeof fudabaGuestSubmissionDetailSchema
>
export type FudabaGuestSubmissionWithdrawalInput = z.input<
  typeof fudabaGuestSubmissionWithdrawalSchema
>
