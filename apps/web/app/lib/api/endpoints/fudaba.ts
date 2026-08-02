import { z } from "zod"

import { platformApiClient } from "../platform-client"
import { withPlatformAuth } from "../types"

const seriesCodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const accentSchema = z.string().regex(/^#[0-9a-f]{6}$/i)
const publicMediaUrlSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })

export const fudabaSeriesSchema = z.object({
  code: seriesCodeSchema,
  displayName: z.string().trim().min(1),
  displayOrder: z.number().int().nonnegative(),
  activeOfficeCount: z.number().int().nonnegative(),
})

export const fudabaSeriesListSchema = z.object({
  items: z.array(fudabaSeriesSchema),
})

export const fudabaOfficeSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(1),
  intro: z.string(),
  city: z.string().trim().min(1),
  accent: accentSchema,
  coverUrl: publicMediaUrlSchema.nullable(),
  isOpen: z.boolean(),
  visitorCount: z.number().int().nonnegative(),
  seriesCodes: z.array(seriesCodeSchema),
})

export const fudabaCardSchema = z.object({
  id: z.string().min(1),
  producerName: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  seriesCode: seriesCodeSchema,
  favoriteIdol: z.string(),
  frontImageUrl: publicMediaUrlSchema,
  backImageUrl: publicMediaUrlSchema,
  accent: accentSchema,
  bio: z.string(),
  tradeNote: z.string(),
  available: z.boolean(),
  source: z
    .object({
      url: z.string().url(),
      label: z.string().nullable(),
      credit: z.string().nullable(),
    })
    .nullable(),
  createdAt: timestampSchema,
  interactions: z.object({
    likes: z.number().int().nonnegative(),
    favorites: z.number().int().nonnegative(),
    viewerLiked: z.boolean(),
    viewerFavorited: z.boolean(),
  }),
})

export const fudabaPlacedCardSchema = fudabaCardSchema.extend({
  placement: z.object({
    pinnedAt: timestampSchema,
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    rotation: z.number().min(-12).max(12),
    zIndex: z.number().int().min(1).max(999),
  }),
})

export const fudabaPageInfoSchema = z
  .object({
    hasNextPage: z.boolean(),
    nextCursor: z.string().min(1).nullable(),
  })
  .superRefine((value, context) => {
    if (value.hasNextPage !== Boolean(value.nextCursor)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Fudaba pagination state is inconsistent",
      })
    }
  })

export const fudabaOfficePageSchema = z.object({
  items: z.array(fudabaOfficeSchema),
  pageInfo: fudabaPageInfoSchema,
})

export const fudabaCardPageSchema = z.object({
  items: z.array(fudabaCardSchema),
  pageInfo: fudabaPageInfoSchema,
})

export const fudabaOfficeDetailSchema = z.object({
  office: fudabaOfficeSchema.extend({
    cards: z.array(fudabaPlacedCardSchema),
  }),
})

export type FudabaSeries = z.infer<typeof fudabaSeriesSchema>
export type FudabaOffice = z.infer<typeof fudabaOfficeSchema>
export type FudabaCard = z.infer<typeof fudabaCardSchema>
export type FudabaPlacedCard = z.infer<typeof fudabaPlacedCardSchema>
export type FudabaOfficePage = z.infer<typeof fudabaOfficePageSchema>
export type FudabaCardPage = z.infer<typeof fudabaCardPageSchema>
export type FudabaOfficeDetail = z.infer<
  typeof fudabaOfficeDetailSchema
>["office"]

export interface FudabaOfficePageRequest {
  city?: string
  series?: string
  open?: boolean
  limit?: number
  cursor?: string
}

export interface FudabaCardPageRequest {
  series?: string
  available?: boolean
  office?: string
  limit?: number
  cursor?: string
}

function officePageParams({
  city,
  series,
  open,
  limit = 12,
  cursor,
}: FudabaOfficePageRequest) {
  const params: Record<string, string | number> = { limit }
  if (city?.trim()) params.city = city.trim()
  if (series) params.series = series
  if (open !== undefined) params.open = String(open)
  if (cursor) params.cursor = cursor
  return params
}

function cardPageParams({
  series,
  available,
  office,
  limit = 8,
  cursor,
}: FudabaCardPageRequest) {
  const params: Record<string, string | number> = { limit }
  if (series) params.series = series
  if (available !== undefined) params.available = String(available)
  if (office) params.office = office
  if (cursor) params.cursor = cursor
  return params
}

export function getFudabaSeries() {
  return platformApiClient.Get<z.infer<typeof fudabaSeriesListSchema>, unknown>(
    "/api/community/exchange/series",
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaSeriesListSchema.parse(payload),
    }
  )
}

export function getFudabaOfficePage(input: FudabaOfficePageRequest = {}) {
  return platformApiClient.Get<FudabaOfficePage, unknown>(
    "/api/community/exchange/offices",
    {
      meta: withPlatformAuth(),
      params: officePageParams(input),
      transform: (payload) => fudabaOfficePageSchema.parse(payload),
    }
  )
}

export function getFudabaOffice(officeSlug: string) {
  return platformApiClient.Get<FudabaOfficeDetail, unknown>(
    `/api/community/exchange/offices/${encodeURIComponent(officeSlug)}`,
    {
      meta: withPlatformAuth(),
      transform: (payload) => fudabaOfficeDetailSchema.parse(payload).office,
    }
  )
}

export function getFudabaCardPage(input: FudabaCardPageRequest = {}) {
  return platformApiClient.Get<FudabaCardPage, unknown>(
    "/api/community/exchange/cards",
    {
      meta: withPlatformAuth(),
      params: cardPageParams(input),
      transform: (payload) => fudabaCardPageSchema.parse(payload),
    }
  )
}
