import { z } from "zod"

import { apiClient } from "../client"
import { withCsrf } from "../types"

const aboutPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  since: z.string(),
  profileUrl: z.string().url().nullable(),
  avatarUrl: z.string().nullable(),
})

const aboutGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  people: z.array(aboutPersonSchema),
})

export const aboutPageContentSchema = z.object({
  version: z.literal(1),
  siteName: z.string(),
  siteNameEn: z.string(),
  tagline: z.string(),
  heroImageUrl: z.string().nullable(),
  heroImageAlt: z.string(),
  heroImageScale: z.number().int().min(60).max(160),
  heroImageOffsetX: z.number().int().min(-40).max(40),
  heroImageOffsetY: z.number().int().min(-40).max(40),
  accentColorStart: z.string().regex(/^#[0-9a-f]{6}$/i),
  accentColorEnd: z.string().regex(/^#[0-9a-f]{6}$/i),
  welcome: z.string(),
  manifesto: z.array(z.string()),
  sinceYear: z.coerce.number().int(),
  overviewTitle: z.string(),
  overview: z.array(z.string()),
  groups: z.array(aboutGroupSchema),
  updatedAt: z.string().datetime().nullable(),
})

const aboutAdminSnapshotSchema = z.object({
  content: aboutPageContentSchema,
  revision: z.string().nullable(),
})

const aboutAdminUpdateSchema = aboutAdminSnapshotSchema.extend({
  success: z.literal(true),
})

export type AboutPerson = z.infer<typeof aboutPersonSchema>
export type AboutGroup = z.infer<typeof aboutGroupSchema>
export type AboutPageContent = z.infer<typeof aboutPageContentSchema>
export type AboutAdminSnapshot = z.infer<typeof aboutAdminSnapshotSchema>

export function getAboutPageContent() {
  return apiClient.Get<AboutPageContent, unknown>("/api/about", {
    transform: (payload) => aboutPageContentSchema.parse(payload),
  })
}

export function getAdminAboutPageContent() {
  return apiClient.Get<AboutAdminSnapshot, unknown>("/api/admin/about", {
    transform: (payload) => aboutAdminSnapshotSchema.parse(payload),
  })
}

export function updateAdminAboutPageContent(
  content: AboutPageContent,
  revision: string | null
) {
  return apiClient.Put<z.infer<typeof aboutAdminUpdateSchema>, unknown>(
    "/api/admin/about",
    { content, revision },
    {
      meta: withCsrf(),
      transform: (payload) => aboutAdminUpdateSchema.parse(payload),
    }
  )
}
