import { z } from "zod"
import { successEnvelope } from "./common.js"

export const aboutPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  since: z.string(),
  profileUrl: z.string().url().nullable(),
  avatarUrl: z.string().nullable(),
})

export const aboutGroupSchema = z.object({
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

export const aboutAdminSnapshotSchema = z.object({
  content: aboutPageContentSchema.nullable(),
  revision: z.string().nullable(),
})

export const aboutAdminUpdateSchema = successEnvelope({
  content: aboutPageContentSchema,
  revision: z.string(),
})

export const aboutImageUploadSchema = successEnvelope({
  url: z.string().min(1),
})

export type AboutPerson = z.infer<typeof aboutPersonSchema>

export type AboutGroup = z.infer<typeof aboutGroupSchema>

export type AboutPageContent = z.infer<typeof aboutPageContentSchema>

export type AboutAdminSnapshot = z.infer<typeof aboutAdminSnapshotSchema>

export type AboutAdminUpdate = z.infer<typeof aboutAdminUpdateSchema>

export type AboutImageUpload = z.infer<typeof aboutImageUploadSchema>
