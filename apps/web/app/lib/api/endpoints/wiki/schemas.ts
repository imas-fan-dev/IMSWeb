// Wire-format schemas and response types come from the shared workspace
// package @imsweb/contracts — the single source of truth consumed by both
// the API (response typing + conformance tests) and this client (runtime
// parsing). Only Web-side request submission shapes live here.
import type {
  WikiEntryKind,
  WikiImageTransform,
  WikiStoryEntrySubtype,
} from "@imsweb/contracts/wiki"

export {
  wikiImageTransformSchema,
  defaultWikiImageTransform,
  wikiStoryCoverPresentationPolicySchema,
  wikiEntryKindSchema,
  wikiStoryEntrySubtypeSchema,
  wikiAgencySummarySchema,
  wikiCategorySchema,
  wikiAdminIdolSchema,
  wikiAdminGroupSchema,
  wikiAdminAgencySchema,
  wikiAdminCatalogSchema,
  wikiAdminStoryCardSchema,
  wikiAdminStorySchema,
  wikiStoryCatalogOptionSchema,
  wikiStoryContentTypeSchema,
  wikiStorySourcePlatformSchema,
  wikiStorySourceCatalogSchema,
  wikiAdminStoriesSchema,
  wikiStoryCoverAssetSchema,
  wikiStoryCoverAssetsSchema,
  wikiMutationResultSchema,
  wikiStoryCoverAssetMutationSchema,
  wikiAgencyMutationResultSchema,
  wikiGroupMutationResultSchema,
  wikiIdolMutationResultSchema,
  wikiIdolDeleteResultSchema,
  wikiAgencyIconResultSchema,
  wikiStoryContentTypeMutationSchema,
  wikiStorySourcePlatformMutationSchema,
  wikiEntityImageResultSchema,
  wikiStoryLinkDeleteResultSchema,
  wikiLayoutResultSchema,
  bilibiliResultSchema,
  wikiPublicAgencySchema,
  wikiPublicIdolSchema,
  wikiPublicSearchEntrySchema,
  wikiPublicGroupSchema,
  wikiPublicCatalogSchema,
  wikiPublicStoryLinkSchema,
  wikiPublicStoryCardSchema,
  wikiPublicStoriesSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
  idolMediaSourceSchema,
  idolMediaCatalogSchema,
  wikiIdolMediaUploadResultSchema,
} from "@imsweb/contracts/wiki"
export type * from "@imsweb/contracts/wiki"

export type WikiStorySubmission = {
  agency: string
  idol: string
  category: string
  cardName: string
  upName: string
  videoTitle: string
  url: string
  contentTypeId: number
  sourcePlatformId: number
  subtitle: string
  image?: File | null
  imageTransform?: WikiImageTransform
  mediaRevision?: number
}

export type WikiStorySourceSubmission = {
  upName: string
  videoTitle: string
  url: string
  contentTypeId: number
  sourcePlatformId: number
}

export type WikiStoryCatalogOptionSubmission = {
  name: string
  iconName: string
  description: string
  isActive: boolean
}

export type WikiStorySourcePlatformSubmission = Omit<
  WikiStoryCatalogOptionSubmission,
  "iconName"
> & {
  homepageUrl: string
}

export type WikiStoryBatchSubmission = {
  agency: string
  idol: string
  category: string
  cardName: string
  subtitle: string
  sources: WikiStorySourceSubmission[]
  image?: File | null
  coverAssetId?: number | null
  imageTransform?: WikiImageTransform
}

export type WikiStorySourcesSubmission = {
  agency: string
  idol: string
  expectedRevision: number
  sources: WikiStorySourceSubmission[]
}

export type WikiStoryCardSubmission = {
  agency: string
  idol: string
  categoryId: number
  cardName: string
  subtitle: string
  image?: File | null
  coverAssetId?: number | null
  removeImage?: boolean
  imageTransform: WikiImageTransform
  mediaRevision: number
}

export type WikiAgencySubmission = {
  code: string
  name: string
  color: string
  bannerTitle: string
  wikiEnabled: boolean
}

export type WikiGroupSubmission = {
  code: string
  name: string
  color: string
}

export type WikiIdolSubmission = {
  name: string
  folderName: string
  color: string | null
  textColor: string
  wikiUrl: string | null
  wikiEnabled: boolean
  groupIds: number[]
  entryKind?: WikiEntryKind
  entrySubtype?: WikiStoryEntrySubtype | null
}

export type WikiStoryGroup = {
  agency: string
  idol: string
  category: string
  cardName: string
  expectedRevision: number
}
