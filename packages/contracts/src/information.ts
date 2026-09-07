import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, legacyStripRequestObject, successEnvelope } from "./common.js"
export const informationCategorySchema = z.enum(["activity", "fan"])
export const informationContentTypeSchema = z.enum(["external", "html"])
export const informationCardParamsSchema = legacyStripRequestObject({ id: z.string().min(1) })
export const informationSubmissionSchema = legacyStripRequestObject({ title: z.string().trim().min(1).max(200), category: informationCategorySchema, contentType: informationContentTypeSchema, externalUrl: z.string().trim(), html: z.string().trim().optional(), image: z.string().trim().min(1) })
export const informationOrderRequestSchema = legacyStripRequestObject({ ids: z.array(z.string().min(1)) })
export const informationAssetDeleteRequestSchema = legacyStripRequestObject({ url: z.string().min(1) })
export const informationCardSchema = exactJsonResponse({ id: z.string(), category: informationCategorySchema, contentType: informationContentTypeSchema, title: z.string().trim().min(1), image: z.string(), link: z.string(), updatedAt: z.string() })
export const informationListSchema = exactJsonResponse({ cards: z.array(informationCardSchema) })
export const informationDetailSchema = exactJsonResponse({ card: informationCardSchema.extend({ html: z.string().min(1) }).strict() })
export const adminInformationCardSchema = exactJsonResponse({ id: z.string(), category: informationCategorySchema, contentType: informationContentTypeSchema, image: z.string(), link: z.string(), title: z.string(), html: z.string().optional(), updatedAt: z.string() })
export const adminInformationIndexSchema = exactJsonResponse({ version: z.literal(1), cards: z.array(adminInformationCardSchema), assets: z.array(z.string()) })
export const informationAssetSchema = successEnvelope({ url: z.string() })
export const adminInformationMutationSchema = successEnvelope({ card: adminInformationCardSchema })
export const informationErrorResponseSchema = errorResponseSchema
export type InformationCardParams = z.infer<typeof informationCardParamsSchema>
export type InformationSubmission = z.infer<typeof informationSubmissionSchema>
export type InformationCard = z.infer<typeof informationCardSchema>
export type InformationDetail = z.infer<typeof informationDetailSchema>
export type AdminInformationCard = z.infer<typeof adminInformationCardSchema>
export type AdminInformationIndex = z.infer<typeof adminInformationIndexSchema>
export type InformationCategory = z.infer<typeof informationCategorySchema>
export type InformationContentType = z.infer<typeof informationContentTypeSchema>
export type InformationList = z.infer<typeof informationListSchema>
export type InformationAsset = z.infer<typeof informationAssetSchema>
export type AdminInformationMutation = z.infer<typeof adminInformationMutationSchema>
export type InformationErrorResponse = z.infer<typeof informationErrorResponseSchema>
