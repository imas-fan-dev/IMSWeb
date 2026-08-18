import { z } from "zod"
import { snapshotPageInfoSchema, successEnvelope } from "./common.js"

export const recommendationIdSchema = z
  .union([z.string(), z.number().int().positive().safe()])
  .transform(String)
  .pipe(z.string().regex(/^[1-9]\d*$/))

export const recommendationSchema = z.object({
  id: recommendationIdSchema,
  title: z.string().trim().min(1),
  thumbnail: z.string().nullable().optional(),
  content: z.string(),
  date: z.string().nullable().optional(),
})

export const paginatedRecommendationSchema = z.object({
  items: z.array(recommendationSchema),
  pageInfo: snapshotPageInfoSchema,
})

export const recommendationResponseSchema = z.union([
  paginatedRecommendationSchema,
  z.array(recommendationSchema),
])

export const adminRecommendationSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string(),
  image: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  content: z.string(),
  date: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
})

export const adminRecommendationListSchema = successEnvelope({
  data: z.array(adminRecommendationSchema),
})

export type Recommendation = z.infer<typeof recommendationSchema>

export type AdminRecommendation = z.infer<typeof adminRecommendationSchema>

export type RecommendationInput = z.input<typeof recommendationSchema>

export type RecommendationPageInput = z.input<typeof paginatedRecommendationSchema>

export type AdminRecommendationInput = z.input<typeof adminRecommendationSchema>

export type AdminRecommendationListInput = z.input<typeof adminRecommendationListSchema>
