import { z } from "zod"

import { apiClient } from "~/shared/api"

const homeNewsSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1),
  thumbnail: z.string().nullable().optional(),
  content: z.string(),
  date: z.string().nullable().optional(),
})

const homeEventSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1),
  name: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
})

const homeNewsListSchema = z.array(homeNewsSchema)
const homeEventListSchema = z.object({
  list: z.array(homeEventSchema),
  totalPage: z.coerce.number().int().nonnegative(),
})

const homeInformationCardSchema = z.object({
  id: z.string(),
  category: z.enum(["activity", "fan"]),
  contentType: z.enum(["external", "html"]),
  title: z.string().trim().min(1),
  image: z.string(),
  link: z.string(),
  updatedAt: z.string(),
})

const homeInformationListSchema = z.object({
  cards: z.array(homeInformationCardSchema),
})

const homeInformationDetailSchema = z.object({
  card: homeInformationCardSchema.extend({ html: z.string().min(1) }),
})

export type HomeNews = z.infer<typeof homeNewsSchema>
export type HomeEvent = z.infer<typeof homeEventSchema>
export type HomeEventList = z.infer<typeof homeEventListSchema>
export type HomeInformationCard = z.infer<typeof homeInformationCardSchema>
export type HomeInformationDetail = z.infer<typeof homeInformationDetailSchema>

export function getHomeNews() {
  return apiClient.Get<HomeNews[], unknown>("/api/news", {
    transform: (payload) => homeNewsListSchema.parse(payload),
  })
}

export function getHomeEvents() {
  return apiClient.Get<HomeEventList, unknown>("/api/events", {
    params: { page: 1, size: 100 },
    transform: (payload) => homeEventListSchema.parse(payload),
  })
}

export function getHomeInformation() {
  return apiClient.Get<z.infer<typeof homeInformationListSchema>, unknown>(
    "/api/information",
    { transform: (payload) => homeInformationListSchema.parse(payload) }
  )
}

export function getHomeInformationDetail(id: string) {
  return apiClient.Get<HomeInformationDetail, unknown>(
    `/api/information/${encodeURIComponent(id)}`,
    { transform: (payload) => homeInformationDetailSchema.parse(payload) }
  )
}
