import { z } from "zod"
import {
  businessErrorResponseSchema,
  errorResponseSchema,
  exactJsonResponse,
  legacyStripRequestObject,
  strictRequestObject,
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
  namecardEnabled: z.boolean().nullable().optional(),
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
    namecardEnabled: z.boolean().nullable().optional(),
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

/**
 * Enhanced Markdown document AST shared by API, Web, and App.
 *
 * The API compiles Markdown into this typed tree; clients render it directly
 * and never parse Markdown or inject HTML. `version` gates future AST changes.
 */
export const wikiContentModeSchema = z.enum(["structured", "document"])

/**
 * Renderable URLs in a compiled document: absolute `http(s)` links or a
 * site-relative path starting with `/`. Protocol-relative (`//`), `data:`,
 * `javascript:`, and bare-relative URLs never reach the wire, so clients render
 * the AST without re-implementing this policy.
 */
export const wikiDocumentUrlSchema = z
  .string()
  .regex(/^(?:https?:\/\/|\/(?!\/))/i, { message: "unsafe document URL" })

/**
 * A document image reference: an agency shared cover asset (`cover:<id>`) or an
 * image uploaded to the entry itself (`doc:<id>`).
 *
 * The reference is what the AST stores. Public reads re-resolve it into an
 * `imageUrl`, so replacing a shared cover asset updates every document that
 * embeds it without rewriting compiled documents.
 */
export const wikiDocumentAssetKindSchema = z.enum(["cover", "doc"])

export type WikiDocumentAssetKind = z.infer<typeof wikiDocumentAssetKindSchema>

export interface WikiDocumentAssetRef {
  kind: WikiDocumentAssetKind
  id: number
}

export const wikiDocumentAssetRefSchema: z.ZodType<WikiDocumentAssetRef> =
  exactJsonResponse({
    kind: wikiDocumentAssetKindSchema,
    id: z.number().int().positive(),
  })

/**
 * How a shared cover asset wants its artwork fitted. `inherit` defers to the
 * block author's `fit`, while `contain` never crops the image.
 */
export const wikiDocumentPresentationPolicySchema = z.enum([
  "inherit",
  "contain",
])

export type WikiDocumentPresentationPolicy = z.infer<
  typeof wikiDocumentPresentationPolicySchema
>

export type WikiDocumentInline =
  | { type: "text"; value: string }
  | { type: "strong"; children: WikiDocumentInline[] }
  | { type: "emphasis"; children: WikiDocumentInline[] }
  | { type: "delete"; children: WikiDocumentInline[] }
  | { type: "inlineCode"; value: string }
  | { type: "link"; url: string; children: WikiDocumentInline[] }
  | { type: "break" }

export interface WikiDocumentListItem {
  children: WikiDocumentBlock[]
}

/**
 * One parsed `- [类型｜平台｜UP](url) 标题` source list entry.
 *
 * The compiler resolves `contentType` / `sourcePlatform` (explicit segments or
 * host inference) and keeps the trailing title outside the attribute syntax, so
 * quotes, brackets, and angle brackets in titles never need escaping.
 */
export interface WikiDocumentSourceLink {
  up: string
  title: string
  url: string
  contentType: string
  sourcePlatform: string
}

export interface WikiDocumentCard {
  type: "card"
  /** Optional database card id; renders the `#story-card-<id>` deep-link anchor. */
  id: number | null
  title: string
  subtitle: string
  fit: "cover" | "contain"
  /** Image reference (`asset="cover:<id>"` / `"doc:<id>"`); `null` when text-only. */
  asset: WikiDocumentAssetRef | null
  /** Server-resolved public read URL; `null` while the reference is unresolved. */
  imageUrl: string | null
  presentationPolicy: WikiDocumentPresentationPolicy
  tags: string[]
  links: WikiDocumentSourceLink[]
}

/**
 * One `::media{asset="cover:<id>"|"doc:<id>" caption="..." fit="..."}` figure.
 *
 * `imageUrl` and `presentationPolicy` are resolved on every read, so a replaced
 * shared cover asset shows its new artwork immediately.
 */
export interface WikiDocumentMediaBlock {
  type: "media"
  asset: WikiDocumentAssetRef
  caption: string
  fit: "cover" | "contain"
  imageUrl: string | null
  presentationPolicy: WikiDocumentPresentationPolicy
}

/**
 * `::story-category{name="..." collapsed}` / `::story-categories`.
 *
 * `categoryName` is `null` for `::story-categories`, which embeds every
 * category of the entry; the public payload carries the resolved card pools
 * alongside the document so one round-trip renders the hybrid page.
 */
export interface WikiDocumentStoryCategoryBlock {
  type: "storyCategory"
  categoryName: string | null
  collapsed: boolean
}

export interface WikiDocumentLinksBlock {
  type: "links"
  title: string
  collapsed: boolean
  links: WikiDocumentSourceLink[]
}

export type WikiDocumentCardLayout = "grid" | "portrait" | "banner" | "list"

export type WikiDocumentCardRatio =
  | "16/9"
  | "4/5"
  | "9/16"
  | "1/1"
  | "2.8/1"

export interface WikiDocumentCardGridBlock {
  type: "cardGrid"
  layout: WikiDocumentCardLayout
  /** Explicit column count (`2`–`6`); `null` keeps the responsive default. */
  cols: number | null
  /** Card media ratio; `null` keeps the layout default. */
  ratio: WikiDocumentCardRatio | null
  /** `"tags"` opts the grid into the page tag facet filter. */
  filter: "tags" | null
  collapsed: boolean
  title: string
  cards: WikiDocumentCard[]
}

export interface WikiDocumentTab {
  type: "tab"
  title: string
  children: WikiDocumentBlock[]
}

export interface WikiDocumentTabsBlock {
  type: "tabs"
  items: WikiDocumentTab[]
}

export type WikiDocumentBlock =
  | {
      type: "heading"
      level: 2 | 3
      id: string
      children: WikiDocumentInline[]
    }
  | { type: "paragraph"; children: WikiDocumentInline[] }
  | { type: "blockquote"; children: WikiDocumentBlock[] }
  | {
      type: "list"
      ordered: boolean
      start: number | null
      items: WikiDocumentListItem[]
    }
  | {
      type: "table"
      align: Array<"left" | "center" | "right" | null>
      header: WikiDocumentInline[][]
      rows: WikiDocumentInline[][][]
    }
  | { type: "thematicBreak" }
  | {
      type: "callout"
      tone: "tip" | "info" | "warning" | "spoiler"
      title: string
      children: WikiDocumentBlock[]
    }
  | {
      type: "details"
      title: string
      open: boolean
      children: WikiDocumentBlock[]
    }
  | WikiDocumentLinksBlock
  | WikiDocumentCardGridBlock
  | WikiDocumentTabsBlock
  | WikiDocumentMediaBlock
  | WikiDocumentStoryCategoryBlock

export interface WikiDocumentHeading {
  id: string
  level: 2 | 3
  text: string
}

export interface WikiDocumentWarning {
  line: number
  code: string
  message: string
}

export interface WikiPublicStoryDocument {
  version: 1
  headings: WikiDocumentHeading[]
  availableTags: string[]
  blocks: WikiDocumentBlock[]
}

export const wikiDocumentInlineSchema: z.ZodType<WikiDocumentInline> = z.lazy(
  () =>
    z.discriminatedUnion("type", [
      exactJsonResponse({ type: z.literal("text"), value: z.string() }),
      exactJsonResponse({
        type: z.literal("strong"),
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({
        type: z.literal("emphasis"),
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({
        type: z.literal("delete"),
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({ type: z.literal("inlineCode"), value: z.string() }),
      exactJsonResponse({
        type: z.literal("link"),
        url: wikiDocumentUrlSchema,
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({ type: z.literal("break") }),
    ])
)

export const wikiDocumentBlockSchema: z.ZodType<WikiDocumentBlock> = z.lazy(
  () =>
    z.discriminatedUnion("type", [
      exactJsonResponse({
        type: z.literal("heading"),
        level: z.union([z.literal(2), z.literal(3)]),
        id: z.string(),
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({
        type: z.literal("paragraph"),
        children: z.array(wikiDocumentInlineSchema),
      }),
      exactJsonResponse({
        type: z.literal("blockquote"),
        children: z.array(wikiDocumentBlockSchema),
      }),
      exactJsonResponse({
        type: z.literal("list"),
        ordered: z.boolean(),
        start: z.number().int().nullable(),
        items: z.array(
          exactJsonResponse({
            children: z.array(wikiDocumentBlockSchema),
          })
        ),
      }),
      exactJsonResponse({
        type: z.literal("table"),
        align: z.array(z.enum(["left", "center", "right"]).nullable()),
        header: z.array(z.array(wikiDocumentInlineSchema)),
        rows: z.array(z.array(z.array(wikiDocumentInlineSchema))),
      }),
      exactJsonResponse({ type: z.literal("thematicBreak") }),
      exactJsonResponse({
        type: z.literal("callout"),
        tone: z.enum(["tip", "info", "warning", "spoiler"]),
        title: z.string(),
        children: z.array(wikiDocumentBlockSchema),
      }),
      exactJsonResponse({
        type: z.literal("details"),
        title: z.string(),
        open: z.boolean(),
        children: z.array(wikiDocumentBlockSchema),
      }),
      wikiDocumentLinksBlockSchema,
      wikiDocumentCardGridSchema,
      exactJsonResponse({
        type: z.literal("tabs"),
        items: z.array(wikiDocumentTabSchema),
      }),
      wikiDocumentMediaBlockSchema,
      wikiDocumentStoryCategoryBlockSchema,
    ])
)

export const wikiDocumentSourceLinkSchema: z.ZodType<WikiDocumentSourceLink> =
  exactJsonResponse({
    up: z.string(),
    title: z.string(),
    url: wikiDocumentUrlSchema,
    contentType: z.string(),
    sourcePlatform: z.string(),
  })

export const wikiDocumentCardSchema: z.ZodType<WikiDocumentCard> =
  exactJsonResponse({
    type: z.literal("card"),
    id: z.number().int().positive().nullable(),
    title: z.string(),
    subtitle: z.string(),
    fit: z.enum(["cover", "contain"]),
    asset: wikiDocumentAssetRefSchema.nullable(),
    imageUrl: z.string().nullable(),
    presentationPolicy: wikiDocumentPresentationPolicySchema,
    tags: z.array(z.string()),
    links: z.array(wikiDocumentSourceLinkSchema),
  })

export const wikiDocumentMediaBlockSchema = exactJsonResponse({
  type: z.literal("media"),
  asset: wikiDocumentAssetRefSchema,
  caption: z.string(),
  fit: z.enum(["cover", "contain"]),
  imageUrl: z.string().nullable(),
  presentationPolicy: wikiDocumentPresentationPolicySchema,
}) satisfies z.ZodType<WikiDocumentMediaBlock>

export const wikiDocumentStoryCategoryBlockSchema = exactJsonResponse({
  type: z.literal("storyCategory"),
  categoryName: z.string().nullable(),
  collapsed: z.boolean(),
}) satisfies z.ZodType<WikiDocumentStoryCategoryBlock>

export const wikiDocumentCardGridSchema = exactJsonResponse({
  type: z.literal("cardGrid"),
  layout: z.enum(["grid", "portrait", "banner", "list"]),
  cols: z.number().int().min(2).max(6).nullable(),
  ratio: z.enum(["16/9", "4/5", "9/16", "1/1", "2.8/1"]).nullable(),
  filter: z.literal("tags").nullable(),
  collapsed: z.boolean(),
  title: z.string(),
  cards: z.array(wikiDocumentCardSchema),
}) satisfies z.ZodType<WikiDocumentCardGridBlock>

export const wikiDocumentLinksBlockSchema = exactJsonResponse({
  type: z.literal("links"),
  title: z.string(),
  collapsed: z.boolean(),
  links: z.array(wikiDocumentSourceLinkSchema),
}) satisfies z.ZodType<WikiDocumentLinksBlock>

export const wikiDocumentTabSchema: z.ZodType<WikiDocumentTab> = z.lazy(() =>
  exactJsonResponse({
    type: z.literal("tab"),
    title: z.string(),
    children: z.array(wikiDocumentBlockSchema),
  })
)

export const wikiDocumentHeadingSchema: z.ZodType<WikiDocumentHeading> =
  exactJsonResponse({
    id: z.string(),
    level: z.union([z.literal(2), z.literal(3)]),
    text: z.string(),
  })

export const wikiDocumentWarningSchema: z.ZodType<WikiDocumentWarning> =
  exactJsonResponse({
    line: z.number().int().nonnegative(),
    code: z.string(),
    message: z.string(),
  })

export const wikiPublicStoryDocumentSchema: z.ZodType<WikiPublicStoryDocument> =
  exactJsonResponse({
    version: z.literal(1),
    headings: z.array(wikiDocumentHeadingSchema),
    availableTags: z.array(z.string()),
    blocks: z.array(wikiDocumentBlockSchema),
  })

export const wikiPublicStoriesSchema = exactJsonResponse({
  status: z.literal("success"),
  agency: wikiAgencySummarySchema,
  idol: wikiPublicIdolSchema,
  contentMode: wikiContentModeSchema,
  document: wikiPublicStoryDocumentSchema.nullable(),
  categories: z.array(
    exactJsonResponse({
      name: z.string(),
      cards: z.array(wikiPublicStoryCardSchema),
    })
  ),
})

/**
 * Admin document endpoints (Ticket 01 read/save/preview + Ticket 07 history).
 *
 * `revision` is the optimistic lock for `PUT`; a stale `expectedRevision`
 * returns `409` with the current value in `wikiRevisionConflictResponseSchema`.
 * `media` lists the entry's uploaded document images so the workbench can pick
 * them without a second request, and `revisionsSummary` counts the retained
 * snapshots so the history drawer can open without a second read.
 */
export const wikiDocumentMediaItemSchema = exactJsonResponse({
  id: z.number().int().positive(),
  imageUrl: z.string(),
  altText: z.string(),
})

export const adminWikiEntryDocumentMediaUploadSchema = exactJsonResponse({
  status: z.literal("success"),
  media: wikiDocumentMediaItemSchema,
})

export const adminWikiEntryDocumentEntrySchema = exactJsonResponse({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  projectCode: z.string(),
  projectName: z.string(),
  name: z.string(),
  folderName: z.string(),
  entryKind: wikiEntryKindSchema,
})

/**
 * One retained snapshot of an entry's document.
 *
 * The API keeps at most the newest 30 snapshots per entry, so `revision` is
 * contiguous only inside the retention window: a restored older text saves
 * forward as a new revision instead of rewriting `revision` numbers.
 */
export const wikiDocumentRevisionSummarySchema = exactJsonResponse({
  revision: z.number().int().positive(),
  summary: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.string().min(1),
})

/** Newest-first snapshot list of one entry, capped at the retention window. */
export const adminWikiEntryDocumentRevisionsSchema = exactJsonResponse({
  status: z.literal("success"),
  revisions: z.array(wikiDocumentRevisionSummarySchema),
})

/** One snapshot including the Markdown the maintainer can restore. */
export const adminWikiEntryDocumentRevisionSchema = exactJsonResponse({
  status: z.literal("success"),
  revision: z.number().int().positive(),
  summary: z.string(),
  createdBy: z.string().nullable(),
  createdAt: z.string().min(1),
  sourceMarkdown: z.string(),
})

/**
 * Retained-snapshot counters carried by the document read.
 *
 * Counts only what is still restorable, so a pristine entry and one whose
 * history was pruned both report the truth. The workbench consumes both fields
 * before opening the drawer: `count` labels and enables the 版本历史 entry
 * (`0` disables it) and `latestRevision` names the newest restorable snapshot,
 * so no reader of the document pays for the thirty snapshots just to render the
 * button. Snapshot timestamps stay on their own rows in the history list.
 */
export const wikiDocumentRevisionsSummarySchema = exactJsonResponse({
  count: z.number().int().nonnegative(),
  latestRevision: z.number().int().positive().nullable(),
})

export const adminWikiEntryDocumentSchema = exactJsonResponse({
  status: z.literal("success"),
  entry: adminWikiEntryDocumentEntrySchema,
  contentMode: wikiContentModeSchema,
  sourceMarkdown: z.string(),
  revision: z.number().int().nonnegative(),
  document: wikiPublicStoryDocumentSchema,
  warnings: z.array(wikiDocumentWarningSchema),
  media: z.array(wikiDocumentMediaItemSchema),
  revisionsSummary: wikiDocumentRevisionsSummarySchema,
})

export const adminWikiEntryDocumentSaveSchema = exactJsonResponse({
  status: z.literal("success"),
  contentMode: wikiContentModeSchema,
  revision: z.number().int().nonnegative(),
  document: wikiPublicStoryDocumentSchema,
  warnings: z.array(wikiDocumentWarningSchema),
})

export const adminWikiEntryDocumentPreviewSchema = exactJsonResponse({
  status: z.literal("success"),
  document: wikiPublicStoryDocumentSchema,
  warnings: z.array(wikiDocumentWarningSchema),
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
  namecardEnabled: z.boolean().nullable().optional(),
})
export const updateWikiAgencyRequestSchema = legacyStripRequestObject({
  name: wikiOptionalText, color: wikiOptionalText, bannerTitle: wikiOptionalText,
  wikiEnabled: z.boolean().optional(),
  namecardEnabled: z.boolean().nullable().optional(),
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

// Enhanced Markdown document boundaries are new, so they reject unknown keys.
export const adminWikiEntryIdParamsSchema = strictRequestObject({
  entryId: z.coerce.number().int().positive(),
})
export const adminWikiSaveEntryDocumentRequestSchema = strictRequestObject({
  contentMode: wikiContentModeSchema,
  sourceMarkdown: z.string(),
  expectedRevision: wikiRevision,
  summary: z.string().optional(),
})
export const adminWikiPreviewEntryDocumentRequestSchema = strictRequestObject({
  sourceMarkdown: z.string(),
})

/**
 * Path parameters of one document snapshot.
 *
 * `revision` rejects negatives at the HTTP boundary, so a malformed history URL
 * never reaches the repository as a "missing row" query; both segments arrive as
 * strings from Hono and are coerced into positive integers here.
 */
export const adminWikiEntryDocumentRevisionParamsSchema = strictRequestObject({
  entryId: z.coerce.number().int().positive(),
  revision: z.coerce.number().int().nonnegative(),
})

/**
 * Structured-to-Markdown export request.
 *
 * Both fields are optional because the exporter's own defaults are the
 * audit-calibrated ones: `stripBrackets` keeps `【…】` card titles and
 * `collapseThreshold` folds a heavy category after 24 cards. An empty object
 * therefore asks for the reviewed conversion.
 */
export const adminWikiExportStructuredEntryDocumentRequestSchema =
  strictRequestObject({
    stripBrackets: z.boolean().optional(),
    collapseThreshold: z.number().int().min(1).max(500).optional(),
  })

/**
 * Data-hygiene findings reported by the exporter.
 *
 * Every code names a defect the export worked around instead of dropping
 * silently: a placeholder subtitle, a repeated URL on one card, a search-page
 * URL that is not content, a pseudo UP name, two category names that only differ
 * in separator, card artwork that only exists as a legacy image file and
 * therefore cannot be referenced by the document dialect, or a category
 * assigned to the entry that holds no cards at all.
 */
export const adminWikiExportLintCodeSchema = z.enum([
  "placeholder-subtitle",
  "duplicate-url",
  "non-content-url",
  "pseudo-up-name",
  "near-duplicate-category",
  "unmapped-card-image",
  "empty-category",
])

export const adminWikiExportLintWarningSchema = exactJsonResponse({
  code: adminWikiExportLintCodeSchema,
  /** Category or card the finding belongs to, so the dialog can group rows. */
  context: z.string(),
  message: z.string(),
})

/** What the export covered, so the dialog can summarise the draft. */
export const adminWikiExportStructuredStatsSchema = exactJsonResponse({
  categories: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
  links: z.number().int().nonnegative(),
  collapsedCategories: z.number().int().nonnegative(),
})

export const adminWikiEntryDocumentExportStructuredSchema = exactJsonResponse({
  status: z.literal("success"),
  markdown: z.string(),
  stats: adminWikiExportStructuredStatsSchema,
  lintWarnings: z.array(adminWikiExportLintWarningSchema),
})

/**
 * One requested Bilibili URL and its resolved metadata.
 *
 * A failed link keeps the batch a success: `ok` is false and `error` carries
 * the reason, while the resolved fields stay absent.
 */
export const adminWikiBilibiliBatchItemSchema = exactJsonResponse({
  inputUrl: z.string(),
  ok: z.boolean(),
  title: z.string().optional(),
  up: z.string().optional(),
  stdUrl: z.string().optional(),
  coverUrl: z.string().optional(),
  error: z.string().optional(),
})
export const adminWikiParseBilibiliBatchRequestSchema = strictRequestObject({
  urls: z.array(z.string()).min(1).max(20),
})
export const adminWikiParseBilibiliBatchResultSchema = exactJsonResponse({
  status: z.literal("success"),
  items: z.array(adminWikiBilibiliBatchItemSchema),
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
export type WikiContentMode = z.infer<typeof wikiContentModeSchema>
export type WikiAdminEntryDocument = z.infer<typeof adminWikiEntryDocumentSchema>
export type WikiAdminEntryDocumentSave = z.infer<
  typeof adminWikiEntryDocumentSaveSchema
>
export type WikiAdminEntryDocumentPreview = z.infer<
  typeof adminWikiEntryDocumentPreviewSchema
>
export type WikiDocumentMediaItem = z.infer<typeof wikiDocumentMediaItemSchema>
export type WikiDocumentRevisionSummary = z.infer<
  typeof wikiDocumentRevisionSummarySchema
>
export type WikiDocumentRevisionsSummary = z.infer<
  typeof wikiDocumentRevisionsSummarySchema
>
export type WikiAdminEntryDocumentRevision = z.infer<
  typeof adminWikiEntryDocumentRevisionSchema
>
export type WikiAdminEntryDocumentRevisions = z.infer<
  typeof adminWikiEntryDocumentRevisionsSchema
>
export type WikiAdminEntryDocumentRevisionParams = z.infer<
  typeof adminWikiEntryDocumentRevisionParamsSchema
>
export type WikiAdminEntryDocumentMediaUpload = z.infer<
  typeof adminWikiEntryDocumentMediaUploadSchema
>
export type WikiAdminSaveEntryDocumentRequest = z.infer<
  typeof adminWikiSaveEntryDocumentRequestSchema
>
export type WikiAdminPreviewEntryDocumentRequest = z.infer<
  typeof adminWikiPreviewEntryDocumentRequestSchema
>
export type WikiAdminExportStructuredEntryDocumentRequest = z.infer<
  typeof adminWikiExportStructuredEntryDocumentRequestSchema
>
export type WikiAdminExportLintCode = z.infer<
  typeof adminWikiExportLintCodeSchema
>
export type WikiAdminExportLintWarning = z.infer<
  typeof adminWikiExportLintWarningSchema
>
export type WikiAdminExportStructuredStats = z.infer<
  typeof adminWikiExportStructuredStatsSchema
>
export type WikiAdminEntryDocumentExportStructured = z.infer<
  typeof adminWikiEntryDocumentExportStructuredSchema
>
export type WikiAdminBilibiliBatchItem = z.infer<
  typeof adminWikiBilibiliBatchItemSchema
>
export type WikiAdminParseBilibiliBatchRequest = z.infer<
  typeof adminWikiParseBilibiliBatchRequestSchema
>
export type WikiAdminParseBilibiliBatchResult = z.infer<
  typeof adminWikiParseBilibiliBatchResultSchema
>
