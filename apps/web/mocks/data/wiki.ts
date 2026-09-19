import { iconPath, imagePath } from "@imsweb/contracts/paths"
import { defaultWikiImageTransform } from "@imsweb/contracts/wiki"
import type {
  WikiAdminAgency,
  WikiAdminCatalog,
  WikiAdminGroup,
  WikiAdminIdol,
  WikiAdminStories,
  WikiAdminStory,
  WikiAgencySummary,
  WikiCategory,
  WikiImageTransform,
  WikiPublicAgency,
  WikiPublicCatalog,
  WikiPublicGroup,
  WikiPublicIdol,
  WikiPublicStories,
  WikiPublicStoryCard,
  WikiRandomBackground,
  WikiRandomIdol,
  WikiStoryCoverAsset,
  WikiStoryContentType,
  WikiStorySourcePlatform,
} from "@imsweb/contracts/wiki"

/**
 * The public story link has a schema but no exported type, so it is read off
 * the containing card instead of re-deriving it with `z.infer` (which would
 * pull `z` into the test layer).
 */
type WikiPublicStoryLink = WikiPublicStoryCard["links"][number]

/**
 * Same situation as the story link: the stories response exposes this idol
 * only as a nested field.
 */
type WikiAdminStoriesIdol = WikiAdminStories["idol"]

/**
 * Wiki media URLs, composed the way the API composes them.
 *
 * `apps/api/src/domains/content/wiki/service.ts` builds every wiki image URL
 * from the `/icon` and `/image` prefixes in `@imsweb/contracts/paths`, using the
 * agency and idol display names as URL-encoded single segments. A fixture that
 * writes those paths by hand drifts the moment the route moves, so the rule is
 * mirrored here instead.
 */
function wikiGroupIconUrl(id: number): string {
  return iconPath(`/wiki-groups/${id}.webp`)
}

function wikiIdolImageUrl(agencyName: string, idolName: string): string {
  return imagePath(
    `/${encodeURIComponent(agencyName)}/${encodeURIComponent(idolName)}/icon.webp`
  )
}

function wikiStoryImageUrl(
  agencyName: string,
  idolName: string,
  imageFile: string
): string {
  const filePath = imageFile.split("/").map(encodeURIComponent).join("/")
  return imagePath(
    `/${encodeURIComponent(agencyName)}/${encodeURIComponent(idolName)}/${filePath}`
  )
}

/**
 * Agency summary is shared by the public stories and admin stories responses.
 * It stays private because it is a nested shape, not a factory callers reach
 * for directly.
 */
function makeWikiAgencySummary(
  overrides: Partial<WikiAgencySummary> = {}
): WikiAgencySummary {
  return {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f54798",
    ...overrides,
  }
}

export function makeWikiImageTransform(
  overrides: Partial<WikiImageTransform> = {}
): WikiImageTransform {
  return { ...defaultWikiImageTransform, ...overrides }
}

export function makeWikiPublicAgency(
  overrides: Partial<WikiPublicAgency> = {}
): WikiPublicAgency {
  return {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#f54798",
    bannerTitle: "765 PRO ALLSTARS",
    iconUrl: wikiGroupIconUrl(1),
    idolCount: 13,
    entryCount: 13,
    imageTransform: defaultWikiImageTransform,
    ...overrides,
  }
}

export function makeWikiPublicIdol(
  overrides: Partial<WikiPublicIdol> = {}
): WikiPublicIdol {
  return {
    id: 1,
    name: "天海春香",
    folderName: "haruka",
    color: "#f54798",
    wikiUrl: null,
    imageUrl: wikiIdolImageUrl("765PRO", "天海春香"),
    imageFit: "cover",
    textColor: "#ffffff",
    entryKind: "idol",
    entrySubtype: null,
    imageTransform: defaultWikiImageTransform,
    ...overrides,
  }
}

export function makeWikiPublicGroup(
  overrides: Partial<WikiPublicGroup> = {}
): WikiPublicGroup {
  return {
    id: 10,
    code: "allstars",
    name: "ALLSTARS",
    color: "#f54798",
    iconUrl: wikiGroupIconUrl(10),
    imageTransform: defaultWikiImageTransform,
    idols: [makeWikiPublicIdol()],
    ...overrides,
  }
}

export function makeWikiPublicStoryLink(
  overrides: Partial<WikiPublicStoryLink> = {}
): WikiPublicStoryLink {
  return {
    id: 1,
    up: "UP主",
    title: "视频",
    url: "https://www.bilibili.com/video/BV1",
    contentType: "正片",
    contentTypeIcon: "link-2",
    sourcePlatform: "bilibili",
    ...overrides,
  }
}

export function makeWikiPublicStoryCard(
  overrides: Partial<WikiPublicStoryCard> = {}
): WikiPublicStoryCard {
  return {
    id: 100,
    name: "【初星】",
    img: wikiStoryImageUrl("765PRO", "天海春香", "100.webp"),
    subtitle: "序章",
    imageTransform: defaultWikiImageTransform,
    links: [makeWikiPublicStoryLink()],
    ...overrides,
  }
}

export function makeWikiPublicCatalog(
  overrides: Partial<WikiPublicCatalog> = {}
): WikiPublicCatalog {
  return {
    status: "success",
    agencies: [
      makeWikiPublicAgency(),
      makeWikiPublicAgency({ id: 2, code: "cg", iconUrl: null }),
    ],
    searchEntries: [],
    selection: {
      agency: makeWikiPublicAgency(),
      layoutRevision: 3,
      groups: [makeWikiPublicGroup()],
      ungroupedIdols: [
        makeWikiPublicIdol({
          id: 2,
          name: "如月千早",
          folderName: "chihaya",
          imageUrl: wikiIdolImageUrl("765PRO", "如月千早"),
        }),
      ],
    },
    ...overrides,
  }
}

export function makeWikiPublicStories(
  overrides: Partial<WikiPublicStories> = {}
): WikiPublicStories {
  return {
    status: "success",
    agency: makeWikiAgencySummary(),
    idol: makeWikiPublicIdol(),
    categories: [{ name: "主线", cards: [makeWikiPublicStoryCard()] }],
    ...overrides,
  }
}

export function makeWikiRandomBackground(
  overrides: Partial<WikiRandomBackground> = {}
): WikiRandomBackground {
  return {
    url: wikiStoryImageUrl("765PRO", "天海春香", "1.webp"),
    card_id: 100,
    card_name: "【初星】",
    idol_name: "天海春香",
    agency_name: "765PRO",
    ...overrides,
  }
}

export function makeWikiRandomIdol(
  overrides: Partial<WikiRandomIdol> = {}
): WikiRandomIdol {
  return {
    status: "success",
    eligibleCount: 42,
    idol: {
      id: 1,
      name: "天海春香",
      color: "#f54798",
      textColor: "#ffffff",
      imageUrl: wikiIdolImageUrl("765PRO", "天海春香"),
      imageTransform: defaultWikiImageTransform,
      agency: {
        id: 1,
        code: "765",
        name: "765PRO",
        color: "#f54798",
        iconUrl: wikiGroupIconUrl(1),
        imageTransform: defaultWikiImageTransform,
      },
    },
    ...overrides,
  }
}

export function makeWikiCategory(
  overrides: Partial<WikiCategory> = {}
): WikiCategory {
  return {
    id: 1,
    name: "主线",
    storageSlug: "main",
    displayOrder: 0,
    showWhenEmpty: true,
    backgroundEligible: false,
    revision: 0,
    ...overrides,
  }
}

export function makeWikiAdminIdol(
  overrides: Partial<WikiAdminIdol> = {}
): WikiAdminIdol {
  return {
    id: 10,
    agencyId: 1,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#e22b30",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    wikiEnabled: true,
    groupIds: [1],
    entryKind: "idol",
    entrySubtype: null,
    ...overrides,
  }
}

export function makeWikiAdminGroup(
  overrides: Partial<WikiAdminGroup> = {}
): WikiAdminGroup {
  return {
    id: 1,
    code: "765pro",
    name: "765PRO",
    color: "#f34f6d",
    iconUrl: null,
    displayOrder: 0,
    isFallback: true,
    idolIds: [10],
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    idols: [makeWikiAdminIdol()],
    ...overrides,
  }
}

export function makeWikiAdminAgency(
  overrides: Partial<WikiAdminAgency> = {}
): WikiAdminAgency {
  return {
    id: 1,
    code: "765pro",
    name: "765PRO",
    color: "#f34f6d",
    wikiEnabled: true,
    bannerTitle: "765PRO ALLSTARS",
    displayOrder: 0,
    layoutRevision: 0,
    iconUrl: null,
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    idols: [],
    groups: [makeWikiAdminGroup()],
    ...overrides,
  }
}

export function makeWikiAdminStory(
  overrides: Partial<WikiAdminStory> = {}
): WikiAdminStory {
  return {
    id: 21,
    cardId: 401,
    category: "主线",
    cardName: "【第一话】",
    subtitle: "开场",
    imageFile: null,
    coverAssetId: null,
    coverAssetName: null,
    imageUrl: "",
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    revision: 0,
    upName: "投稿者",
    videoTitle: "第一话",
    url: "https://www.bilibili.com/video/BV1xx411c7mD",
    contentTypeId: 1,
    contentTypeName: "剧情",
    sourcePlatformId: 2,
    sourcePlatformName: "其他来源",
    ...overrides,
  }
}

export function makeWikiStoryCoverAsset(
  overrides: Partial<WikiStoryCoverAsset> = {}
): WikiStoryCoverAsset {
  return {
    id: 12,
    agencyId: 6,
    name: "共用主线封面",
    imageUrl: "/api/wiki/story-cover-assets/12.webp?v=0",
    presentationPolicy: "contain",
    displayOrder: 0,
    isActive: true,
    revision: 0,
    usageCount: 0,
    ...overrides,
  }
}

export function makeWikiStoryContentType(
  overrides: Partial<WikiStoryContentType> = {}
): WikiStoryContentType {
  return {
    id: 1,
    name: "剧情",
    description: "剧情内容",
    displayOrder: 0,
    isActive: true,
    revision: 0,
    iconName: "link-2",
    ...overrides,
  }
}

export function makeWikiStorySourcePlatform(
  overrides: Partial<WikiStorySourcePlatform> = {}
): WikiStorySourcePlatform {
  return {
    id: 2,
    name: "其他来源",
    description: "其他来源",
    displayOrder: 0,
    isActive: true,
    revision: 0,
    homepageUrl: "",
    ...overrides,
  }
}

export function makeWikiAdminCatalog(
  overrides: Partial<WikiAdminCatalog> = {}
): WikiAdminCatalog {
  return {
    status: "success",
    agencies: [makeWikiAdminAgency()],
    ...overrides,
  }
}

export function makeWikiAdminStories(
  overrides: Partial<WikiAdminStories> = {}
): WikiAdminStories {
  const idol: WikiAdminStoriesIdol = {
    id: 10,
    agencyId: 1,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#e22b30",
    wikiUrl: null,
    textColor: "#ffffff",
    displayOrder: 0,
    imageUrl: "",
    imageFit: "cover",
    imageTransform: defaultWikiImageTransform,
    mediaRevision: 0,
    entryKind: "idol",
    entrySubtype: null,
  }

  return {
    status: "success",
    agency: makeWikiAgencySummary(),
    idol,
    categories: [makeWikiCategory()],
    contentTypes: [makeWikiStoryContentType()],
    sourcePlatforms: [makeWikiStorySourcePlatform()],
    cards: [],
    stories: [makeWikiAdminStory()],
    ...overrides,
  }
}
