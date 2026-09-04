import { adminWikiPath, wikiPath } from "@imsweb/contracts/paths"
import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import {
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  WIKI_PUBLIC_CACHE,
} from "../../cache-policy"
import { apiClient } from "../../client"
import {
  normalizeWikiAdminCatalog,
  normalizeWikiAdminStories,
  normalizeWikiPublicCatalog,
  normalizeWikiPublicStories,
  normalizeWikiRandomBackground,
  normalizeWikiRandomIdol,
  normalizeWikiStoryCoverAssets,
} from "../../media-urls"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"
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
  type WikiAdminStory,
  type WikiEntityImageKind,
  type WikiImageTransform,
  type WikiStoryCoverPresentationPolicy,
} from "@imsweb/contracts/wiki"
import type {
  WikiAgencySubmission,
  WikiGroupSubmission,
  WikiIdolSubmission,
  WikiStoryBatchSubmission,
  WikiStoryCardSubmission,
  WikiStoryCatalogOptionSubmission,
  WikiStoryGroup,
  WikiStorySourcePlatformSubmission,
  WikiStorySourcesSubmission,
  WikiStorySubmission,
} from "./schemas"

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
  type WikiEntryKind,
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
  type WikiStoryContentType,
  type WikiStoryCoverAsset,
  type WikiStoryCoverAssets,
  type WikiStoryCoverPresentationPolicy,
  type WikiStoryEntrySubtype,
  type WikiStorySourceCatalog,
  type WikiStorySourcePlatform,
} from "@imsweb/contracts/wiki"
export type {
  WikiAgencySubmission,
  WikiGroupSubmission,
  WikiIdolSubmission,
  WikiStoryBatchSubmission,
  WikiStoryCardSubmission,
  WikiStoryCatalogOptionSubmission,
  WikiStoryGroup,
  WikiStorySourcePlatformSubmission,
  WikiStorySourceSubmission,
  WikiStorySourcesSubmission,
  WikiStorySubmission,
} from "./schemas"

function wikiMutationConfig() {
  return {
    name: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
    meta: withBackofficeCsrf(),
  } as const
}

export function getWikiCatalog(agency?: string) {
  return apiClient.Get(
    wikiPath("/catalog"),
    parsed(wikiPublicCatalogSchema, {
      cacheFor: WIKI_PUBLIC_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
      params: agency ? { agency } : undefined,
      select: normalizeWikiPublicCatalog,
    })
  )
}

export function getWikiStories(agency: string, idol: string) {
  return apiClient.Get(
    wikiPath("/stories"),
    parsed(wikiPublicStoriesSchema, {
      cacheFor: WIKI_PUBLIC_CACHE,
      hitSource: PUBLIC_CACHE_INVALIDATION_SOURCE.wiki,
      params: { agency, idol },
      select: normalizeWikiPublicStories,
    })
  )
}

export function getWikiRandomBackground() {
  return apiClient.Get(
    wikiPath("/random_bg"),
    parsed(wikiRandomBackgroundSchema, {
      cacheFor: NO_CLIENT_CACHE,
      select: normalizeWikiRandomBackground,
    })
  )
}

export function getWikiRandomIdol() {
  return apiClient.Get(
    wikiPath("/random_idol"),
    parsed(wikiRandomIdolSchema, {
      cacheFor: NO_CLIENT_CACHE,
      select: normalizeWikiRandomIdol,
    })
  )
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
  return adminApiClient.Get(
    adminWikiPath("/catalog"),
    parsed(wikiAdminCatalogSchema, {
      meta: withBackofficeAuth(),
      select: normalizeWikiAdminCatalog,
    })
  )
}

export function getAdminWikiStories(agency: string, idol: string) {
  return adminApiClient.Get(
    adminWikiPath("/stories"),
    parsed(wikiAdminStoriesSchema, {
      meta: withBackofficeAuth(),
      params: { agency, idol },
      select: normalizeWikiAdminStories,
    })
  )
}

export function getAdminWikiStoryCoverAssets(agencyId: number) {
  return adminApiClient.Get(
    adminWikiPath(`/agencies/${agencyId}/story-cover-assets`),
    parsed(wikiStoryCoverAssetsSchema, {
      meta: withBackofficeAuth(),
      select: normalizeWikiStoryCoverAssets,
    })
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
  return adminApiClient.Post(
    adminWikiPath(`/agencies/${input.agencyId}/story-cover-assets`),
    form,
    parsed(wikiStoryCoverAssetMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
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
  return adminApiClient.Patch(
    adminWikiPath(`/story-cover-assets/${input.assetId}`),
    form,
    parsed(wikiStoryCoverAssetMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiStoryCoverAsset(assetId: number) {
  return adminApiClient.Delete(
    adminWikiPath(`/story-cover-assets/${assetId}`),
    undefined,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function getWikiStorySourceCatalog() {
  return adminApiClient.Get(
    adminWikiPath("/story-source-catalog"),
    parsed(wikiStorySourceCatalogSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function createWikiStoryContentType(
  submission: WikiStoryCatalogOptionSubmission
) {
  return adminApiClient.Post(
    adminWikiPath("/story-content-types"),
    submission,
    parsed(wikiStoryContentTypeMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiStoryContentType(
  optionId: number,
  expectedRevision: number,
  submission: WikiStoryCatalogOptionSubmission
) {
  return adminApiClient.Patch(
    adminWikiPath(`/story-content-types/${optionId}`),
    {
      ...submission,
      expectedRevision,
    },
    parsed(wikiStoryContentTypeMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiStoryContentType(optionId: number) {
  return adminApiClient.Delete(
    adminWikiPath(`/story-content-types/${optionId}`),
    undefined,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiStorySourcePlatform(
  submission: WikiStorySourcePlatformSubmission
) {
  return adminApiClient.Post(
    adminWikiPath("/story-source-platforms"),
    submission,
    parsed(wikiStorySourcePlatformMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiStorySourcePlatform(
  optionId: number,
  expectedRevision: number,
  submission: WikiStorySourcePlatformSubmission
) {
  return adminApiClient.Patch(
    adminWikiPath(`/story-source-platforms/${optionId}`),
    {
      ...submission,
      expectedRevision,
    },
    parsed(wikiStorySourcePlatformMutationSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiStorySourcePlatform(optionId: number) {
  return adminApiClient.Delete(
    adminWikiPath(`/story-source-platforms/${optionId}`),
    undefined,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiAgency(submission: WikiAgencySubmission) {
  return adminApiClient.Post(
    adminWikiPath("/agencies"),
    submission,
    parsed(wikiAgencyMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiAgency(
  agencyId: number,
  submission: Omit<WikiAgencySubmission, "code">
) {
  return adminApiClient.Patch(
    adminWikiPath(`/agencies/${agencyId}`),
    submission,
    parsed(wikiAgencyMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiGroup(
  agencyId: number,
  submission: WikiGroupSubmission
) {
  return adminApiClient.Post(
    adminWikiPath(`/agencies/${agencyId}/groups`),
    submission,
    parsed(wikiGroupMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiGroup(
  groupId: number,
  submission: Omit<WikiGroupSubmission, "code">
) {
  return adminApiClient.Patch(
    adminWikiPath(`/groups/${groupId}`),
    submission,
    parsed(wikiGroupMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiGroup(groupId: number, expectedRevision: number) {
  return adminApiClient.Delete(
    adminWikiPath(`/groups/${groupId}`),
    { expectedRevision },
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiIdol(
  agencyId: number,
  submission: WikiIdolSubmission
) {
  return adminApiClient.Post(
    adminWikiPath(`/agencies/${agencyId}/idols`),
    submission,
    parsed(wikiIdolMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiIdol(
  idolId: number,
  submission: Omit<WikiIdolSubmission, "folderName">
) {
  return adminApiClient.Patch(
    adminWikiPath(`/idols/${idolId}`),
    submission,
    parsed(wikiIdolMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

const wikiEntityImagePath = {
  agency: (id: number) => adminWikiPath(`/agencies/${id}/icon`),
  group: (id: number) => adminWikiPath(`/groups/${id}/icon`),
  idol: (id: number) => adminWikiPath(`/idols/${id}/avatar`),
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
  return adminApiClient.Put(
    wikiEntityImagePath[input.kind](input.id),
    form,
    parsed(wikiEntityImageResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function uploadWikiAgencyIcon(agency: string, file: File) {
  const form = new FormData()
  form.append("agency", agency)
  form.append("image", file)
  return adminApiClient.Post(
    wikiPath("/agency-icon"),
    form,
    parsed(wikiAgencyIconResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiAgencyIcon(agency: string) {
  return adminApiClient.Delete(
    wikiPath("/agency-icon"),
    { agency },
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function saveWikiLayout(
  agencyId: number,
  expectedRevision: number,
  groups: Array<{ id: number; idolIds: number[] }>
) {
  return adminApiClient.Put(
    adminWikiPath(`/agencies/${agencyId}/layout`),
    { expectedRevision, groups },
    parsed(wikiLayoutResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiStory(submission: WikiStorySubmission) {
  const form = new FormData()
  appendStoryFields(form, submission)
  return adminApiClient.Post(
    wikiPath("/add_story"),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
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
  return adminApiClient.Post(
    wikiPath("/add_story"),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiStorySources(
  cardId: number,
  submission: WikiStorySourcesSubmission
) {
  return adminApiClient.Post(
    adminWikiPath(`/cards/${cardId}/sources`),
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
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiStoryLink(input: {
  agency: string
  idol: string
  storyId: number
  expectedRevision: number
}) {
  return adminApiClient.Delete(
    adminWikiPath(`/stories/${input.storyId}`),
    undefined,
    parsed(wikiStoryLinkDeleteResultSchema, {
      params: {
        agency: input.agency,
        idol: input.idol,
        expectedRevision: input.expectedRevision,
      },
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiIdol(idolId: number, expectedRevision: number) {
  return adminApiClient.Delete(
    adminWikiPath(`/idols/${idolId}`),
    { expectedRevision },
    parsed(wikiIdolDeleteResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function updateWikiCategory(input: {
  categoryId: number
  agencyId: number
  idolId: number
  name: string
  expectedName: string
}) {
  return adminApiClient.Patch(
    adminWikiPath(`/categories/${input.categoryId}`),
    {
      agencyId: input.agencyId,
      idolId: input.idolId,
      name: input.name.trim(),
      expectedName: input.expectedName,
    },
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function createWikiCategory(input: {
  agencyId: number
  idolId: number
  name: string
}) {
  return adminApiClient.Post(
    adminWikiPath(
      `/agencies/${input.agencyId}/idols/${input.idolId}/categories`
    ),
    { name: input.name.trim() },
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
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
  return adminApiClient.Patch(
    adminWikiPath(`/cards/${cardId}`),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
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
  return adminApiClient.Post(
    wikiPath("/edit_story"),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiStoryGroup(group: WikiStoryGroup) {
  const form = new FormData()
  appendStoryGroup(form, group)
  form.append("expected_revision", String(group.expectedRevision))
  return adminApiClient.Post(
    wikiPath("/delete_story"),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function deleteWikiCategory(group: Omit<WikiStoryGroup, "cardName">) {
  const form = new FormData()
  form.append("agency", group.agency)
  form.append("idol", group.idol)
  form.append("category_name", group.category)
  form.append("expected_revision", String(group.expectedRevision))
  return adminApiClient.Post(
    wikiPath("/delete_category"),
    form,
    parsed(wikiMutationResultSchema, {
      ...wikiMutationConfig(),
    })
  )
}

export function parseBilibiliStoryUrl(url: string) {
  return adminApiClient.Post(
    wikiPath("/parse_bilibili"),
    { url },
    parsed(bilibiliResultSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
