import { z } from "zod"
import { snapshotPageInfoSchema, successEnvelope } from "./common.js"
import {
  editorialCoverTransformSchema,
  editorialEventKindSchema,
} from "./editorial.js"

export const eventIdSchema = z
  .union([z.string(), z.number().int().positive()])
  .transform(String)
  .pipe(z.string().regex(/^[1-9]\d*$/))

export const eventListItemSchema = z.object({
  id: eventIdSchema,
  title: z.string().trim().min(1).nullable(),
  name: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  // 文章 CMS 接管活动列表后补充的展示字段，旧写入路径不产出它们。
  summary: z.string().optional(),
  kind: editorialEventKindSchema.nullable().optional(),
  source_url: z.string().nullable().optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  venue_name: z.string().nullable().optional(),
  event_status: z.string().nullable().optional(),
  cover_transform: editorialCoverTransformSchema,
})

export const eventPageInfoSchema = snapshotPageInfoSchema

export const eventPageSchema = z.object({
  items: z.array(eventListItemSchema),
  pageInfo: eventPageInfoSchema,
})

export type EventListItem = z.infer<typeof eventListItemSchema>

export type EventPageInfo = z.infer<typeof eventPageInfoSchema>

export type EventPage = z.infer<typeof eventPageSchema>

export type EventListItemInput = z.input<typeof eventListItemSchema>

export type EventPageInput = z.input<typeof eventPageSchema>

export const createEventResponseSchema = successEnvelope({
  id: z.number().int().positive(),
})

export type CreateEventResponse = z.infer<typeof createEventResponseSchema>
