import { afterEach, describe, expect, it, vi } from "vitest"

import { defaultWikiImageTransform } from "@imsweb/contracts/wiki"
import type {
  AboutPageContent,
  ChronicleActivity,
  ChronicleActivitySummary,
  FudabaCard,
  FudabaCardPage,
  FudabaOffice,
  FudabaOfficeDetail,
  FudabaOfficePage,
  FudabaAdminCardClaim,
  FudabaOwnerCardList,
  FudabaOwnerOfficeList,
  FudabaRegisteredCardReview,
  FudabaSeriesList,
  NamecardPage,
  NamecardSubmission,
  PlatformProfileResponse,
  PlatformSession,
  ProducerMapContent,
  WikiPublicCatalog,
  WikiPublicStories,
  WikiRandomIdol,
} from "~/lib/api"

const PACKAGED_ORIGIN = "https://idol-master.top"

async function loadMediaUrls(configuredOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
  return import("~/lib/api/media-urls")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const idol = {
  id: 1,
  name: "天海春香",
  folderName: "haruka",
  color: "#f54798",
  wikiUrl: null,
  imageUrl: "/wiki-idols/haruka.webp",
  imageFit: "cover",
  textColor: "#ffffff",
  entryKind: "idol",
  entrySubtype: null,
  imageTransform: defaultWikiImageTransform,
} as const

const agency = {
  id: 1,
  code: "765",
  name: "765PRO",
  color: "#f54798",
  bannerTitle: "765 PRO ALLSTARS",
  iconUrl: "/wiki-groups/1.webp",
  idolCount: 13,
  entryCount: 13,
  imageTransform: defaultWikiImageTransform,
} as const

const wikiCatalog: WikiPublicCatalog = {
  status: "success",
  agencies: [agency, { ...agency, id: 2, code: "cg", iconUrl: null }],
  searchEntries: [],
  selection: {
    agency,
    layoutRevision: 3,
    groups: [
      {
        id: 10,
        code: "allstars",
        name: "ALLSTARS",
        color: "#f54798",
        iconUrl: "/wiki-groups/10.webp",
        imageTransform: defaultWikiImageTransform,
        idols: [idol],
      },
    ],
    ungroupedIdols: [{ ...idol, id: 2, imageUrl: "/wiki-idols/chihaya.webp" }],
  },
}

const wikiStories: WikiPublicStories = {
  status: "success",
  agency: { id: 1, code: "765", name: "765PRO", color: "#f54798" },
  idol,
  categories: [
    {
      name: "主线",
      cards: [
        {
          id: 100,
          name: "【初星】",
          img: "/wiki-stories/100.webp",
          subtitle: "序章",
          imageTransform: defaultWikiImageTransform,
          links: [
            {
              id: 1,
              up: "UP主",
              title: "视频",
              url: "https://www.bilibili.com/video/BV1",
              contentType: "正片",
              contentTypeIcon: "link-2",
              sourcePlatform: "bilibili",
            },
          ],
        },
      ],
    },
  ],
}

const randomIdol: WikiRandomIdol = {
  status: "success",
  eligibleCount: 42,
  idol: {
    id: 1,
    name: "天海春香",
    color: "#f54798",
    textColor: "#ffffff",
    imageUrl: "/wiki-idols/haruka.webp",
    imageTransform: defaultWikiImageTransform,
    agency: {
      id: 1,
      code: "765",
      name: "765PRO",
      color: "#f54798",
      iconUrl: "/wiki-groups/1.webp",
      imageTransform: defaultWikiImageTransform,
    },
  },
}

const publicCard: FudabaCard = {
  id: "card-1",
  producerName: "P",
  displayName: "名片",
  seriesCode: "765",
  favoriteIdol: "春香",
  favoriteIdols: [],
  // The public directory hands back absolute object-storage URLs already.
  frontImageUrl: "https://objects.example.com/cards/1-front.webp",
  backImageUrl: "https://objects.example.com/cards/1-back.webp",
  accent: "#f54798",
  bio: "",
  tradeNote: "",
  available: true,
  source: null,
  createdAt: "2026-01-01T00:00:00+08:00",
  interactions: {
    likes: 0,
    favorites: 0,
    viewerLiked: false,
    viewerFavorited: false,
  },
}

const publicOffice: FudabaOffice = {
  id: "office-1",
  slug: "gz-01",
  name: "广州事务所",
  intro: "",
  city: "广州",
  address: "天河区",
  accent: "#f54798",
  coverUrl: "https://objects.example.com/offices/1.webp",
  isOpen: true,
  visitorCount: 3,
  seriesCodes: ["765"],
}

const officePage: FudabaOfficePage = {
  items: [publicOffice, { ...publicOffice, id: "office-2", coverUrl: null }],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

const cardPage: FudabaCardPage = {
  items: [publicCard],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

const officeDetail: FudabaOfficeDetail = {
  ...publicOffice,
  cards: [
    {
      ...publicCard,
      viewerOwned: false,
      placement: {
        pinnedAt: "2026-01-01T00:00:00+08:00",
        x: 10,
        y: 20,
        rotation: 0,
        zIndex: 1,
        revision: 1,
        updatedAt: "2026-01-01T00:00:00+08:00",
      },
    },
  ],
}

const seriesList: FudabaSeriesList = {
  items: [
    {
      id: 1,
      code: "765",
      displayName: "765PRO",
      color: "#f54798",
      iconUrl: "/exchange-series/765.webp",
      imageTransform: defaultWikiImageTransform,
      displayOrder: 0,
      activeOfficeCount: 2,
    },
    {
      id: 2,
      code: "cg",
      displayName: "CG",
      color: "#2196f3",
      iconUrl: null,
      imageTransform: defaultWikiImageTransform,
      displayOrder: 1,
      activeOfficeCount: 0,
    },
  ],
}

// Owner-scoped responses build their URLs with exchangePath(), so the same
// field names arrive root-relative here.
const ownerCardList: FudabaOwnerCardList = {
  items: [
    {
      id: "card-1",
      producerName: "P",
      displayName: "名片",
      seriesCode: "765",
      favoriteIdol: "春香",
      favoriteIdols: [],
      frontImageUrl: "/api/exchange/me/cards/card-1/media/front?v=3",
      backImageUrl: "/api/exchange/me/cards/card-1/media/back?v=3",
      accent: "#f54798",
      bio: "",
      tradeNote: "",
      available: true,
      mediaRightsStatus: "approved",
      publicationStatus: "published",
      revision: 3,
      createdAt: "2026-01-01T00:00:00+08:00",
      updatedAt: "2026-01-02T00:00:00+08:00",
    },
  ],
}

const ownerOfficeList: FudabaOwnerOfficeList = {
  items: [
    {
      id: "office-1",
      slug: "gz-01",
      name: "广州事务所",
      intro: "",
      city: "广州",
      address: "天河区",
      location: { latitude: 23.1, longitude: 113.3, precision: "exact" },
      accent: "#f54798",
      coverUrl: "/api/exchange/me/offices/office-1/media/cover?v=2",
      pendingCoverUrl: null,
      pendingCoverSubmittedAt: null,
      isOpen: true,
      visitorCount: 3,
      status: "active",
      revision: 2,
      seriesCodes: ["765"],
      createdAt: "2026-01-01T00:00:00+08:00",
      updatedAt: "2026-01-02T00:00:00+08:00",
      archivedAt: null,
    },
  ],
}

// The review queue overwrites the owner card's media URLs with an admin route,
// so they arrive root-relative even when object storage is configured.
const registeredCardReviews: { items: FudabaRegisteredCardReview[] } = {
  items: [
    {
      card: {
        id: "card-9",
        producerName: "P",
        displayName: "待审名片",
        seriesCode: "765",
        favoriteIdol: "春香",
        favoriteIdols: [],
        frontImageUrl: "/api/admin/exchange/card-reviews/card-9/media/front?v=1",
        backImageUrl: "/api/admin/exchange/card-reviews/card-9/media/back?v=1",
        accent: "#f54798",
        bio: "",
        tradeNote: "",
        available: true,
        mediaRightsStatus: "approved",
        publicationStatus: "pending",
        revision: 1,
        createdAt: "2026-01-01T00:00:00+08:00",
        updatedAt: "2026-01-02T00:00:00+08:00",
      },
      owner: { id: "acct-1", displayName: "制作人" },
    },
  ],
}

// legacyCard comes straight out of the namecards table and skips the API's
// public-media resolution, so it is always root-relative.
const adminCardClaims: { items: FudabaAdminCardClaim[] } = {
  items: [
    {
      id: "claim-1",
      legacyCardId: 42,
      targetCardId: null,
      seriesCode: "765",
      favoriteIdols: [],
      state: "pending",
      message: "",
      reviewNote: "",
      revision: 0,
      createdAt: "2026-01-01T00:00:00+08:00",
      updatedAt: "2026-01-01T00:00:00+08:00",
      reviewedAt: null,
      claimant: { id: "acct-1", displayName: "制作人" },
      legacyCard: {
        id: 42,
        frontImageUrl: "/uploads/namecard/original/abc.webp",
        backImageUrl: "/uploads/namecard/original/def.webp",
      },
    },
  ],
}

// The grid's images pass through resolvePublicMediaUrl, which leaves the path
// alone on local disk and returns an absolute object-storage URL otherwise.
const namecardPage: NamecardPage = {
  list: [
    {
      id: 1,
      seriesCode: "765",
      favoriteIdols: [],
      claimStatus: "unclaimed",
      viewerClaimState: null,
      image1_url: "/uploads/namecard/original/abc.webp",
      image2_url: "/uploads/namecard/original/def.webp",
      image1_thumbnail_url: "/uploads/namecard/thumbnail/abc.webp.jpg",
      image2_thumbnail_url: "/uploads/namecard/thumbnail/def.webp.jpg",
      status: "approved",
      created_at: "2026-01-01T00:00:00+08:00",
    },
    {
      id: 2,
      seriesCode: null,
      favoriteIdols: [],
      claimStatus: "unclaimed",
      viewerClaimState: null,
      image1_url: "https://objects.example.com/namecards/2-front.webp",
      image2_url: "https://objects.example.com/namecards/2-back.webp",
      image1_thumbnail_url: "https://objects.example.com/namecards/2-front.jpg",
      image2_thumbnail_url: "https://objects.example.com/namecards/2-back.jpg",
      status: "approved",
      created_at: null,
    },
  ],
  total: 2,
  totalPage: 1,
}

const namecardSubmission: { submission: NamecardSubmission } = {
  submission: {
    id: 7,
    seriesCode: "765",
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    status: "pending",
    revision: 0,
    image1_url: "/uploads/namecard/original/ghi.webp",
    image2_url: "/uploads/namecard/original/jkl.webp",
    created_at: "2026-01-01T00:00:00+08:00",
  },
}

// The contract types both images optional, so an absent key must stay absent.
const withdrawnSubmission: { success: true; submission: NamecardSubmission } = {
  success: true,
  submission: {
    id: 8,
    seriesCode: null,
    favoriteIdols: [],
    claimStatus: "unclaimed",
    viewerClaimState: null,
    status: "withdrawn",
    revision: 1,
    created_at: "2026-01-01T00:00:00+08:00",
    withdrawn_at: "2026-01-02T00:00:00+08:00",
  },
}

const session: PlatformSession = {
  success: true,
  account: { id: "acct-1", status: "active" },
  profile: {
    displayName: "制作人",
    avatarUrl: "/platform-avatars/acct-1.webp",
    homeCity: "广州",
    bio: "",
  },
}

const oauthSession: PlatformSession = {
  ...session,
  profile: {
    ...session.profile,
    avatarUrl: "https://lh3.googleusercontent.com/a/abc123",
  },
}

const profileResponse: PlatformProfileResponse = {
  success: true,
  account: { id: "acct-1", status: "active" },
  profile: {
    displayName: "制作人",
    avatarUrl: "/platform-avatars/acct-1.webp",
    homeCity: "广州",
    bio: "",
    updatedAt: 1767200000,
  },
  capabilities: { fudabaWrite: true },
}

const chronicleSummaries: ChronicleActivitySummary[] = [
  {
    id: "activity-1",
    title: "线下交流会",
    date: "2026-07-24",
    location: "广州",
    cover: "/chronicle/activity-1/cover.webp",
  },
  {
    id: "activity-2",
    title: "生日会",
    date: "2026-08-01",
    location: "上海",
    cover: null,
  },
]

const chronicleActivity: ChronicleActivity = {
  id: "activity-1",
  title: "线下交流会",
  date: "2026-07-24",
  location: "广州",
  images: ["/chronicle/activity-1/a.webp", "/chronicle/activity-1/b.webp"],
}

const aboutContent: AboutPageContent = {
  version: 1,
  siteName: "IMS",
  siteNameEn: "IMS",
  tagline: "",
  // The live API mixes ownership here: /brand ships inside the web bundle
  // while /uploads is API-owned. Both arrive root-relative.
  heroImageUrl: "/brand/about/gakuen-arisa.png",
  heroImageAlt: "",
  heroImageScale: 100,
  heroImageOffsetX: 0,
  heroImageOffsetY: 0,
  accentColorStart: "#f54798",
  accentColorEnd: "#2196f3",
  welcome: "",
  manifesto: [],
  sinceYear: 2020,
  overviewTitle: "",
  overview: [],
  groups: [
    {
      id: "core",
      title: "核心",
      subtitle: "",
      people: [
        {
          id: "p1",
          name: "甲",
          role: "维护",
          description: "",
          since: "2020",
          profileUrl: "https://github.com/example",
          avatarUrl: "/uploads/about/member-avatars/abc123.jpg_128w",
        },
        {
          id: "p2",
          name: "乙",
          role: "设计",
          description: "",
          since: "2021",
          profileUrl: null,
          avatarUrl: null,
        },
      ],
    },
  ],
  updatedAt: null,
}

const producerMapContent: ProducerMapContent = {
  version: 1,
  title: "",
  subtitle: "",
  introduction: "",
  directoryTitle: "",
  mapSourceLabel: "",
  mapSourceUrl: "https://example.com/source",
  regions: [
    {
      id: "gd",
      province: "广东",
      name: "广东",
      summary: "",
      contact: "",
      linkUrl: "https://example.com/gd",
      imageUrl: "/producer-map/gd.webp",
      series: "all",
      enabled: true,
    },
  ],
  communities: [
    {
      id: "c1",
      name: "社群",
      platform: "QQ",
      region: "广东",
      description: "",
      contact: "",
      linkUrl: null,
      imageUrl: null,
      series: "765",
      enabled: true,
    },
  ],
  updatedAt: null,
}

/* -------------------------------------------------------------------------- */
/* The website must not change                                                */
/* -------------------------------------------------------------------------- */

describe("media URL normalisation without a configured origin", () => {
  it("returns every response shape byte-identical to its input", async () => {
    const media = await loadMediaUrls("")

    const cases: Array<[string, unknown, unknown]> = [
      [
        "wiki catalog",
        wikiCatalog,
        media.normalizeWikiPublicCatalog(wikiCatalog),
      ],
      [
        "wiki stories",
        wikiStories,
        media.normalizeWikiPublicStories(wikiStories),
      ],
      ["random idol", randomIdol, media.normalizeWikiRandomIdol(randomIdol)],
      ["series list", seriesList, media.normalizeFudabaSeriesList(seriesList)],
      ["office page", officePage, media.normalizeFudabaOfficePage(officePage)],
      ["card page", cardPage, media.normalizeFudabaCardPage(cardPage)],
      [
        "office detail",
        officeDetail,
        media.normalizeFudabaOfficeDetail(officeDetail),
      ],
      [
        "owner cards",
        ownerCardList,
        media.normalizeFudabaOwnerCardList(ownerCardList),
      ],
      [
        "owner offices",
        ownerOfficeList,
        media.normalizeFudabaOwnerOfficeList(ownerOfficeList),
      ],
      ["session", session, media.normalizePlatformSession(session)],
      [
        "profile",
        profileResponse,
        media.normalizePlatformProfileResponse(profileResponse),
      ],
      [
        "chronicle summaries",
        chronicleSummaries,
        media.normalizeChronicleActivitySummaries(chronicleSummaries),
      ],
      [
        "chronicle activity",
        chronicleActivity,
        media.normalizeChronicleActivity(chronicleActivity),
      ],
      ["about", aboutContent, media.normalizeAboutPageContent(aboutContent)],
      [
        "producer map",
        producerMapContent,
        media.normalizeProducerMapContent(producerMapContent),
      ],
      [
        "namecard page",
        namecardPage,
        media.normalizeNamecardPage(namecardPage),
      ],
      [
        "namecard submission",
        namecardSubmission,
        media.normalizeNamecardSubmissionEnvelope(namecardSubmission),
      ],
      [
        "withdrawn namecard submission",
        withdrawnSubmission,
        media.normalizeNamecardSubmissionEnvelope(withdrawnSubmission),
      ],
      [
        "registered card reviews",
        registeredCardReviews,
        media.normalizeFudabaRegisteredCardReviewList(registeredCardReviews),
      ],
      [
        "admin card claims",
        adminCardClaims,
        media.normalizeFudabaAdminCardClaimList(adminCardClaims),
      ],
    ]

    for (const [label, input, output] of cases) {
      expect(JSON.stringify(output), label).toBe(JSON.stringify(input))
    }
  })

  it("keeps null media fields null rather than collapsing them to empty strings", async () => {
    const media = await loadMediaUrls("")

    expect(
      media.normalizeWikiPublicCatalog(wikiCatalog).agencies[1].iconUrl
    ).toBe(null)
    expect(media.normalizeFudabaSeriesList(seriesList).items[1].iconUrl).toBe(
      null
    )
    expect(media.normalizeFudabaOfficePage(officePage).items[1].coverUrl).toBe(
      null
    )
    expect(
      media.normalizeChronicleActivitySummaries(chronicleSummaries)[1].cover
    ).toBe(null)
    expect(
      media.normalizeAboutPageContent(aboutContent).groups[0].people[1]
        .avatarUrl
    ).toBe(null)
  })

  it("does not absolutise against the document, unlike resolveSafeMediaUrl", async () => {
    // resolveSafeMediaUrl resolves against resolveSiteOrigin(), so with no
    // configured origin it rewrites root-relative paths into document-absolute
    // ones. That is correct at a render-time call site and wrong here, which is
    // why this layer uses resolveMediaUrl instead. This test pins the contrast
    // so a future refactor cannot quietly swap them.
    vi.resetModules()
    vi.stubEnv("VITE_IMS_API_ORIGIN", "")
    const { resolveSafeMediaUrl } = await import("~/lib/api/origin")

    expect(resolveSafeMediaUrl("/wiki-groups/1.webp")).toBe(
      `${window.location.origin}/wiki-groups/1.webp`
    )

    const media = await loadMediaUrls("")
    expect(
      media.normalizeWikiPublicCatalog(wikiCatalog).agencies[0].iconUrl
    ).toBe("/wiki-groups/1.webp")
  })
})

/* -------------------------------------------------------------------------- */
/* The packaged client must reach the API                                     */
/* -------------------------------------------------------------------------- */

describe("media URL normalisation with a configured origin", () => {
  it("absolutises wiki agency icons, idol avatars and story covers", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const catalog = media.normalizeWikiPublicCatalog(wikiCatalog)
    expect(catalog.agencies[0].iconUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-groups/1.webp`
    )
    expect(catalog.agencies[1].iconUrl).toBe(null)
    expect(catalog.selection?.agency.iconUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-groups/1.webp`
    )
    expect(catalog.selection?.groups[0].iconUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-groups/10.webp`
    )
    expect(catalog.selection?.groups[0].idols[0].imageUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-idols/haruka.webp`
    )
    expect(catalog.selection?.ungroupedIdols[0].imageUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-idols/chihaya.webp`
    )

    const stories = media.normalizeWikiPublicStories(wikiStories)
    expect(stories.idol.imageUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-idols/haruka.webp`
    )
    expect(stories.categories[0].cards[0].img).toBe(
      `${PACKAGED_ORIGIN}/wiki-stories/100.webp`
    )
  })

  it("leaves external story links alone", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    expect(
      media.normalizeWikiPublicStories(wikiStories).categories[0].cards[0]
        .links[0].url
    ).toBe("https://www.bilibili.com/video/BV1")
  })

  it("absolutises the home random-idol widget", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const resolved = media.normalizeWikiRandomIdol(randomIdol)

    expect(resolved.idol?.imageUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-idols/haruka.webp`
    )
    expect(resolved.idol?.agency.iconUrl).toBe(
      `${PACKAGED_ORIGIN}/wiki-groups/1.webp`
    )
  })

  it("passes an empty random-idol payload through", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const empty: WikiRandomIdol = {
      status: "success",
      eligibleCount: 0,
      idol: null,
    }

    expect(media.normalizeWikiRandomIdol(empty)).toEqual(empty)
  })

  it("leaves the already-absolute public fudaba directory untouched", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    expect(media.normalizeFudabaCardPage(cardPage).items[0].frontImageUrl).toBe(
      "https://objects.example.com/cards/1-front.webp"
    )
    expect(media.normalizeFudabaOfficePage(officePage).items[0].coverUrl).toBe(
      "https://objects.example.com/offices/1.webp"
    )
  })

  it("absolutises the owner-scoped fudaba responses that stay relative", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const cards = media.normalizeFudabaOwnerCardList(ownerCardList)
    expect(cards.items[0].frontImageUrl).toBe(
      `${PACKAGED_ORIGIN}/api/exchange/me/cards/card-1/media/front?v=3`
    )
    expect(cards.items[0].backImageUrl).toBe(
      `${PACKAGED_ORIGIN}/api/exchange/me/cards/card-1/media/back?v=3`
    )

    const offices = media.normalizeFudabaOwnerOfficeList(ownerOfficeList)
    expect(offices.items[0].coverUrl).toBe(
      `${PACKAGED_ORIGIN}/api/exchange/me/offices/office-1/media/cover?v=2`
    )
    expect(offices.items[0].pendingCoverUrl).toBe(null)
  })

  it("absolutises exchange series icons and placed cards on an office wall", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    expect(media.normalizeFudabaSeriesList(seriesList).items[0].iconUrl).toBe(
      `${PACKAGED_ORIGIN}/exchange-series/765.webp`
    )

    const detail = media.normalizeFudabaOfficeDetail(officeDetail)
    expect(detail.cards[0].frontImageUrl).toBe(
      "https://objects.example.com/cards/1-front.webp"
    )
    expect(detail.cards[0].placement.zIndex).toBe(1)
  })

  it("absolutises a self-hosted avatar but not an OAuth one", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    expect(media.normalizePlatformSession(session).profile.avatarUrl).toBe(
      `${PACKAGED_ORIGIN}/platform-avatars/acct-1.webp`
    )
    expect(media.normalizePlatformSession(oauthSession).profile.avatarUrl).toBe(
      "https://lh3.googleusercontent.com/a/abc123"
    )
    expect(
      media.normalizePlatformProfileResponse(profileResponse).profile.avatarUrl
    ).toBe(`${PACKAGED_ORIGIN}/platform-avatars/acct-1.webp`)
  })

  it("absolutises chronicle covers and every photo", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const summaries =
      media.normalizeChronicleActivitySummaries(chronicleSummaries)
    expect(summaries[0].cover).toBe(
      `${PACKAGED_ORIGIN}/chronicle/activity-1/cover.webp`
    )
    expect(summaries[1].cover).toBe(null)

    expect(media.normalizeChronicleActivity(chronicleActivity).images).toEqual([
      `${PACKAGED_ORIGIN}/chronicle/activity-1/a.webp`,
      `${PACKAGED_ORIGIN}/chronicle/activity-1/b.webp`,
    ])
  })

  it("absolutises the about hero and credit avatars but not profile links", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const content = media.normalizeAboutPageContent(aboutContent)

    // /brand is served by the bundle, so it must stay relative.
    expect(content.heroImageUrl).toBe("/brand/about/gakuen-arisa.png")
    // /uploads is API-owned, so it must be rewritten.
    expect(content.groups[0].people[0].avatarUrl).toBe(
      `${PACKAGED_ORIGIN}/uploads/about/member-avatars/abc123.jpg_128w`
    )
    expect(content.groups[0].people[0].profileUrl).toBe(
      "https://github.com/example"
    )
    expect(content.groups[0].people[1].avatarUrl).toBe(null)
  })

  it("absolutises producer-map dialog images but not external community links", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const content = media.normalizeProducerMapContent(producerMapContent)

    expect(content.regions[0].imageUrl).toBe(
      `${PACKAGED_ORIGIN}/producer-map/gd.webp`
    )
    expect(content.regions[0].linkUrl).toBe("https://example.com/gd")
    expect(content.mapSourceUrl).toBe("https://example.com/source")
    expect(content.communities[0].imageUrl).toBe(null)
  })

  it("absolutises the community namecard grid, thumbnails included", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const page = media.normalizeNamecardPage(namecardPage)

    expect(page.list[0].image1_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/abc.webp`
    )
    expect(page.list[0].image2_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/def.webp`
    )
    expect(page.list[0].image1_thumbnail_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/thumbnail/abc.webp.jpg`
    )
    expect(page.list[0].image2_thumbnail_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/thumbnail/def.webp.jpg`
    )
    // Object storage already hands back absolute URLs for the same fields.
    expect(page.list[1].image1_url).toBe(
      "https://objects.example.com/namecards/2-front.webp"
    )
    expect(page.list[1].image1_thumbnail_url).toBe(
      "https://objects.example.com/namecards/2-front.jpg"
    )
  })

  it("absolutises namecard submission images and keeps absent ones absent", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const detail = media.normalizeNamecardSubmissionEnvelope(namecardSubmission)
    expect(detail.submission.image1_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/ghi.webp`
    )
    expect(detail.submission.image2_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/jkl.webp`
    )

    const withdrawn =
      media.normalizeNamecardSubmissionEnvelope(withdrawnSubmission)
    expect(withdrawn.success).toBe(true)
    expect("image1_url" in withdrawn.submission).toBe(false)
    expect("image2_url" in withdrawn.submission).toBe(false)
  })

  it("absolutises the fudaba moderation queues", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const reviews =
      media.normalizeFudabaRegisteredCardReviewList(registeredCardReviews)
    expect(reviews.items[0].card.frontImageUrl).toBe(
      `${PACKAGED_ORIGIN}/api/admin/exchange/card-reviews/card-9/media/front?v=1`
    )
    expect(reviews.items[0].card.backImageUrl).toBe(
      `${PACKAGED_ORIGIN}/api/admin/exchange/card-reviews/card-9/media/back?v=1`
    )
    expect(reviews.items[0].owner.displayName).toBe("制作人")

    const claims = media.normalizeFudabaAdminCardClaimList(adminCardClaims)
    expect(claims.items[0].legacyCard.frontImageUrl).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/abc.webp`
    )
    expect(claims.items[0].legacyCard.backImageUrl).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/def.webp`
    )
    expect(claims.items[0].state).toBe("pending")
  })

  it("keeps bundle-owned paths relative in the namecard grid too", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const bundled: NamecardPage = {
      ...namecardPage,
      list: [
        {
          ...namecardPage.list[0],
          image1_url: "/brand/namecard-placeholder.png",
          image1_thumbnail_url: "/brand/namecard-placeholder.png",
        },
      ],
    }
    const page = media.normalizeNamecardPage(bundled)

    expect(page.list[0].image1_url).toBe("/brand/namecard-placeholder.png")
    expect(page.list[0].image1_thumbnail_url).toBe(
      "/brand/namecard-placeholder.png"
    )
    expect(page.list[0].image2_url).toBe(
      `${PACKAGED_ORIGIN}/uploads/namecard/original/def.webp`
    )
  })

  it("passes namecard data URIs and protocol-relative thumbnails through", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const mixed: NamecardPage = {
      ...namecardPage,
      list: [
        {
          ...namecardPage.list[0],
          image1_url: "data:image/png;base64,AAAA",
          image1_thumbnail_url: "//cdn.example.com/thumb.jpg",
        },
      ],
    }
    const page = media.normalizeNamecardPage(mixed)

    expect(page.list[0].image1_url).toBe("data:image/png;base64,AAAA")
    expect(page.list[0].image1_thumbnail_url).toBe("//cdn.example.com/thumb.jpg")
  })

  it("passes protocol-relative URLs and data URIs through untouched", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)
    const mixed: ChronicleActivity = {
      ...chronicleActivity,
      images: [
        "//cdn.example.com/a.webp",
        "data:image/png;base64,AAAA",
        "/chronicle/activity-1/c.webp",
      ],
    }

    expect(media.normalizeChronicleActivity(mixed).images).toEqual([
      "//cdn.example.com/a.webp",
      "data:image/png;base64,AAAA",
      `${PACKAGED_ORIGIN}/chronicle/activity-1/c.webp`,
    ])
  })
})
