import { iconPath, imagePath, publicAssetsPath } from "@imsweb/contracts/paths"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  makeAboutGroup,
  makeAboutPageContent,
  makeAboutPerson,
} from "@/mocks/data/about"
import {
  makeChronicleActivity,
  makeChronicleActivitySummary,
} from "@/mocks/data/chronicle"
import {
  makeFudabaAdminCardClaim,
  makeFudabaCardPage,
  makeFudabaOfficeDetail,
  makeFudabaOfficePage,
  makeFudabaOwnerCardList,
  makeFudabaOwnerOfficeList,
  makeFudabaRegisteredCardReview,
  makeFudabaSeriesList,
} from "@/mocks/data/fudaba"
import { makeNamecardPage } from "@/mocks/data/namecards"
import {
  makePlatformProfileResponse,
  makePlatformSession,
  makePlatformSessionProfile,
} from "@/mocks/data/platform"
import { makeProducerMapContent } from "@/mocks/data/producer-map"
import {
  makeWikiPublicCatalog,
  makeWikiPublicStories,
  makeWikiRandomIdol,
} from "@/mocks/data/wiki"
import type { ChronicleActivity, NamecardPage, WikiRandomIdol } from "~/lib/api"

const PACKAGED_ORIGIN = "https://idol-master.top"

/**
 * The wiki fixtures compose media URLs the way the API does, so every path
 * below is built from the same `@imsweb/contracts/paths` builder and carries the
 * same URL-encoded name segments. Deriving them here keeps the expectations
 * readable instead of hardcoding percent escapes.
 */
const AGENCY_NAME = "765PRO"
const HARUKA = "天海春香"
const CHIHAYA = "如月千早"

const groupIcon = (id: number) => iconPath(`/wiki-groups/${id}.webp`)

const idolIcon = (agency: string, idol: string) =>
  imagePath(
    `/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/icon.webp`
  )

const storyImage = (agency: string, idol: string, file: string) =>
  imagePath(
    `/${encodeURIComponent(agency)}/${encodeURIComponent(idol)}/${file}`
  )

/**
 * Series icons fall back to `iconPath('/agencies/<row id>.webp')`, and chronicle
 * photos are composed with `publicAssetsPath('/images/eventchronicle/events/
 * <bucket>/<id>/<file>')`. Both mirror the API, so a drift in either surfaces
 * here rather than as a broken image on a mocked page.
 */
const seriesIcon = (id: number) => iconPath(`/agencies/${id}.webp`)

const chronicleAsset = (activityId: string, file: string) =>
  publicAssetsPath(
    `/images/eventchronicle/events/used/${encodeURIComponent(activityId)}/${encodeURIComponent(file)}`
  )

async function loadMediaUrls(
  configuredOrigin: string,
  publicSiteOrigin = configuredOrigin,
  appTarget: "web" | "app" = configuredOrigin ? "app" : "web"
) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
  vi.stubEnv("VITE_IMS_PUBLIC_SITE_ORIGIN", publicSiteOrigin)
  vi.stubEnv("VITE_IMS_APP_TARGET", appTarget)
  return import("~/lib/api/media-urls")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const wikiCatalog = makeWikiPublicCatalog()

const wikiStories = makeWikiPublicStories()

const randomIdol = makeWikiRandomIdol()

const officePage = makeFudabaOfficePage()

const cardPage = makeFudabaCardPage()

const officeDetail = makeFudabaOfficeDetail()

const seriesList = makeFudabaSeriesList()

// Owner-scoped responses build their URLs with exchangePath(), so the same
// field names arrive root-relative here.
const ownerCardList = makeFudabaOwnerCardList()

const ownerOfficeList = makeFudabaOwnerOfficeList()

// The review queue overwrites the owner card's media URLs with an admin route,
// so they arrive root-relative even when object storage is configured.
const registeredCardReviews = { items: [makeFudabaRegisteredCardReview()] }

// legacyCard comes straight out of the namecards table and skips the API's
// public-media resolution, so it is always root-relative.
const adminCardClaims = { items: [makeFudabaAdminCardClaim()] }

// The grid's images pass through resolvePublicMediaUrl, which leaves the path
// alone on local disk and returns an absolute object-storage URL otherwise.
const namecardPage = makeNamecardPage()

const session = makePlatformSession()

const oauthSession = makePlatformSession({
  profile: makePlatformSessionProfile({
    avatarUrl: "https://lh3.googleusercontent.com/a/abc123",
  }),
})

const profileResponse = makePlatformProfileResponse()

const chronicleSummaries = [
  makeChronicleActivitySummary(),
  makeChronicleActivitySummary({
    id: "activity-2",
    title: "生日会",
    date: "2026-08-01",
    location: "上海",
    cover: null,
  }),
]

const chronicleActivity = makeChronicleActivity()

const aboutContent = makeAboutPageContent({
  groups: [
    makeAboutGroup({
      people: [
        makeAboutPerson(),
        makeAboutPerson({
          id: "p2",
          name: "乙",
          role: "设计",
          description: "",
          since: "2021",
          profileUrl: null,
          avatarUrl: null,
        }),
        makeAboutPerson({
          id: "p3",
          name: "丙",
          role: "协力",
          description: "",
          since: "2022",
          profileUrl: null,
          avatarUrl: "/brand/about/staff/helper.webp",
        }),
      ],
    }),
  ],
})

const producerMapContent = makeProducerMapContent()

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
    vi.stubEnv("VITE_IMS_APP_TARGET", "web")
    const { resolveSafeMediaUrl } = await import("~/lib/api/origin")

    expect(resolveSafeMediaUrl("/wiki-groups/1.webp")).toBe(
      `${window.location.origin}/wiki-groups/1.webp`
    )

    const media = await loadMediaUrls("")
    expect(
      media.normalizeWikiPublicCatalog(wikiCatalog).agencies[0].iconUrl
    ).toBe(groupIcon(1))
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
      `${PACKAGED_ORIGIN}${groupIcon(1)}`
    )
    expect(catalog.agencies[1].iconUrl).toBe(null)
    expect(catalog.selection?.agency.iconUrl).toBe(
      `${PACKAGED_ORIGIN}${groupIcon(1)}`
    )
    expect(catalog.selection?.groups[0].iconUrl).toBe(
      `${PACKAGED_ORIGIN}${groupIcon(10)}`
    )
    expect(catalog.selection?.groups[0].idols[0].imageUrl).toBe(
      `${PACKAGED_ORIGIN}${idolIcon(AGENCY_NAME, HARUKA)}`
    )
    expect(catalog.selection?.ungroupedIdols[0].imageUrl).toBe(
      `${PACKAGED_ORIGIN}${idolIcon(AGENCY_NAME, CHIHAYA)}`
    )

    const stories = media.normalizeWikiPublicStories(wikiStories)
    expect(stories.idol.imageUrl).toBe(
      `${PACKAGED_ORIGIN}${idolIcon(AGENCY_NAME, HARUKA)}`
    )
    expect(stories.categories[0].cards[0].img).toBe(
      `${PACKAGED_ORIGIN}${storyImage(AGENCY_NAME, HARUKA, "100.webp")}`
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
      `${PACKAGED_ORIGIN}${idolIcon(AGENCY_NAME, HARUKA)}`
    )
    expect(resolved.idol?.agency.iconUrl).toBe(
      `${PACKAGED_ORIGIN}${groupIcon(1)}`
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
      `${PACKAGED_ORIGIN}${seriesIcon(1)}`
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
      `${PACKAGED_ORIGIN}${chronicleAsset("activity-1", "cover.webp")}`
    )
    expect(summaries[1].cover).toBe(null)

    expect(media.normalizeChronicleActivity(chronicleActivity).images).toEqual([
      `${PACKAGED_ORIGIN}${chronicleAsset("activity-1", "a.webp")}`,
      `${PACKAGED_ORIGIN}${chronicleAsset("activity-1", "b.webp")}`,
    ])
  })

  it("routes About heroes by ownership and all member avatars to the API", async () => {
    const apiOrigin = "https://api.idol-master.top"
    const publicSiteOrigin = "https://idol-master.top"
    const media = await loadMediaUrls(apiOrigin, publicSiteOrigin)
    const content = media.normalizeAboutPageContent(aboutContent)

    expect(content.heroImageUrl).toBe(
      `${publicSiteOrigin}/brand/about/gakuen-arisa.png`
    )
    expect(content.groups[0].people[0].avatarUrl).toBe(
      `${apiOrigin}/uploads/about/member-avatars/abc123.jpg_128w`
    )
    expect(content.groups[0].people[0].profileUrl).toBe(
      "https://github.com/example"
    )
    expect(content.groups[0].people[1].avatarUrl).toBe(null)
    expect(content.groups[0].people[2].avatarUrl).toBe(
      `${apiOrigin}/brand/about/staff/helper.webp`
    )
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

  it("absolutises the fudaba moderation queues", async () => {
    const media = await loadMediaUrls(PACKAGED_ORIGIN)

    const reviews = media.normalizeFudabaRegisteredCardReviewList(
      registeredCardReviews
    )
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
    expect(page.list[0].image1_thumbnail_url).toBe(
      "//cdn.example.com/thumb.jpg"
    )
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
