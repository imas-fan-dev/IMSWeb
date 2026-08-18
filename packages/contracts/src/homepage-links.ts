import { z } from "zod"

export const homepageLinkSectionSchema = z.enum([
  "navigation",
  "friend",
  "support",
])

export const homepageLinkIconSchema = z.enum([
  "calendar",
  "book-open",
  "radio-tower",
  "contact",
  "library",
  "id-card",
  "map",
  "gamepad",
  "history",
  "info",
  "external-link",
])

export const homepageLinkAccentSchema = z.enum([
  "franchise-765",
  "franchise-cg",
  "franchise-ml",
  "franchise-sidem",
  "franchise-sc",
  "franchise-gk",
  "primary",
  "info",
  "success",
  "warning",
])

export const homepageLinkSchema = z.object({
  id: z.string().min(1),
  section: homepageLinkSectionSchema,
  title: z.string().min(1).max(80),
  description: z.string().max(200),
  href: z.string().min(1).max(2048),
  icon: homepageLinkIconSchema,
  accent: homepageLinkAccentSchema,
  displayOrder: z.number().int().nonnegative(),
})

export const homepageLinksSchema = z.object({
  sections: z.object({
    navigation: z.array(homepageLinkSchema),
    friend: z.array(homepageLinkSchema),
    support: z.array(homepageLinkSchema),
  }),
})

export type HomepageLink = z.infer<typeof homepageLinkSchema>

export type HomepageLinks = z.infer<typeof homepageLinksSchema>

export type HomepageLinkSection = z.infer<typeof homepageLinkSectionSchema>

export type HomepageLinkIcon = z.infer<typeof homepageLinkIconSchema>

export type HomepageLinkAccent = z.infer<typeof homepageLinkAccentSchema>
