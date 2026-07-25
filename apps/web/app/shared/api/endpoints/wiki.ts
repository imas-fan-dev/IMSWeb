import { z } from "zod"

import { apiClient } from "../client"
import { withCsrf } from "../types"

const wikiAdminIdolSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  textColor: z.string(),
  displayOrder: z.coerce.number().int().nonnegative(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
})

const wikiAdminGroupSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  displayOrder: z.coerce.number().int().nonnegative(),
  isFallback: z.boolean(),
  idols: z.array(wikiAdminIdolSchema),
})

const wikiAdminAgencySchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  wikiEnabled: z.boolean(),
  bannerTitle: z.string(),
  displayOrder: z.coerce.number().int().nonnegative(),
  layoutRevision: z.coerce.number().int().nonnegative(),
  iconUrl: z.string().nullable(),
  groups: z.array(wikiAdminGroupSchema),
})

const wikiAdminCatalogSchema = z.object({
  status: z.literal("success"),
  agencies: z.array(wikiAdminAgencySchema),
})

export const wikiAdminStorySchema = z.object({
  id: z.coerce.number().int().positive(),
  category: z.string(),
  cardName: z.string(),
  upName: z.string(),
  videoTitle: z.string(),
  url: z.string(),
  subtitle: z.string(),
  imageFile: z.string().nullable(),
  imageUrl: z.string(),
})

const wikiAdminStoriesSchema = z.object({
  status: z.literal("success"),
  agency: z.object({
    id: z.coerce.number().int().positive(),
    code: z.string(),
    name: z.string(),
    color: z.string(),
  }),
  idol: wikiAdminIdolSchema,
  categories: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      name: z.string(),
      storageSlug: z.string(),
      displayOrder: z.coerce.number().int().nonnegative(),
      showWhenEmpty: z.boolean(),
      backgroundEligible: z.boolean(),
    })
  ),
  stories: z.array(wikiAdminStorySchema),
})

const wikiMutationResultSchema = z.object({
  status: z.literal("success"),
})

const wikiAgencyIconResultSchema = wikiMutationResultSchema.extend({
  url: z.string(),
})

const wikiLayoutResultSchema = z.object({
  status: z.literal("success"),
  layoutRevision: z.coerce.number().int().nonnegative(),
})

const bilibiliResultSchema = z.object({
  status: z.literal("success"),
  title: z.string(),
  up: z.string(),
  std_url: z.string(),
})

const wikiPublicAgencySchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  bannerTitle: z.string(),
  iconUrl: z.string().nullable(),
  idolCount: z.coerce.number().int().nonnegative(),
})

const wikiPublicIdolSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  textColor: z.string(),
})

const wikiPublicGroupSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  idols: z.array(wikiPublicIdolSchema),
})

const wikiPublicCatalogSchema = z.object({
  status: z.literal("success"),
  agencies: z.array(wikiPublicAgencySchema),
  selection: z
    .object({
      agency: wikiPublicAgencySchema,
      layoutRevision: z.coerce.number().int().nonnegative(),
      groups: z.array(wikiPublicGroupSchema),
    })
    .nullable(),
})

const wikiPublicStoryLinkSchema = z.object({
  id: z.coerce.number().int().positive(),
  up: z.string(),
  title: z.string(),
  url: z.string(),
})

const wikiPublicStoryCardSchema = z.object({
  name: z.string(),
  img: z.string(),
  subtitle: z.string(),
  links: z.array(wikiPublicStoryLinkSchema),
})

const wikiPublicStoriesSchema = z.object({
  status: z.literal("success"),
  agency: z.object({
    id: z.coerce.number().int().positive(),
    code: z.string(),
    name: z.string(),
    color: z.string(),
  }),
  idol: wikiPublicIdolSchema,
  categories: z.array(
    z.object({
      name: z.string(),
      cards: z.array(wikiPublicStoryCardSchema),
    })
  ),
})

const wikiRandomBackgroundSchema = z.object({
  url: z.string(),
  card_name: z.string().optional(),
  idol_name: z.string().optional(),
  agency_name: z.string().optional(),
})

export type WikiAdminCatalog = z.infer<typeof wikiAdminCatalogSchema>
export type WikiAdminAgency = z.infer<typeof wikiAdminAgencySchema>
export type WikiAdminIdol = z.infer<typeof wikiAdminIdolSchema>
export type WikiAdminStories = z.infer<typeof wikiAdminStoriesSchema>
export type WikiAdminStory = z.infer<typeof wikiAdminStorySchema>
export type BilibiliParseResult = z.infer<typeof bilibiliResultSchema>
export type WikiPublicAgency = z.infer<typeof wikiPublicAgencySchema>
export type WikiPublicIdol = z.infer<typeof wikiPublicIdolSchema>
export type WikiPublicCatalog = z.infer<typeof wikiPublicCatalogSchema>
export type WikiPublicStories = z.infer<typeof wikiPublicStoriesSchema>
export type WikiPublicStoryCategory = WikiPublicStories["categories"][number]
export type WikiPublicStoryCard = WikiPublicStoryCategory["cards"][number]
export type WikiRandomBackground = z.infer<typeof wikiRandomBackgroundSchema>

export type WikiStorySubmission = {
  agency: string
  idol: string
  category: string
  cardName: string
  upName: string
  videoTitle: string
  url: string
  subtitle: string
  image?: File | null
}

export type WikiStoryGroup = {
  agency: string
  idol: string
  category: string
  cardName: string
}

export function getWikiCatalog(agency?: string) {
  return apiClient.Get<WikiPublicCatalog, unknown>("/api/wiki/catalog", {
    params: agency ? { agency } : undefined,
    transform: (payload) => wikiPublicCatalogSchema.parse(payload),
  })
}

export function getWikiStories(agency: string, idol: string) {
  return apiClient.Get<WikiPublicStories, unknown>("/api/wiki/stories", {
    params: { agency, idol },
    transform: (payload) => wikiPublicStoriesSchema.parse(payload),
  })
}

export function getWikiRandomBackground() {
  return apiClient.Get<WikiRandomBackground, unknown>("/api/wiki/random_bg", {
    transform: (payload) => wikiRandomBackgroundSchema.parse(payload),
  })
}

function normalizedCardName(value: string) {
  let cardName = value.trim().replaceAll("|", "｜")
  if (!cardName.startsWith("【")) cardName = `【${cardName}`
  if (!cardName.endsWith("】")) cardName = `${cardName}】`
  return cardName
}

function appendStoryFields(form: FormData, submission: WikiStorySubmission) {
  const subtitle = submission.subtitle.trim().replaceAll("|", "｜")
  const url = submission.url.trim().replaceAll("|", "")

  form.append("agency", submission.agency)
  form.append("idol", submission.idol)
  form.append("category_name", submission.category.trim())
  form.append("card_name", normalizedCardName(submission.cardName))
  form.append("up_name", submission.upName.trim())
  form.append("video_title", submission.videoTitle.trim())
  form.append("url", `${url}${subtitle ? ` | ${subtitle}` : ""}`)
  if (submission.image) form.append("image", submission.image)
}

function appendStoryGroup(form: FormData, group: WikiStoryGroup) {
  form.append("agency", group.agency)
  form.append("idol", group.idol)
  form.append("category_name", group.category)
  form.append("card_name", group.cardName)
}

export function getAdminWikiCatalog() {
  return apiClient.Get<WikiAdminCatalog, unknown>("/api/admin/wiki/catalog", {
    transform: (payload) => wikiAdminCatalogSchema.parse(payload),
  })
}

export function getAdminWikiStories(agency: string, idol: string) {
  return apiClient.Get<WikiAdminStories, unknown>("/api/admin/wiki/stories", {
    params: { agency, idol },
    transform: (payload) => wikiAdminStoriesSchema.parse(payload),
  })
}

export function uploadWikiAgencyIcon(agency: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("image", file)
  return apiClient.Post<z.infer<typeof wikiAgencyIconResultSchema>, unknown>(
    "/api/wiki/agency-icon",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => wikiAgencyIconResultSchema.parse(payload),
    }
  )
}

export function deleteWikiAgencyIcon(agency: string) {
  return apiClient.Delete<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/agency-icon",
    { agency },
    {
      meta: withCsrf(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function saveWikiLayout(
  agencyId: number,
  expectedRevision: number,
  groups: Array<{ id: number; idolIds: number[] }>
) {
  return apiClient.Put<z.infer<typeof wikiLayoutResultSchema>, unknown>(
    `/api/admin/wiki/agencies/${agencyId}/layout`,
    { expectedRevision, groups },
    {
      meta: withCsrf(),
      transform: (payload) => wikiLayoutResultSchema.parse(payload),
    }
  )
}

export function createWikiStory(submission: WikiStorySubmission) {
  const form = new FormData()
  appendStoryFields(form, submission)
  return apiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/add_story",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function updateWikiStory(
  storyId: number,
  original: Pick<WikiAdminStory, "category" | "cardName">,
  submission: WikiStorySubmission
) {
  const form = new FormData()
  appendStoryFields(form, submission)
  form.append("story_id", String(storyId))
  form.append("old_category_name", original.category)
  form.append("old_card_name", original.cardName)
  return apiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/edit_story",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function deleteWikiStoryGroup(group: WikiStoryGroup) {
  const form = new FormData()
  appendStoryGroup(form, group)
  return apiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/delete_story",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function deleteWikiCategory(group: Omit<WikiStoryGroup, "cardName">) {
  const form = new FormData()
  form.append("agency", group.agency)
  form.append("idol", group.idol)
  form.append("category_name", group.category)
  return apiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/delete_category",
    form,
    {
      meta: withCsrf(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function parseBilibiliStoryUrl(url: string) {
  return apiClient.Post<BilibiliParseResult, unknown>(
    "/api/wiki/parse_bilibili",
    { url },
    {
      meta: withCsrf(),
      transform: (payload) => bilibiliResultSchema.parse(payload),
    }
  )
}
