import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, legacyStripRequestObject, successEnvelope } from "./common.js"
export const homepageLinkSectionSchema = z.enum(["navigation", "friend", "support"])
export const homepageLinkIconSchema = z.enum(["calendar", "book-open", "radio-tower", "contact", "library", "id-card", "map", "gamepad", "history", "info", "external-link"])
export const homepageLinkAccentSchema = z.enum(["franchise-765", "franchise-cg", "franchise-ml", "franchise-sidem", "franchise-sc", "franchise-gk", "primary", "info", "success", "warning"])
const homepageLinkFields = { title: z.string().trim().min(1).max(80), description: z.string().trim().max(200), href: z.string().trim().min(1).max(2048), icon: homepageLinkIconSchema, accent: homepageLinkAccentSchema }
export const homepageLinkIdParamsSchema = legacyStripRequestObject({ id: z.string().min(1) })
export const homepageLinkSectionParamsSchema = legacyStripRequestObject({ section: homepageLinkSectionSchema })
export const homepageLinkCreateRequestSchema = legacyStripRequestObject({ ...homepageLinkFields, section: homepageLinkSectionSchema })
export const homepageLinkUpdateRequestSchema = legacyStripRequestObject(homepageLinkFields)
export const homepageLinkOrderRequestSchema = legacyStripRequestObject({ ids: z.array(z.string().min(1)).min(1).refine((ids) => new Set(ids).size === ids.length) })
export const homepageLinkSchema = exactJsonResponse({ id: z.string().min(1), section: homepageLinkSectionSchema, title: z.string().min(1).max(80), description: z.string().max(200), href: z.string().min(1).max(2048), icon: homepageLinkIconSchema, accent: homepageLinkAccentSchema, displayOrder: z.number().int().nonnegative() })
export const homepageLinksSchema = exactJsonResponse({ sections: exactJsonResponse({ navigation: z.array(homepageLinkSchema), friend: z.array(homepageLinkSchema), support: z.array(homepageLinkSchema) }) })
export const homepageLinkMutationSchema = successEnvelope({ link: homepageLinkSchema })
export const homepageLinkDeleteSchema = successEnvelope({})
export const homepageLinkErrorResponseSchema = errorResponseSchema
export type HomepageLink = z.infer<typeof homepageLinkSchema>
export type HomepageLinks = z.infer<typeof homepageLinksSchema>
export type HomepageLinkSection = z.infer<typeof homepageLinkSectionSchema>
export type HomepageLinkIcon = z.infer<typeof homepageLinkIconSchema>
export type HomepageLinkAccent = z.infer<typeof homepageLinkAccentSchema>
export type HomepageLinkCreateRequest = z.infer<typeof homepageLinkCreateRequestSchema>
export type HomepageLinkUpdateRequest = z.infer<typeof homepageLinkUpdateRequestSchema>
export type HomepageLinkOrderRequest = z.infer<typeof homepageLinkOrderRequestSchema>
export type HomepageLinkMutation = z.infer<typeof homepageLinkMutationSchema>
export type HomepageLinkErrorResponse = z.infer<typeof homepageLinkErrorResponseSchema>
