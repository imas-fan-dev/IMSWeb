import { z } from "zod"
import { backofficeProtectedHttpErrorSchema, errorResponseSchema, exactJsonResponse, legacyStripRequestObject, snapshotPageInfoSchema, successEnvelope } from "./common.js"
export const recommendationIdSchema = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive().safe()])
export const newsListQuerySchema = legacyStripRequestObject({ limit: z.string().optional(), cursor: z.string().optional() })
export const compatibleNewsDeleteParamsSchema = legacyStripRequestObject({ id: z.union([z.string(), z.number()]) })
export const newsSubmissionSchema = legacyStripRequestObject({ title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(4096), coverUrl: z.string().trim().max(4096).optional() })
export const recommendationSchema = exactJsonResponse({ id: recommendationIdSchema, title: z.string().min(1), thumbnail: z.string().nullable().optional(), content: z.string(), date: z.string().nullable().optional() })
export const paginatedRecommendationSchema = exactJsonResponse({ items: z.array(recommendationSchema), pageInfo: snapshotPageInfoSchema })
export const recommendationResponseSchema = z.union([paginatedRecommendationSchema, z.array(recommendationSchema)])
export const adminRecommendationSchema = exactJsonResponse({ id: z.number().int().positive(), title: z.string(), image: z.string().nullable().optional(), thumbnail: z.string().nullable().optional(), content: z.string(), date: z.string().nullable().optional(), author: z.string().nullable().optional() })
export const adminRecommendationListSchema = successEnvelope({ data: z.array(adminRecommendationSchema) })
export const newsMutationSuccessSchema = successEnvelope({})
export const newsMutationErrorResponseSchema = exactJsonResponse({ success: z.literal(false), msg: z.string() })
export const newsErrorResponseSchema = errorResponseSchema
export const newsAdminHttpErrorResponseSchema = z.union([
  backofficeProtectedHttpErrorSchema,
  newsMutationErrorResponseSchema,
])
export type Recommendation = z.infer<typeof recommendationSchema>
export type AdminRecommendation = z.infer<typeof adminRecommendationSchema>
export type RecommendationPage = z.infer<typeof paginatedRecommendationSchema>
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>
export type AdminRecommendationList = z.infer<typeof adminRecommendationListSchema>
export type NewsSubmission = z.infer<typeof newsSubmissionSchema>
export type NewsMutationSuccess = z.infer<typeof newsMutationSuccessSchema>
export type NewsMutationErrorResponse = z.infer<typeof newsMutationErrorResponseSchema>
export type NewsAdminHttpErrorResponse = z.infer<typeof newsAdminHttpErrorResponseSchema>
