import { z } from "zod"
import { backofficeProtectedHttpErrorSchema, exactJsonError, successEnvelope, strictRequestObject } from "../common.js"
import { fudabaPublicOfficeLocationSchema } from "./index.js"

export { fudabaPublicOfficeLocationSchema } from "./index.js"

const timestampSchema = z.string().datetime({ offset: true })
const reviewStateSchema = z.enum(["pending", "published", "rejected"])
const revisionSchema = z.number().int().safe().nonnegative()

export const fudabaLocationReviewSchema = z
  .object({
    officeId: z.string().min(1).max(128),
    officeName: z.string().min(1),
    city: z.string().min(1),
    ownerAccountId: z.string().min(1),
    location: fudabaPublicOfficeLocationSchema,
    exactLocationConsentAt: timestampSchema.nullable(),
    reviewState: reviewStateSchema,
    revision: revisionSchema,
    submittedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
    reviewedBy: z.number().int().positive().nullable(),
    reviewNote: z.string().max(1000),
  })
  .strict()

export const fudabaLocationReviewListSchema = z
  .object({
    items: z.array(fudabaLocationReviewSchema),
  })
  .strict()

const fudabaReviewedLocationSchema = z
  .object({
    officeId: z.string().min(1).max(128),
    location: fudabaPublicOfficeLocationSchema,
    exactLocationConsentAt: timestampSchema.nullable(),
    reviewState: reviewStateSchema,
    revision: revisionSchema,
    submittedAt: timestampSchema,
    reviewedAt: timestampSchema.nullable(),
    reviewNote: z.string().max(1000),
  })
  .strict()

export const fudabaLocationReviewMutationSchema = successEnvelope({
    officeLocation: fudabaReviewedLocationSchema,
  })
  .strict()

export const fudabaLocationReviewQuerySchema = strictRequestObject({
  state: reviewStateSchema.optional(),
  limit: z.string().regex(/^[1-9]\d*$/).optional(),
})
export const fudabaLocationReviewOfficeParamsSchema = strictRequestObject({
  officeId: z.unknown(),
})
export const fudabaLocationReviewRequestSchema = z.object({
  decision: z.enum(["publish", "reject"]),
  expectedRevision: revisionSchema,
  note: z.string().trim().max(1000).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
}).strict().superRefine((value, context) => {
  if (value.decision === "reject" && !value.note) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "reject 必须填写 note", path: ["note"] })
  }
})
export const fudabaLocationReviewErrorSchema = z.union([
  exactJsonError({ error: z.string() }),
  exactJsonError({ success: z.literal(false), error: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string() }),
  exactJsonError({ success: z.literal(false), code: z.string(), revision: revisionSchema }),
  exactJsonError({ success: z.literal(false), code: z.string(), message: z.string() }),
])
export const fudabaAdminLocationReviewHttpErrorSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  fudabaLocationReviewErrorSchema,
])

export type FudabaLocationReviewState = z.infer<typeof reviewStateSchema>
export type FudabaLocationReview = z.infer<typeof fudabaLocationReviewSchema>
export type FudabaLocationReviewListResponse = z.infer<
  typeof fudabaLocationReviewListSchema
>
export type FudabaLocationReviewMutationResponse = z.infer<
  typeof fudabaLocationReviewMutationSchema
>
export type FudabaLocationReviewDecision = "publish" | "reject"
export type FudabaAdminLocationReviewHttpError = z.infer<
  typeof fudabaAdminLocationReviewHttpErrorSchema
>
