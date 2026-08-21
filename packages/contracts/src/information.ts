import { z } from "zod"
import { successEnvelope } from "./common.js"

export const informationCardSchema = z.object({
  id: z.string(),
  category: z.enum(["activity", "fan"]),
  contentType: z.enum(["external", "html"]),
  title: z.string().trim().min(1),
  image: z.string(),
  link: z.string(),
  updatedAt: z.string(),
})

export const informationListSchema = z.object({
  cards: z.array(informationCardSchema),
})

export const informationDetailSchema = z.object({
  card: informationCardSchema.extend({ html: z.string().min(1) }),
})

export const informationCategorySchema = z.enum(["activity", "fan"])

export const informationContentTypeSchema = z.enum(["external", "html"])

export const adminInformationCardSchema = z.object({
  id: z.string(),
  category: informationCategorySchema,
  contentType: informationContentTypeSchema,
  image: z.string(),
  link: z.string(),
  title: z.string(),
  html: z.string().optional(),
  updatedAt: z.string(),
})

export const adminInformationIndexSchema = z.object({
  version: z.literal(1),
  cards: z.array(adminInformationCardSchema),
  assets: z.array(z.string()),
})

export const informationAssetSchema = successEnvelope({
  url: z.string(),
})

export type InformationCard = z.infer<typeof informationCardSchema>

export type InformationDetail = z.infer<typeof informationDetailSchema>

export type AdminInformationCard = z.infer<typeof adminInformationCardSchema>

export type AdminInformationIndex = z.infer<typeof adminInformationIndexSchema>

export type InformationCategory = z.infer<typeof informationCategorySchema>

export type InformationContentType = z.infer<
  typeof informationContentTypeSchema
>

export type InformationList = z.infer<typeof informationListSchema>

export type InformationAsset = z.infer<typeof informationAssetSchema>

export const adminInformationMutationSchema = successEnvelope({
  card: adminInformationCardSchema,
})

export type AdminInformationMutation = z.infer<
  typeof adminInformationMutationSchema
>
