import { z } from "zod"

import { adminApiClient } from "../admin-client"
import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  WIKI_PUBLIC_CACHE,
} from "../cache-policy"
import { apiClient } from "../client"
import { withBackofficeAuth, withBackofficeCsrf } from "../types"
import {
  bilibiliResultSchema,
  wikiAdminCatalogSchema,
  wikiAdminStoriesSchema,
  wikiAgencyIconResultSchema,
  wikiAgencyMutationResultSchema,
  wikiEntityImageResultSchema,
  wikiGroupMutationResultSchema,
  wikiIdolDeleteResultSchema,
  wikiIdolMutationResultSchema,
  wikiLayoutResultSchema,
  wikiMutationResultSchema,
  wikiPublicCatalogSchema,
  wikiPublicStoriesSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
  wikiStoryContentTypeMutationSchema,
  wikiStoryCoverAssetMutationSchema,
  wikiStoryCoverAssetsSchema,
  wikiStoryLinkDeleteResultSchema,
  wikiStorySourceCatalogSchema,
  wikiStorySourcePlatformMutationSchema,
  type BilibiliParseResult,
  type WikiAdminCatalog,
  type WikiAdminStories,
  type WikiAdminStory,
  type WikiAgencySubmission,
  type WikiEntityImageKind,
  type WikiGroupSubmission,
  type WikiIdolSubmission,
  type WikiImageTransform,
  type WikiPublicCatalog,
  type WikiPublicStories,
  type WikiRandomBackground,
  type WikiRandomIdol,
  type WikiStoryBatchSubmission,
  type WikiStoryCardSubmission,
  type WikiStoryCatalogOptionSubmission,
  type WikiStoryCoverAssets,
  type WikiStoryCoverPresentationPolicy,
  type WikiStoryGroup,
  type WikiStorySourceCatalog,
  type WikiStorySourcePlatformSubmission,
  type WikiStorySourcesSubmission,
  type WikiStorySubmission,
} from "./wiki-schemas"

export {
  defaultWikiImageTransform,
  wikiAdminStoryCardSchema,
  wikiAdminStorySchema,
  wikiEntryKindSchema,
  wikiImageTransformSchema,
  wikiStoryCoverPresentationPolicySchema,
  wikiStoryEntrySubtypeSchema,
  type BilibiliParseResult,
  type WikiAdminAgency,
  type WikiAdminCatalog,
  type WikiAdminGroup,
  type WikiAdminIdol,
  type WikiAdminStories,
  type WikiAdminStory,
  type WikiAdminStoryCard,
  type WikiAgencySubmission,
  type WikiEntryKind,
  type WikiGroupSubmission,
  type WikiIdolSubmission,
  type WikiImageTransform,
  type WikiPublicAgency,
  type WikiPublicCatalog,
  type WikiPublicIdol,
  type WikiPublicSearchEntry,
  type WikiPublicStories,
  type WikiPublicStoryCard,
  type WikiPublicStoryCategory,
  type WikiRandomBackground,
  type WikiRandomIdol,
  type WikiStoryBatchSubmission,
  type WikiStoryCardSubmission,
  type WikiStoryCatalogOptionSubmission,
  type WikiStoryContentType,
  type WikiStoryCoverAsset,
  type WikiStoryCoverAssets,
  type WikiStoryCoverPresentationPolicy,
  type WikiStoryEntrySubtype,
  type WikiStoryGroup,
  type WikiStorySourceCatalog,
  type WikiStorySourcePlatform,
  type WikiStorySourcePlatformSubmission,
  type WikiStorySourceSubmission,
  type WikiStorySourcesSubmission,
  type WikiStorySubmission,
} from "./wiki-schemas"

function wikiMutationConfig() {
  return {
    name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    meta: withBackofficeCsrf(),
  } as const
}

export function getWikiCatalog(agency?: string) {
  return apiClient.Get<WikiPublicCatalog, unknown>("/api/wiki/catalog", {
    cacheFor: WIKI_PUBLIC_CACHE,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    params: agency ? { agency } : undefined,
    transform: (payload) => wikiPublicCatalogSchema.parse(payload),
  })
}

export function getWikiStories(agency: string, idol: string) {
  return apiClient.Get<WikiPublicStories, unknown>("/api/wiki/stories", {
    cacheFor: WIKI_PUBLIC_CACHE,
    hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    params: { agency, idol },
    transform: (payload) => wikiPublicStoriesSchema.parse(payload),
  })
}

export function getWikiRandomBackground() {
  return apiClient.Get<WikiRandomBackground, unknown>("/api/wiki/random_bg", {
    cacheFor: NO_CLIENT_CACHE,
    transform: (payload) => wikiRandomBackgroundSchema.parse(payload),
  })
}

export function getWikiRandomIdol() {
  return apiClient.Get<WikiRandomIdol, unknown>("/api/wiki/random_idol", {
    cacheFor: NO_CLIENT_CACHE,
    transform: (payload) => wikiRandomIdolSchema.parse(payload),
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
  form.append("content_type_id", String(submission.contentTypeId))
  form.append("source_platform_id", String(submission.sourcePlatformId))
  if (submission.image) form.append("image", submission.image)
  if (submission.imageTransform) {
    appendImageTransform(form, submission.imageTransform)
  }
  if (submission.mediaRevision !== undefined) {
    form.append("expected_revision", String(submission.mediaRevision))
  }
}

function appendImageTransform(form: FormData, transform: WikiImageTransform) {
  form.append("image_fit", transform.fit)
  form.append("image_focal_x", String(transform.focalX))
  form.append("image_focal_y", String(transform.focalY))
  form.append("image_zoom", String(transform.zoom))
  form.append("image_rotation", String(transform.rotation))
}

function appendStoryGroup(form: FormData, group: WikiStoryGroup) {
  form.append("agency", group.agency)
  form.append("idol", group.idol)
  form.append("category_name", group.category)
  form.append("card_name", group.cardName)
}

export function getAdminWikiCatalog() {
  return adminApiClient.Get<WikiAdminCatalog, unknown>(
    "/api/admin/wiki/catalog",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => wikiAdminCatalogSchema.parse(payload),
    }
  )
}

export function getAdminWikiStories(agency: string, idol: string) {
  return adminApiClient.Get<WikiAdminStories, unknown>(
    "/api/admin/wiki/stories",
    {
      meta: withBackofficeAuth(),
      params: { agency, idol },
      transform: (payload) => wikiAdminStoriesSchema.parse(payload),
    }
  )
}

export function getAdminWikiStoryCoverAssets(agencyId: number) {
  return adminApiClient.Get<WikiStoryCoverAssets, unknown>(
    `/api/admin/wiki/agencies/${agencyId}/story-cover-assets`,
    {
      meta: withBackofficeAuth(),
      transform: (payload) => wikiStoryCoverAssetsSchema.parse(payload),
    }
  )
}

export function createWikiStoryCoverAsset(input: {
  agencyId: number
  name: string
  image: File
  presentationPolicy: WikiStoryCoverPresentationPolicy
}) {
  const form = new FormData()
  form.append("name", input.name.trim())
  form.append("presentation_policy", input.presentationPolicy)
  form.append("image", input.image)
  return adminApiClient.Post<
    z.infer<typeof wikiStoryCoverAssetMutationSchema>,
    unknown
  >(`/api/admin/wiki/agencies/${input.agencyId}/story-cover-assets`, form, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiStoryCoverAssetMutationSchema.parse(payload),
  })
}

export function updateWikiStoryCoverAsset(input: {
  assetId: number
  name: string
  isActive: boolean
  presentationPolicy: WikiStoryCoverPresentationPolicy
  expectedRevision: number
  image?: File | null
}) {
  const form = new FormData()
  form.append("name", input.name.trim())
  form.append("is_active", String(input.isActive))
  form.append("presentation_policy", input.presentationPolicy)
  form.append("expected_revision", String(input.expectedRevision))
  if (input.image) form.append("image", input.image)
  return adminApiClient.Patch<
    z.infer<typeof wikiStoryCoverAssetMutationSchema>,
    unknown
  >(`/api/admin/wiki/story-cover-assets/${input.assetId}`, form, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiStoryCoverAssetMutationSchema.parse(payload),
  })
}

export function deleteWikiStoryCoverAsset(assetId: number) {
  return adminApiClient.Delete<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/story-cover-assets/${assetId}`, undefined, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiMutationResultSchema.parse(payload),
  })
}

export function getWikiStorySourceCatalog() {
  return adminApiClient.Get<WikiStorySourceCatalog, unknown>(
    "/api/admin/wiki/story-source-catalog",
    {
      meta: withBackofficeAuth(),
      transform: (payload) => wikiStorySourceCatalogSchema.parse(payload),
    }
  )
}

export function createWikiStoryContentType(
  submission: WikiStoryCatalogOptionSubmission
) {
  return adminApiClient.Post<
    z.infer<typeof wikiStoryContentTypeMutationSchema>,
    unknown
  >("/api/admin/wiki/story-content-types", submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiStoryContentTypeMutationSchema.parse(payload),
  })
}

export function updateWikiStoryContentType(
  optionId: number,
  expectedRevision: number,
  submission: WikiStoryCatalogOptionSubmission
) {
  return adminApiClient.Patch<
    z.infer<typeof wikiStoryContentTypeMutationSchema>,
    unknown
  >(
    `/api/admin/wiki/story-content-types/${optionId}`,
    {
      ...submission,
      expectedRevision,
    },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiStoryContentTypeMutationSchema.parse(payload),
    }
  )
}

export function deleteWikiStoryContentType(optionId: number) {
  return adminApiClient.Delete<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/story-content-types/${optionId}`, undefined, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiMutationResultSchema.parse(payload),
  })
}

export function createWikiStorySourcePlatform(
  submission: WikiStorySourcePlatformSubmission
) {
  return adminApiClient.Post<
    z.infer<typeof wikiStorySourcePlatformMutationSchema>,
    unknown
  >("/api/admin/wiki/story-source-platforms", submission, {
    ...wikiMutationConfig(),
    transform: (payload) =>
      wikiStorySourcePlatformMutationSchema.parse(payload),
  })
}

export function updateWikiStorySourcePlatform(
  optionId: number,
  expectedRevision: number,
  submission: WikiStorySourcePlatformSubmission
) {
  return adminApiClient.Patch<
    z.infer<typeof wikiStorySourcePlatformMutationSchema>,
    unknown
  >(
    `/api/admin/wiki/story-source-platforms/${optionId}`,
    {
      ...submission,
      expectedRevision,
    },
    {
      ...wikiMutationConfig(),
      transform: (payload) =>
        wikiStorySourcePlatformMutationSchema.parse(payload),
    }
  )
}

export function deleteWikiStorySourcePlatform(optionId: number) {
  return adminApiClient.Delete<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/story-source-platforms/${optionId}`, undefined, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiMutationResultSchema.parse(payload),
  })
}

export function createWikiAgency(submission: WikiAgencySubmission) {
  return adminApiClient.Post<
    z.infer<typeof wikiAgencyMutationResultSchema>,
    unknown
  >("/api/admin/wiki/agencies", submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiAgencyMutationResultSchema.parse(payload),
  })
}

export function updateWikiAgency(
  agencyId: number,
  submission: Omit<WikiAgencySubmission, "code">
) {
  return adminApiClient.Patch<
    z.infer<typeof wikiAgencyMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/agencies/${agencyId}`, submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiAgencyMutationResultSchema.parse(payload),
  })
}

export function createWikiGroup(
  agencyId: number,
  submission: WikiGroupSubmission
) {
  return adminApiClient.Post<
    z.infer<typeof wikiGroupMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/agencies/${agencyId}/groups`, submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiGroupMutationResultSchema.parse(payload),
  })
}

export function updateWikiGroup(
  groupId: number,
  submission: Omit<WikiGroupSubmission, "code">
) {
  return adminApiClient.Patch<
    z.infer<typeof wikiGroupMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/groups/${groupId}`, submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiGroupMutationResultSchema.parse(payload),
  })
}

export function deleteWikiGroup(groupId: number, expectedRevision: number) {
  return adminApiClient.Delete<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(
    `/api/admin/wiki/groups/${groupId}`,
    { expectedRevision },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function createWikiIdol(
  agencyId: number,
  submission: WikiIdolSubmission
) {
  return adminApiClient.Post<
    z.infer<typeof wikiIdolMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/agencies/${agencyId}/idols`, submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiIdolMutationResultSchema.parse(payload),
  })
}

export function updateWikiIdol(
  idolId: number,
  submission: Omit<WikiIdolSubmission, "folderName">
) {
  return adminApiClient.Patch<
    z.infer<typeof wikiIdolMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/idols/${idolId}`, submission, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiIdolMutationResultSchema.parse(payload),
  })
}

const wikiEntityImagePath = {
  agency: (id: number) => `/api/admin/wiki/agencies/${id}/icon`,
  group: (id: number) => `/api/admin/wiki/groups/${id}/icon`,
  idol: (id: number) => `/api/admin/wiki/idols/${id}/avatar`,
} satisfies Record<WikiEntityImageKind, (id: number) => string>

export function saveWikiEntityImage(input: {
  kind: WikiEntityImageKind
  id: number
  file?: File | null
  transform: WikiImageTransform
  expectedRevision: number
}) {
  const form = new FormData()
  if (input.file) form.append("image", input.file)
  appendImageTransform(form, input.transform)
  form.append("expected_revision", String(input.expectedRevision))
  return adminApiClient.Put<
    z.infer<typeof wikiEntityImageResultSchema>,
    unknown
  >(wikiEntityImagePath[input.kind](input.id), form, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiEntityImageResultSchema.parse(payload),
  })
}

export function uploadWikiAgencyIcon(agency: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("image", file)
  return adminApiClient.Post<
    z.infer<typeof wikiAgencyIconResultSchema>,
    unknown
  >("/api/wiki/agency-icon", form, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiAgencyIconResultSchema.parse(payload),
  })
}

export function deleteWikiAgencyIcon(agency: string) {
  return adminApiClient.Delete<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(
    "/api/wiki/agency-icon",
    { agency },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function saveWikiLayout(
  agencyId: number,
  expectedRevision: number,
  groups: Array<{ id: number; idolIds: number[] }>
) {
  return adminApiClient.Put<z.infer<typeof wikiLayoutResultSchema>, unknown>(
    `/api/admin/wiki/agencies/${agencyId}/layout`,
    { expectedRevision, groups },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiLayoutResultSchema.parse(payload),
    }
  )
}

export function createWikiStory(submission: WikiStorySubmission) {
  const form = new FormData()
  appendStoryFields(form, submission)
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/add_story",
    form,
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function createWikiStoryBatch(submission: WikiStoryBatchSubmission) {
  const form = new FormData()
  form.append("agency", submission.agency)
  form.append("idol", submission.idol)
  form.append("category_name", submission.category.trim())
  form.append("card_name", normalizedCardName(submission.cardName))
  form.append("subtitle", submission.subtitle.trim().replaceAll("|", "｜"))
  form.append(
    "sources_json",
    JSON.stringify(
      submission.sources.map((source) => ({
        upName: source.upName.trim(),
        videoTitle: source.videoTitle.trim(),
        url: source.url.trim().replaceAll("|", ""),
        contentTypeId: source.contentTypeId,
        sourcePlatformId: source.sourcePlatformId,
      }))
    )
  )
  if (submission.image) form.append("image", submission.image)
  if (submission.coverAssetId) {
    form.append("cover_asset_id", String(submission.coverAssetId))
  }
  if (submission.imageTransform) {
    appendImageTransform(form, submission.imageTransform)
  }
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/add_story",
    form,
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function createWikiStorySources(
  cardId: number,
  submission: WikiStorySourcesSubmission
) {
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    `/api/admin/wiki/cards/${cardId}/sources`,
    {
      agency: submission.agency,
      idol: submission.idol,
      expectedRevision: submission.expectedRevision,
      sources: submission.sources.map((source) => ({
        upName: source.upName.trim(),
        videoTitle: source.videoTitle.trim(),
        url: source.url.trim().replaceAll("|", ""),
        contentTypeId: source.contentTypeId,
        sourcePlatformId: source.sourcePlatformId,
      })),
    },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function deleteWikiStoryLink(input: {
  agency: string
  idol: string
  storyId: number
  expectedRevision: number
}) {
  return adminApiClient.Delete<
    z.infer<typeof wikiStoryLinkDeleteResultSchema>,
    unknown
  >(`/api/admin/wiki/stories/${input.storyId}`, undefined, {
    params: {
      agency: input.agency,
      idol: input.idol,
      expectedRevision: input.expectedRevision,
    },
    ...wikiMutationConfig(),
    transform: (payload) => wikiStoryLinkDeleteResultSchema.parse(payload),
  })
}

export function deleteWikiIdol(idolId: number, expectedRevision: number) {
  return adminApiClient.Delete<
    z.infer<typeof wikiIdolDeleteResultSchema>,
    unknown
  >(
    `/api/admin/wiki/idols/${idolId}`,
    { expectedRevision },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiIdolDeleteResultSchema.parse(payload),
    }
  )
}

export function updateWikiCategory(input: {
  categoryId: number
  agencyId: number
  idolId: number
  name: string
  expectedName: string
}) {
  return adminApiClient.Patch<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(
    `/api/admin/wiki/categories/${input.categoryId}`,
    {
      agencyId: input.agencyId,
      idolId: input.idolId,
      name: input.name.trim(),
      expectedName: input.expectedName,
    },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function createWikiCategory(input: {
  agencyId: number
  idolId: number
  name: string
}) {
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    `/api/admin/wiki/agencies/${input.agencyId}/idols/${input.idolId}/categories`,
    { name: input.name.trim() },
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function updateWikiStoryCard(
  cardId: number,
  submission: WikiStoryCardSubmission
) {
  const form = new FormData()
  form.append("agency", submission.agency)
  form.append("idol", submission.idol)
  form.append("category_id", String(submission.categoryId))
  form.append("card_name", normalizedCardName(submission.cardName))
  form.append("subtitle", submission.subtitle.trim().replaceAll("|", "｜"))
  form.append("expected_revision", String(submission.mediaRevision))
  form.append(
    "cover_asset_id",
    submission.coverAssetId == null ? "" : String(submission.coverAssetId)
  )
  if (submission.removeImage) form.append("remove_image", "true")
  appendImageTransform(form, submission.imageTransform)
  if (submission.image) form.append("image", submission.image)
  return adminApiClient.Patch<
    z.infer<typeof wikiMutationResultSchema>,
    unknown
  >(`/api/admin/wiki/cards/${cardId}`, form, {
    ...wikiMutationConfig(),
    transform: (payload) => wikiMutationResultSchema.parse(payload),
  })
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
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/edit_story",
    form,
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function deleteWikiStoryGroup(group: WikiStoryGroup) {
  const form = new FormData()
  appendStoryGroup(form, group)
  form.append("expected_revision", String(group.expectedRevision))
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/delete_story",
    form,
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function deleteWikiCategory(group: Omit<WikiStoryGroup, "cardName">) {
  const form = new FormData()
  form.append("agency", group.agency)
  form.append("idol", group.idol)
  form.append("category_name", group.category)
  form.append("expected_revision", String(group.expectedRevision))
  return adminApiClient.Post<z.infer<typeof wikiMutationResultSchema>, unknown>(
    "/api/wiki/delete_category",
    form,
    {
      ...wikiMutationConfig(),
      transform: (payload) => wikiMutationResultSchema.parse(payload),
    }
  )
}

export function parseBilibiliStoryUrl(url: string) {
  return adminApiClient.Post<BilibiliParseResult, unknown>(
    "/api/wiki/parse_bilibili",
    { url },
    {
      meta: withBackofficeCsrf(),
      transform: (payload) => bilibiliResultSchema.parse(payload),
    }
  )
}
