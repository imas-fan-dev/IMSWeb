import { z } from "zod"
import {
  businessErrorResponseSchema,
  errorResponseSchema,
  exactJsonResponse,
  legacyStripRequestObject,
} from "./common.js"

export const wikiImageTransformSchema = exactJsonResponse({
  fit: z.enum(["contain", "cover"]),
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3),
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

export const wikiAgencySummarySchema = exactJsonResponse({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
})

export const wikiCategorySchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string(),
  storageSlug: z.string(),
  displayOrder: z.number().int().nonnegative(),
  showWhenEmpty: z.boolean(),
  backgroundEligible: z.boolean(),
  revision: z.number().int().nonnegative(),
})

export const wikiAdminIdolSchema = exactJsonResponse({
  id: z.number().int().positive(),
  agencyId: z.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  wikiUrl: z.string().nullable(),
  textColor: z.string(),
  displayOrder: z.number().int().nonnegative(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: z.number().int().nonnegative(),
  wikiEnabled: z.boolean(),
  groupIds: z.array(z.number().int().positive()),
  entryKind: wikiEntryKindSchema,
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable(),
})

export const wikiAdminGroupSchema = exactJsonResponse({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  displayOrder: z.number().int().nonnegative(),
  isFallback: z.boolean(),
  idolIds: z.array(z.number().int().positive()),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: z.number().int().nonnegative(),
  idols: z.array(wikiAdminIdolSchema),
})

export const wikiAdminAgencySchema = exactJsonResponse({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  wikiEnabled: z.boolean(),
  bannerTitle: z.string(),
  displayOrder: z.number().int().nonnegative(),
  layoutRevision: z.number().int().nonnegative(),
  iconUrl: z.string().nullable(),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: z.number().int().nonnegative(),
  idols: z.array(wikiAdminIdolSchema),
  groups: z.array(wikiAdminGroupSchema),
})

export const wikiAdminCatalogSchema = exactJsonResponse({
  status: z.literal("success"),
  agencies: z.array(wikiAdminAgencySchema),
})

export const wikiAdminStoryCardSchema = exactJsonResponse({
  category: z.string(),
  cardName: z.string(),
  subtitle: z.string(),
  imageFile: z.string().nullable(),
  coverAssetId: z.number().int().positive().nullable().optional(),
  coverAssetName: z.string().nullable().optional(),
  imageUrl: z.string(),
  cardId: z.number().int().positive(),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
})

export const wikiAdminStorySchema = wikiAdminStoryCardSchema.extend({
  id: z.number().int().positive(),
  upName: z.string(),
  videoTitle: z.string(),
  url: z.string(),
  contentTypeId: z.number().int().positive(),
  contentTypeName: z.string(),
  sourcePlatformId: z.number().int().positive(),
  sourcePlatformName: z.string(),
}).strict()

export const wikiStoryCatalogOptionSchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  displayOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  revision: z.number().int().nonnegative(),
})

export const wikiStoryContentTypeSchema = wikiStoryCatalogOptionSchema.extend({
  iconName: z.string(),
}).strict()

export const wikiStorySourcePlatformSchema =
  wikiStoryCatalogOptionSchema.extend({
    homepageUrl: z.string(),
  }).strict()

export const wikiStorySourceCatalogSchema = exactJsonResponse({
  status: z.literal("success"),
  contentTypes: z.array(wikiStoryContentTypeSchema),
  sourcePlatforms: z.array(wikiStorySourcePlatformSchema),
})

export const wikiAdminStoriesIdolSchema = exactJsonResponse({
  id: z.number().int().positive(),
  agencyId: z.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  wikiUrl: z.string().nullable(),
  textColor: z.string(),
  displayOrder: z.number().int().nonnegative(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  imageTransform: wikiImageTransformSchema,
  mediaRevision: z.number().int().nonnegative(),
  entryKind: wikiEntryKindSchema,
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable(),
})

export const wikiAdminStoriesSchema = exactJsonResponse({
  status: z.literal("success"),
  agency: wikiAgencySummarySchema,
  idol: wikiAdminStoriesIdolSchema,
  categories: z.array(wikiCategorySchema),
  contentTypes: z.array(wikiStoryContentTypeSchema),
  sourcePlatforms: z.array(wikiStorySourcePlatformSchema),
  cards: z.array(wikiAdminStoryCardSchema),
  stories: z.array(wikiAdminStorySchema),
})

export const wikiStoryCoverAssetSchema = exactJsonResponse({
  id: z.number().int().positive(),
  agencyId: z.number().int().positive(),
  name: z.string(),
  imageUrl: z.string(),
  presentationPolicy: wikiStoryCoverPresentationPolicySchema,
  displayOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  revision: z.number().int().nonnegative(),
  usageCount: z.number().int().nonnegative(),
})

export const wikiStoryCoverAssetsSchema = exactJsonResponse({
  status: z.literal("success"),
  agency: exactJsonResponse({
    id: z.number().int().positive(),
    code: z.string(),
    name: z.string(),
  }),
  assets: z.array(wikiStoryCoverAssetSchema),
})

export const wikiMutationResultSchema = exactJsonResponse({
  status: z.literal("success"),
})

export const wikiErrorResponseSchema = businessErrorResponseSchema
export const wikiRevisionConflictResponseSchema = wikiErrorResponseSchema
  .extend({
    revision: z.number().int().nonnegative().optional(),
    mediaRevision: z.number().int().nonnegative().optional(),
    iconMediaRevision: z.number().int().nonnegative().optional(),
    avatarMediaRevision: z.number().int().nonnegative().optional(),
    layoutRevision: z.number().int().nonnegative().optional(),
    currentName: z.string().optional(),
  })
  .strict()
export const wikiHttpErrorResponseSchema = z.union([
  errorResponseSchema,
  wikiRevisionConflictResponseSchema,
])
// Compatibility probe retained for existing `/api/wiki/test` clients.
export const wikiTestResponseSchema = exactJsonResponse({ status: z.literal("ok") })

export const wikiStoryCoverAssetMutationSchema = wikiMutationResultSchema
  .extend({ asset: wikiStoryCoverAssetSchema })
  .strict()

export const wikiAgencyMutationResultSchema = wikiMutationResultSchema.extend({
  agency: exactJsonResponse({
    id: z.number().int().positive(),
    code: z.string(),
    name: z.string(),
    color: z.string(),
    wikiEnabled: z.boolean(),
    bannerTitle: z.string(),
    displayOrder: z.number().int().nonnegative(),
    layoutRevision: z.number().int().nonnegative(),
    iconUrl: z.string().nullable(),
    imageTransform: wikiImageTransformSchema,
    mediaRevision: z.number().int().nonnegative(),
  }),
}).strict()

export const wikiGroupMutationResultSchema = wikiMutationResultSchema.extend({
  group: exactJsonResponse({
    id: z.number().int().positive(),
    agencyId: z.number().int().positive(),
    code: z.string(),
    name: z.string(),
    color: z.string(),
    displayOrder: z.number().int().nonnegative(),
    isFallback: z.boolean(),
    iconUrl: z.string().nullable(),
    imageTransform: wikiImageTransformSchema,
    mediaRevision: z.number().int().nonnegative(),
  }),
}).strict()

export const wikiIdolMutationResultSchema = wikiMutationResultSchema.extend({
  idol: exactJsonResponse({
    id: z.number().int().positive(),
    agencyId: z.number().int().positive(),
    name: z.string(),
    folderName: z.string(),
    color: z.string().nullable(),
    wikiUrl: z.string().nullable(),
    wikiEnabled: z.boolean(),
    displayOrder: z.number().int().nonnegative(),
    textColor: z.string(),
    imageFit: z.enum(["contain", "cover"]),
    groupIds: z.array(z.number().int().positive()),
    imageUrl: z.string(),
    imageTransform: wikiImageTransformSchema,
    mediaRevision: z.number().int().nonnegative(),
    entryKind: wikiEntryKindSchema,
    entrySubtype: wikiStoryEntrySubtypeSchema.nullable(),
  }),
}).strict()

export const wikiIdolDeleteResultSchema = wikiMutationResultSchema.extend({
  softDeleted: exactJsonResponse({
    cards: z.number().int().nonnegative(),
    stories: z.number().int().nonnegative(),
  }),
}).strict()

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
  mediaRevision: z.number().int().nonnegative(),
  imageTransform: wikiImageTransformSchema,
}).strict()

export const wikiStoryLinkDeleteResultSchema = wikiMutationResultSchema.extend({
  cardDeleted: z.boolean(),
  mediaRevision: z.number().int().nonnegative(),
}).strict()

export const wikiCategoryMutationResultSchema = wikiMutationResultSchema
  .extend({ category: wikiCategorySchema })
  .strict()
export const wikiStorySourceMutationResultSchema = wikiMutationResultSchema
  .extend({
    sourceCount: z.number().int().nonnegative(),
    mediaRevision: z.number().int().nonnegative().optional(),
  })
  .strict()
export const wikiStoryCardMutationResultSchema = wikiMutationResultSchema
  .extend({
    mediaRevision: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    imageFile: z.string().nullable(),
    coverAssetId: z.number().int().positive().nullable(),
    imageTransform: wikiImageTransformSchema,
  })
  .strict()

export type WikiEntityImageKind = "agency" | "group" | "idol"

export const wikiLayoutResultSchema = exactJsonResponse({
  status: z.literal("success"),
  layoutRevision: z.number().int().nonnegative(),
})

export const bilibiliResultSchema = exactJsonResponse({
  status: z.literal("success"),
  title: z.string(),
  up: z.string(),
  std_url: z.string(),
  cover_url: z.string(),
})

export const wikiPublicAgencySchema = exactJsonResponse({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  bannerTitle: z.string(),
  iconUrl: z.string().nullable(),
  idolCount: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  imageTransform: wikiImageTransformSchema,
})

export const wikiPublicIdolSchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string(),
  folderName: z.string(),
  color: z.string().nullable(),
  wikiUrl: z.string().nullable(),
  imageUrl: z.string(),
  imageFit: z.enum(["contain", "cover"]),
  textColor: z.string(),
  entryKind: wikiEntryKindSchema,
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable(),
  imageTransform: wikiImageTransformSchema,
})

export const wikiPublicSearchEntrySchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string(),
  agencyId: z.number().int().positive(),
  agencyCode: z.string(),
  agencyName: z.string(),
  agencyColor: z.string(),
  entryKind: wikiEntryKindSchema,
  entrySubtype: wikiStoryEntrySubtypeSchema.nullable(),
})

export const wikiPublicGroupSchema = exactJsonResponse({
  id: z.number().int().positive(),
  code: z.string(),
  name: z.string(),
  color: z.string(),
  iconUrl: z.string().nullable(),
  imageTransform: wikiImageTransformSchema,
  idols: z.array(wikiPublicIdolSchema),
})

export const wikiPublicCatalogSchema = exactJsonResponse({
  status: z.literal("success"),
  agencies: z.array(wikiPublicAgencySchema),
  searchEntries: z.array(wikiPublicSearchEntrySchema),
  selection: exactJsonResponse({
    agency: wikiPublicAgencySchema,
    layoutRevision: z.number().int().nonnegative(),
    groups: z.array(wikiPublicGroupSchema),
    ungroupedIdols: z.array(wikiPublicIdolSchema),
  }).nullable(),
})

export const wikiPublicStoryLinkSchema = exactJsonResponse({
  id: z.number().int().positive(),
  up: z.string(),
  title: z.string(),
  url: z.string(),
  contentType: z.string(),
  contentTypeIcon: z.string(),
  sourcePlatform: z.string(),
})

export const wikiPublicStoryCardSchema = exactJsonResponse({
  id: z.number().int().positive(),
  name: z.string(),
  img: z.string(),
  subtitle: z.string(),
  imageTransform: wikiImageTransformSchema,
  links: z.array(wikiPublicStoryLinkSchema),
})

export const wikiPublicStoriesSchema = exactJsonResponse({
  status: z.literal("success"),
  agency: wikiAgencySummarySchema,
  idol: wikiPublicIdolSchema,
  categories: z.array(
    exactJsonResponse({
      name: z.string(),
      cards: z.array(wikiPublicStoryCardSchema),
    })
  ),
})

export const wikiRandomBackgroundSchema = exactJsonResponse({
  url: z.string(),
  card_id: z.number().int().positive().optional(),
  card_name: z.string().optional(),
  idol_name: z.string().optional(),
  agency_name: z.string().optional(),
})

export const wikiRandomIdolSchema = exactJsonResponse({
  status: z.literal("success"),
  eligibleCount: z.number().int().nonnegative(),
  idol: exactJsonResponse({
    id: z.number().int().positive(),
    name: z.string(),
    color: z.string().nullable(),
    textColor: z.string(),
    imageUrl: z.string(),
    imageTransform: wikiImageTransformSchema,
    agency: exactJsonResponse({
      id: z.number().int().positive(),
      code: z.string(),
      name: z.string(),
      color: z.string(),
      iconUrl: z.string().nullable(),
      imageTransform: wikiImageTransformSchema,
    }),
  }).nullable(),
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

export type WikiAgencySummary = z.infer<typeof wikiAgencySummarySchema>
export type WikiPublicGroup = z.infer<typeof wikiPublicGroupSchema>
export type WikiCategory = z.infer<typeof wikiCategorySchema>
export type WikiStoryCatalogOption = z.infer<typeof wikiStoryCatalogOptionSchema>

// Contract-named aliases: the historical API-side interface names, now derived
// from the schemas above so the wire format has exactly one definition.
export type WikiContractEntryKind = WikiEntryKind
export type WikiContractStoryEntrySubtype = WikiStoryEntrySubtype
export type WikiContractImageTransform = WikiImageTransform
export type WikiContractAgencySummary = WikiAgencySummary
export type WikiPublicAgencyContract = WikiPublicAgency
export type WikiPublicIdolContract = WikiPublicIdol
export type WikiPublicSearchEntryContract = WikiPublicSearchEntry
export type WikiPublicGroupContract = WikiPublicGroup
export type WikiPublicCatalogContract = WikiPublicCatalog
export type WikiPublicStoryLinkContract = z.infer<typeof wikiPublicStoryLinkSchema>
export type WikiPublicStoryCardContract = z.infer<typeof wikiPublicStoryCardSchema>
export type WikiPublicStoriesContract = WikiPublicStories
export type WikiAdminIdolContract = WikiAdminIdol
export type WikiAdminGroupContract = WikiAdminGroup
export type WikiAdminAgencyContract = WikiAdminAgency
export type WikiAdminCatalogContract = WikiAdminCatalog
export type WikiCategoryContract = WikiCategory
export type WikiCatalogOptionContract = WikiStoryCatalogOption
export type WikiStoryContentTypeContract = WikiStoryContentType
export type WikiStorySourcePlatformContract = WikiStorySourcePlatform
export type WikiAdminStoryCardContract = WikiAdminStoryCard
export type WikiAdminStoryContract = WikiAdminStory
export type WikiAdminStoriesContract = WikiAdminStories

export const idolMediaSourceSchema = z.enum(["object-storage", "none"])

export const idolMediaCatalogSchema = exactJsonResponse({
  status: z.literal("success"),
  agencies: z.array(
    exactJsonResponse({
      code: z.string(),
      name: z.string(),
      idols: z.array(
        exactJsonResponse({
          name: z.string(),
          imageUrl: z.string(),
          imageFit: z.enum(["contain", "cover"]),
          source: idolMediaSourceSchema,
        })
      ),
    })
  ),
})

export type IdolMediaCatalog = z.infer<typeof idolMediaCatalogSchema>

export type IdolMediaAgency = IdolMediaCatalog["agencies"][number]

export type IdolMediaItem = IdolMediaAgency["idols"][number]

export const wikiIdolMediaUploadResultSchema = wikiMutationResultSchema.extend({
  url: z.string(),
}).strict()

export type WikiIdolMediaUploadResult = z.infer<
  typeof wikiIdolMediaUploadResultSchema
>
export type WikiErrorResponse = z.infer<typeof wikiErrorResponseSchema>
export type WikiHttpErrorResponse = z.infer<typeof wikiHttpErrorResponseSchema>
export type WikiRevisionConflictResponse = z.infer<typeof wikiRevisionConflictResponseSchema>
export type WikiMutationResult = z.infer<typeof wikiMutationResultSchema>
export type WikiTestResponse = z.infer<typeof wikiTestResponseSchema>
export type WikiEntityImageResult = z.infer<typeof wikiEntityImageResultSchema>
export type WikiAgencyMutationResult = z.infer<typeof wikiAgencyMutationResultSchema>
export type WikiGroupMutationResult = z.infer<typeof wikiGroupMutationResultSchema>
export type WikiIdolMutationResult = z.infer<typeof wikiIdolMutationResultSchema>
export type WikiIdolDeleteResult = z.infer<typeof wikiIdolDeleteResultSchema>
export type WikiCategoryMutationResult = z.infer<typeof wikiCategoryMutationResultSchema>
export type WikiStorySourceMutationResult = z.infer<typeof wikiStorySourceMutationResultSchema>
export type WikiStoryLinkDeleteResult = z.infer<typeof wikiStoryLinkDeleteResultSchema>
export type WikiStoryCardMutationResult = z.infer<typeof wikiStoryCardMutationResultSchema>
export type WikiLayoutResult = z.infer<typeof wikiLayoutResultSchema>
export type WikiStoryContentTypeMutation = z.infer<typeof wikiStoryContentTypeMutationSchema>
export type WikiStorySourcePlatformMutation = z.infer<typeof wikiStorySourcePlatformMutationSchema>
export type WikiStoryCoverAssetMutation = z.infer<typeof wikiStoryCoverAssetMutationSchema>

// Wiki historically accepts and projects unknown request keys. These schemas
// preserve that policy while giving every JSON, query, and params carrier one
// shared declaration. API adapters retain the established localized messages.
const wikiId = z.coerce.number().int().positive()
const wikiRevision = z.number().int().nonnegative()
const wikiText = z.string()
const wikiOptionalText = wikiText.optional()
const wikiImageFit = z.enum(["cover", "contain"])
const wikiSourceRequestSchema = legacyStripRequestObject({
  upName: wikiText,
  videoTitle: wikiText,
  url: wikiText,
  contentTypeId: z.union([wikiId, z.literal(""), z.null()]).optional(),
  sourcePlatformId: z.union([wikiId, z.literal(""), z.null()]).optional(),
})

export const createWikiAgencyRequestSchema = legacyStripRequestObject({
  code: wikiText.catch(""), name: wikiText.catch(""), color: wikiText.catch(""),
  bannerTitle: wikiOptionalText, wikiEnabled: z.boolean().optional(),
})
export const updateWikiAgencyRequestSchema = legacyStripRequestObject({
  name: wikiOptionalText, color: wikiOptionalText, bannerTitle: wikiOptionalText,
  wikiEnabled: z.boolean().optional(),
})
export const createWikiGroupRequestSchema = legacyStripRequestObject({
  code: wikiText, name: wikiText, color: wikiText,
})
export const updateWikiGroupRequestSchema = legacyStripRequestObject({
  code: wikiOptionalText, name: wikiOptionalText, color: wikiOptionalText,
})
export const wikiRevisionRequestSchema = legacyStripRequestObject({ expectedRevision: wikiRevision })
export const createWikiIdolRequestSchema = legacyStripRequestObject({
  name: wikiText, folderName: wikiText, color: wikiText.nullable().optional(),
  textColor: wikiOptionalText, wikiUrl: wikiText.nullable().optional(),
  imageFit: wikiImageFit.optional(), wikiEnabled: z.boolean().optional(),
  groupIds: z.array(z.union([wikiId, z.string()])),
  entryKind: wikiEntryKindSchema.optional(), entrySubtype: wikiStoryEntrySubtypeSchema.nullable().optional(),
})
export const updateWikiIdolRequestSchema = legacyStripRequestObject({
  name: wikiOptionalText, color: wikiText.nullable().optional(), textColor: wikiOptionalText,
  wikiUrl: wikiText.nullable().optional(), imageFit: wikiImageFit.optional(),
  wikiEnabled: z.boolean().optional(), groupIds: z.array(z.union([wikiId, z.string()])),
  entryKind: wikiEntryKindSchema.optional(), entrySubtype: wikiStoryEntrySubtypeSchema.nullable().optional(),
})
export const createWikiCategoryRequestSchema = legacyStripRequestObject({ name: wikiText })
export const updateWikiCategoryRequestSchema = legacyStripRequestObject({
  agencyId: z.union([wikiId, z.string()]), idolId: z.union([wikiId, z.string()]),
  name: wikiText, expectedName: wikiText,
})
export const deleteWikiAgencyIconRequestSchema = legacyStripRequestObject({ agency: wikiOptionalText })
export const deleteWikiIdolMediaRequestSchema = legacyStripRequestObject({ agency: wikiOptionalText, idol: wikiOptionalText })
export const wikiStorySourcesJsonSchema = z.array(wikiSourceRequestSchema).max(20)
export const wikiStorySourcesRequestSchema = legacyStripRequestObject({
  agency: wikiText, idol: wikiText, expectedRevision: wikiRevision,
  sources: wikiStorySourcesJsonSchema.min(1),
})
const wikiStoryCatalogBase = {
  name: wikiText, description: z.string().nullable().optional(), isActive: z.boolean().optional(),
}
export const createWikiContentTypeRequestSchema = legacyStripRequestObject({ ...wikiStoryCatalogBase, iconName: wikiText })
export const updateWikiContentTypeRequestSchema = legacyStripRequestObject({ ...wikiStoryCatalogBase, iconName: wikiText, expectedRevision: wikiRevision })
export const createWikiSourcePlatformRequestSchema = legacyStripRequestObject({ ...wikiStoryCatalogBase, homepageUrl: z.string().nullable().optional() })
export const updateWikiSourcePlatformRequestSchema = legacyStripRequestObject({ ...wikiStoryCatalogBase, homepageUrl: z.string().nullable().optional(), expectedRevision: wikiRevision })
export const wikiLayoutRequestSchema = legacyStripRequestObject({
  expectedRevision: z.union([wikiRevision, z.string()]),
  groups: z.array(legacyStripRequestObject({
    id: z.union([wikiId, z.string()]), idolIds: z.array(z.union([wikiId, z.string()])),
  })),
})
export const wikiBilibiliRequestSchema = legacyStripRequestObject({ url: wikiOptionalText })

export const wikiIdParamsSchema = legacyStripRequestObject({ id: z.union([wikiId, z.string()]) })
export const wikiAgencyIdParamsSchema = legacyStripRequestObject({ agencyId: z.union([wikiId, z.string()]) })
export const wikiGroupIdParamsSchema = legacyStripRequestObject({ groupId: z.union([wikiId, z.string()]) })
export const wikiIdolIdParamsSchema = legacyStripRequestObject({ idolId: z.union([wikiId, z.string()]) })
export const wikiCategoryIdParamsSchema = legacyStripRequestObject({ categoryId: z.union([wikiId, z.string()]) })
export const wikiCardIdParamsSchema = legacyStripRequestObject({ cardId: z.union([wikiId, z.string()]) })
export const wikiStoryIdParamsSchema = legacyStripRequestObject({ storyId: z.union([wikiId, z.string()]) })
export const wikiOptionIdParamsSchema = legacyStripRequestObject({ optionId: z.union([wikiId, z.string()]) })
export const wikiAssetIdParamsSchema = legacyStripRequestObject({ assetId: z.union([wikiId, z.string()]) })
export const wikiCategoryCreateParamsSchema = legacyStripRequestObject({ agencyId: z.union([wikiId, z.string()]), idolId: z.union([wikiId, z.string()]) })
export const wikiAssetParamsSchema = legacyStripRequestObject({ asset: wikiText })
export const wikiStoriesQuerySchema = legacyStripRequestObject({ agency: wikiOptionalText, idol: wikiOptionalText })
export const wikiCatalogQuerySchema = legacyStripRequestObject({ agency: wikiOptionalText })
export const wikiStoryLinkDeleteQuerySchema = legacyStripRequestObject({ agency: wikiOptionalText, idol: wikiOptionalText, expectedRevision: z.string().optional() })
export const wikiStoryLinkDeleteBodySchema = legacyStripRequestObject({
  agency: wikiOptionalText, idol: wikiOptionalText,
  expectedRevision: z.union([wikiRevision, z.string()]).optional(),
})

export type CreateWikiAgencyRequest = z.infer<typeof createWikiAgencyRequestSchema>
export type UpdateWikiAgencyRequest = z.infer<typeof updateWikiAgencyRequestSchema>
export type CreateWikiGroupRequest = z.infer<typeof createWikiGroupRequestSchema>
export type UpdateWikiGroupRequest = z.infer<typeof updateWikiGroupRequestSchema>
export type WikiRevisionRequest = z.infer<typeof wikiRevisionRequestSchema>
export type CreateWikiIdolRequest = z.infer<typeof createWikiIdolRequestSchema>
export type UpdateWikiIdolRequest = z.infer<typeof updateWikiIdolRequestSchema>
export type CreateWikiCategoryRequest = z.infer<typeof createWikiCategoryRequestSchema>
export type UpdateWikiCategoryRequest = z.infer<typeof updateWikiCategoryRequestSchema>
export type DeleteWikiAgencyIconRequest = z.infer<typeof deleteWikiAgencyIconRequestSchema>
export type DeleteWikiIdolMediaRequest = z.infer<typeof deleteWikiIdolMediaRequestSchema>
export type WikiStorySourcesRequest = z.infer<typeof wikiStorySourcesRequestSchema>
export type WikiStorySourcesJson = z.infer<typeof wikiStorySourcesJsonSchema>
export type WikiStoryCatalogMutationRequest = z.infer<typeof createWikiContentTypeRequestSchema>
export type WikiLayoutRequest = z.infer<typeof wikiLayoutRequestSchema>
export type WikiBilibiliRequest = z.infer<typeof wikiBilibiliRequestSchema>
export type WikiIdParams = { id: number }
export type WikiCategoryCreateParams = { agencyId: number; idolId: number }
export type WikiAssetParams = z.infer<typeof wikiAssetParamsSchema>
export type WikiStoriesQuery = { agency: string; idol: string }
export type WikiCatalogQuery = { agency: string }
export type WikiStoryLinkQuery = { agency: string; idol: string; expectedRevision?: string }
export type DeleteWikiStoryLinkRequest = { agency: string; idol: string; expectedRevision: number }
