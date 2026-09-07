import { z } from "zod"
import { errorResponseSchema, exactJsonResponse, legacyStripRequestObject, snapshotPageInfoSchema, successEnvelope } from "./common.js"
import { editorialCoverTransformResponseSchema, editorialEventKindSchema } from "./editorial.js"
export const eventIdSchema = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()])
export const eventIdParamsSchema = legacyStripRequestObject({ id: z.union([z.string(), z.number()]) })
export const eventListQuerySchema = legacyStripRequestObject({ page: z.string().optional(), size: z.string().optional(), limit: z.string().optional(), cursor: z.string().optional() })
export const eventListItemSchema = exactJsonResponse({ id: eventIdSchema, title: z.string().trim().min(1).nullable(), name: z.string().nullable().optional(), contact: z.string().nullable().optional(), image_url: z.string().nullable().optional(), created_at: z.string().nullable().optional(), summary: z.string().optional(), kind: editorialEventKindSchema.nullable().optional(), source_url: z.string().nullable().optional(), start_at: z.string().nullable().optional(), end_at: z.string().nullable().optional(), venue_name: z.string().nullable().optional(), event_status: z.string().nullable().optional(), cover_transform: editorialCoverTransformResponseSchema.optional() })
export const eventPageInfoSchema = snapshotPageInfoSchema
export const eventPageSchema = exactJsonResponse({ items: z.array(eventListItemSchema), pageInfo: eventPageInfoSchema })
export const eventLegacyPageSchema = exactJsonResponse({ list: z.array(eventListItemSchema), totalPage: z.number().int().nonnegative() })
export const createEventResponseSchema = successEnvelope({ id: z.number().int().positive() })
export const eventMutationResponseSchema = successEnvelope({})
export const eventErrorResponseSchema = errorResponseSchema
export type EventListItem = z.infer<typeof eventListItemSchema>
export type EventPageInfo = z.infer<typeof eventPageInfoSchema>
export type EventPage = z.infer<typeof eventPageSchema>
export type EventLegacyPage = z.infer<typeof eventLegacyPageSchema>
export type CreateEventResponse = z.infer<typeof createEventResponseSchema>
