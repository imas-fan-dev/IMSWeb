import { z } from "zod"

import type {
  WikiAdminCatalogContract,
  WikiAdminStoriesContract,
  WikiPublicCatalogContract,
  WikiPublicStoriesContract,
} from "~/lib/api/generated/wiki-contracts"

export const wikiImageTransformSchema = z.object({
  fit: z.enum(["contain", "cover"]),
  focalX: z.coerce.number().min(0).max(1),
  focalY: z.coerce.number().min(0).max(1),
  zoom: z.coerce.number().min(1).max(3),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
})

export type WikiImageTransform = z.infer<typeof wikiImageTransformSchema>

export const defaultWikiImageTransform: WikiImageTransform = {
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  rotation: 0,
}

export const wikiStoryCoverPresentationPolicySchema = z.enum([
  "inherit",
  "contain",
])
export const wikiEntryKindSchema = z.enum(["idol", "unit", "story", "other"])
export const wikiStoryEntrySubtypeSchema = z.enum([
  "main",
  "event",
  "special",
  "other",
])

export const wikiAdminIdolSchema = z.object({
  id: z.coerce.number().int().positive(),
  agencyId: z.coerce.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  wikiUrl: z.string().nullable().default(null),
  textColor: z.string(),
  displayOrder: z.coerce.number().int().nonnegative(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  mediaRevision: z.coerce.number().int().nonnegative().default(0),
  wikiEnabled: z.boolean().default(true),
  groupIds: z.array(z.coerce.number().int().positive()).default([]),
  entryKind: wikiEntryKindSchema.default("idol"),
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable().default(null),
})

export const wikiAdminGroupSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  displayOrder: z.coerce.number().int().nonnegative(),
  isFallback: z.boolean(),
  idolIds: z.array(z.coerce.number().int().positive()).default([]),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  mediaRevision: z.coerce.number().int().nonnegative().default(0),
  idols: z.array(wikiAdminIdolSchema),
})

export const wikiAdminAgencySchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  wikiEnabled: z.boolean(),
  bannerTitle: z.string(),
  displayOrder: z.coerce.number().int().nonnegative(),
  layoutRevision: z.coerce.number().int().nonnegative(),
  iconUrl: z.string().nullable(),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  mediaRevision: z.coerce.number().int().nonnegative().default(0),
  idols: z.array(wikiAdminIdolSchema).default([]),
  groups: z.array(wikiAdminGroupSchema),
})

export const wikiAdminCatalogSchema = z.object({
  status: z.literal("success"),
  agencies: z.array(wikiAdminAgencySchema),
})

export const wikiAdminStoryCardSchema = z.object({
  category: z.string(),
  cardName: z.string(),
  subtitle: z.string(),
  imageFile: z.string().nullable(),
  coverAssetId: z.coerce.number().int().positive().nullable().optional(),
  coverAssetName: z.string().nullable().optional(),
  imageUrl: z.string(),
  cardId: z.coerce.number().int().positive(),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  mediaRevision: z.coerce.number().int().nonnegative().default(0),
  revision: z.coerce.number().int().nonnegative(),
})

export const wikiAdminStorySchema = wikiAdminStoryCardSchema.extend({
  id: z.coerce.number().int().positive(),
  upName: z.string(),
  videoTitle: z.string(),
  url: z.string(),
  contentTypeId: z.coerce.number().int().positive(),
  contentTypeName: z.string(),
  sourcePlatformId: z.coerce.number().int().positive(),
  sourcePlatformName: z.string(),
})

export const wikiStoryCatalogOptionSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  description: z.string(),
  displayOrder: z.coerce.number().int().nonnegative(),
  isActive: z.boolean(),
  revision: z.coerce.number().int().nonnegative(),
})

export const wikiStoryContentTypeSchema = wikiStoryCatalogOptionSchema.extend({
  iconName: z.string().default("link-2"),
})

export const wikiStorySourcePlatformSchema =
  wikiStoryCatalogOptionSchema.extend({
    homepageUrl: z.string(),
  })

export const wikiStorySourceCatalogSchema = z.object({
  status: z.literal("success"),
  contentTypes: z.array(wikiStoryContentTypeSchema),
  sourcePlatforms: z.array(wikiStorySourcePlatformSchema),
})

export const wikiAdminStoriesSchema = z.object({
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
      revision: z.coerce.number().int().nonnegative(),
    })
  ),
  contentTypes: z.array(wikiStoryContentTypeSchema),
  sourcePlatforms: z.array(wikiStorySourcePlatformSchema),
  cards: z.array(wikiAdminStoryCardSchema),
  stories: z.array(wikiAdminStorySchema),
})

export const wikiStoryCoverAssetSchema = z.object({
  id: z.coerce.number().int().positive(),
  agencyId: z.coerce.number().int().positive(),
  name: z.string(),
  imageUrl: z.string(),
  presentationPolicy: wikiStoryCoverPresentationPolicySchema.default("inherit"),
  displayOrder: z.coerce.number().int().nonnegative(),
  isActive: z.boolean(),
  revision: z.coerce.number().int().nonnegative(),
  usageCount: z.coerce.number().int().nonnegative(),
})

export const wikiStoryCoverAssetsSchema = z.object({
  status: z.literal("success"),
  agency: z.object({
    id: z.coerce.number().int().positive(),
    code: z.string(),
    name: z.string(),
  }),
  assets: z.array(wikiStoryCoverAssetSchema),
})

export const wikiMutationResultSchema = z.object({
  status: z.literal("success"),
})

export const wikiStoryCoverAssetMutationSchema =
  wikiMutationResultSchema.extend({
    asset: wikiStoryCoverAssetSchema,
  })

export const wikiAgencyMutationResultSchema = wikiMutationResultSchema.extend({
  agency: z.object({ id: z.coerce.number().int().positive() }),
})

export const wikiGroupMutationResultSchema = wikiMutationResultSchema.extend({
  group: z.object({ id: z.coerce.number().int().positive() }),
})

export const wikiIdolMutationResultSchema = wikiMutationResultSchema.extend({
  idol: z.object({ id: z.coerce.number().int().positive() }),
})

export const wikiIdolDeleteResultSchema = wikiMutationResultSchema.extend({
  softDeleted: z.object({
    cards: z.coerce.number().int().nonnegative(),
    stories: z.coerce.number().int().nonnegative(),
  }),
})

export const wikiAgencyIconResultSchema = wikiMutationResultSchema.extend({
  url: z.string(),
})

export const wikiStoryContentTypeMutationSchema =
  wikiMutationResultSchema.extend({
    option: wikiStoryContentTypeSchema,
  })

export const wikiStorySourcePlatformMutationSchema =
  wikiMutationResultSchema.extend({
    option: wikiStorySourcePlatformSchema,
  })

export const wikiEntityImageResultSchema = wikiMutationResultSchema.extend({
  url: z.string(),
  mediaRevision: z.coerce.number().int().nonnegative(),
  imageTransform: wikiImageTransformSchema,
})

export const wikiStoryLinkDeleteResultSchema = wikiMutationResultSchema.extend({
  cardDeleted: z.boolean(),
})

export type WikiEntityImageKind = "agency" | "group" | "idol"

export const wikiLayoutResultSchema = z.object({
  status: z.literal("success"),
  layoutRevision: z.coerce.number().int().nonnegative(),
})

export const bilibiliResultSchema = z.object({
  status: z.literal("success"),
  title: z.string(),
  up: z.string(),
  std_url: z.string(),
  cover_url: z.string().default(""),
})

export const wikiPublicAgencySchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  bannerTitle: z.string(),
  iconUrl: z.string().nullable(),
  idolCount: z.coerce.number().int().nonnegative(),
  entryCount: z.coerce.number().int().nonnegative(),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
})

export const wikiPublicIdolSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  wikiUrl: z.string().nullable().default(null),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  textColor: z.string(),
  entryKind: wikiEntryKindSchema.default("idol"),
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable().default(null),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
})

export const wikiPublicSearchEntrySchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  agencyId: z.coerce.number().int().positive(),
  agencyCode: z.string(),
  agencyName: z.string(),
  agencyColor: z.string(),
  entryKind: wikiEntryKindSchema.default("idol"),
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable().default(null),
})

export const wikiPublicGroupSchema = z.object({
  id: z.coerce.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  idols: z.array(wikiPublicIdolSchema),
})

export const wikiPublicCatalogSchema = z.object({
  status: z.literal("success"),
  agencies: z.array(wikiPublicAgencySchema),
  searchEntries: z.array(wikiPublicSearchEntrySchema).default([]),
  selection: z
    .object({
      agency: wikiPublicAgencySchema,
      layoutRevision: z.coerce.number().int().nonnegative(),
      groups: z.array(wikiPublicGroupSchema),
      ungroupedIdols: z.array(wikiPublicIdolSchema).default([]),
    })
    .nullable(),
})

export const wikiPublicStoryLinkSchema = z.object({
  id: z.coerce.number().int().positive(),
  up: z.string(),
  title: z.string(),
  url: z.string(),
  contentType: z.string(),
  contentTypeIcon: z.string().default("link-2"),
  sourcePlatform: z.string(),
})

export const wikiPublicStoryCardSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string(),
  img: z.string(),
  subtitle: z.string(),
  imageTransform: wikiImageTransformSchema.default(defaultWikiImageTransform),
  links: z.array(wikiPublicStoryLinkSchema),
})

export const wikiPublicStoriesSchema = z.object({
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

export const wikiRandomBackgroundSchema = z.object({
  url: z.string(),
  card_id: z.coerce.number().int().positive().optional(),
  card_name: z.string().optional(),
  idol_name: z.string().optional(),
  agency_name: z.string().optional(),
})

export const wikiRandomIdolSchema = z.object({
  status: z.literal("success"),
  eligibleCount: z.coerce.number().int().nonnegative(),
  idol: z
    .object({
      id: z.coerce.number().int().positive(),
      name: z.string(),
      color: z.string().nullable(),
      textColor: z.string(),
      imageUrl: z.string(),
      imageTransform: wikiImageTransformSchema.default(
        defaultWikiImageTransform
      ),
      agency: z.object({
        id: z.coerce.number().int().positive(),
        code: z.string(),
        name: z.string(),
        color: z.string(),
        iconUrl: z.string().nullable().default(null),
        imageTransform: wikiImageTransformSchema.default(
          defaultWikiImageTransform
        ),
      }),
    })
    .nullable(),
})

export type WikiAdminCatalog = z.infer<typeof wikiAdminCatalogSchema>
export type WikiAdminAgency = z.infer<typeof wikiAdminAgencySchema>
export type WikiAdminGroup = z.infer<typeof wikiAdminGroupSchema>
export type WikiAdminIdol = z.infer<typeof wikiAdminIdolSchema>
export type WikiAdminStories = z.infer<typeof wikiAdminStoriesSchema>
export type WikiAdminStoryCard = z.infer<typeof wikiAdminStoryCardSchema>
export type WikiAdminStory = z.infer<typeof wikiAdminStorySchema>
export type WikiStoryCoverAsset = z.infer<typeof wikiStoryCoverAssetSchema>
export type WikiStoryCoverPresentationPolicy = z.infer<
  typeof wikiStoryCoverPresentationPolicySchema
>
export type WikiStoryCoverAssets = z.infer<typeof wikiStoryCoverAssetsSchema>
export type WikiStoryContentType = z.infer<typeof wikiStoryContentTypeSchema>
export type WikiStorySourcePlatform = z.infer<
  typeof wikiStorySourcePlatformSchema
>
export type WikiStorySourceCatalog = z.infer<
  typeof wikiStorySourceCatalogSchema
>
export type WikiEntryKind = z.infer<typeof wikiEntryKindSchema>
export type WikiStoryEntrySubtype = z.infer<typeof wikiStoryEntrySubtypeSchema>
export type BilibiliParseResult = z.infer<typeof bilibiliResultSchema>
export type WikiPublicAgency = z.infer<typeof wikiPublicAgencySchema>
export type WikiPublicIdol = z.infer<typeof wikiPublicIdolSchema>
export type WikiPublicSearchEntry = z.infer<typeof wikiPublicSearchEntrySchema>
export type WikiPublicCatalog = z.infer<typeof wikiPublicCatalogSchema>
export type WikiPublicStories = z.infer<typeof wikiPublicStoriesSchema>
export type WikiPublicStoryCategory = WikiPublicStories["categories"][number]
export type WikiPublicStoryCard = WikiPublicStoryCategory["cards"][number]
export type WikiRandomBackground = z.infer<typeof wikiRandomBackgroundSchema>
export type WikiRandomIdol = z.infer<typeof wikiRandomIdolSchema>

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

type Exact<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Condition extends true> = Condition

// Compile-time checks that the zod-inferred response types match the API
// contracts generated from apps/api/src/ports/wiki-contracts.ts. Exported so
// the assertions participate in the module surface without leaking through
// the wiki endpoint facade, which re-exports an explicit public surface.
export type WikiAdminCatalogMatchesApi = Assert<
  Exact<WikiAdminCatalog, WikiAdminCatalogContract>
>
export type WikiAdminStoriesMatchesApi = Assert<
  Exact<WikiAdminStories, WikiAdminStoriesContract>
>
export type WikiPublicCatalogMatchesApi = Assert<
  Exact<WikiPublicCatalog, WikiPublicCatalogContract>
>
export type WikiPublicStoriesMatchesApi = Assert<
  Exact<WikiPublicStories, WikiPublicStoriesContract>
>
