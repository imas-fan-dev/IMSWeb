import { z } from "zod";
import { successEnvelope } from "../common.js";
import { fudabaOwnerOfficeSchema } from "./index.js";
export {
  fudabaLocationReviewQuerySchema as adminOfficeReviewQuerySchema,
  fudabaAdminLocationReviewHttpErrorSchema as adminOfficeHttpErrorSchema,
} from "./location-review.js";

export const adminOfficeReviewRequestSchema = z
  .object({
    decision: z.enum(["publish", "reject", "withdraw"]),
    expectedRevision: z.number().int().safe().nonnegative(),
    note: z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === "reject" && !value.note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reject 必须填写 note",
        path: ["note"],
      });
    }
  });

export const adminOfficeReviewSchema = z
  .object({
    office: fudabaOwnerOfficeSchema,
    owner: z
      .object({
        id: z.string().min(1),
        email: z.string().nullable(),
        displayName: z.string().nullable(),
      })
      .strict(),
    reviewer: z
      .object({
        id: z.number().int().positive(),
        username: z.string().nullable(),
        displayName: z.string().nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const adminOfficeReviewListSchema = z
  .object({ items: z.array(adminOfficeReviewSchema) })
  .strict();
export const adminOfficeReviewDetailSchema = z
  .object({ item: adminOfficeReviewSchema })
  .strict();
export const adminOfficeMutationSchema = successEnvelope({
  item: adminOfficeReviewSchema,
}).strict();

export type AdminOfficeReview = z.infer<typeof adminOfficeReviewSchema>;
export type AdminOfficeReviewList = z.infer<typeof adminOfficeReviewListSchema>;
export type AdminOfficeReviewDetail = z.infer<
  typeof adminOfficeReviewDetailSchema
>;
export type AdminOfficeMutation = z.infer<typeof adminOfficeMutationSchema>;
export type AdminOfficeReviewState = AdminOfficeReview["office"]["reviewState"];
export type AdminOfficeReviewDecision = z.infer<
  typeof adminOfficeReviewRequestSchema
>["decision"];
