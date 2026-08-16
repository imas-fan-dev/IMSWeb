import { afterEach, describe, expect, it, vi } from "vitest"

import {
  CLIENT_CACHE_DURATION,
  NO_CLIENT_CACHE,
  PUBLIC_CACHE_INVALIDATION_SOURCE,
  PUBLIC_QUERY_CACHE_FOR,
  STABLE_CONTENT_CACHE_FOR,
  WIKI_PUBLIC_CACHE,
} from "~/lib/api/cache-policy"
import { apiClient } from "~/lib/api/client"
import {
  createAdminEvent,
  deleteIdolMedia,
  getAboutPageContent,
  getAdminSession,
  getAdminWikiCatalog,
  getChronicleActivities,
  getEventPage,
  getHomeInformation,
  getHomeNews,
  getHomepageLinks,
  getLiveEvents,
  getNamecardPage,
  getProducerMapContent,
  getPublicSitePackage,
  getRecommendationPage,
  getWikiCatalog,
  getWikiRandomBackground,
  getWikiRandomIdol,
  getWikiStories,
  uploadIdolMedia,
  updateWikiAgency,
} from "~/lib/api"

const emptyWikiCatalog = {
  status: "success",
  agencies: [],
  selection: null,
} as const

const emptyWikiStories = {
  status: "success",
  agency: {
    id: 1,
    code: "765",
    name: "765PRO",
    color: "#ff0000",
  },
  idol: {
    id: 1,
    name: "天海春香",
    folderName: "amami_haruka",
    color: "#ff0000",
    imageUrl: "/image/765PRO/天海春香/icon.webp",
    imageFit: "cover",
    textColor: "#ffffff",
  },
  categories: [],
} as const

describe("Alova client cache policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = "csrf_token=; Max-Age=0; path=/"
  })

  it("keeps caching opt-in and assigns durations by content volatility", () => {
    expect(apiClient.options.cacheFor).toBeNull()
    expect(CLIENT_CACHE_DURATION).toEqual({
      publicFeed: 5 * 60 * 1000,
      stableContent: 30 * 60 * 1000,
      wiki: 60 * 60 * 1000,
    })

    for (const method of [
      getEventPage(),
      getRecommendationPage(),
      getHomeInformation(),
      getChronicleActivities(),
      getLiveEvents(["2026-08"]),
    ]) {
      expect(method.config.cacheFor).toBe(PUBLIC_QUERY_CACHE_FOR)
    }

    for (const [method, source] of [
      [getEventPage(), PUBLIC_CACHE_INVALIDATION_SOURCE.events],
      [
        getRecommendationPage(),
        PUBLIC_CACHE_INVALIDATION_SOURCE.recommendations,
      ],
      [getHomeInformation(), PUBLIC_CACHE_INVALIDATION_SOURCE.information],
      [getChronicleActivities(), PUBLIC_CACHE_INVALIDATION_SOURCE.chronicle],
      [getNamecardPage(), PUBLIC_CACHE_INVALIDATION_SOURCE.community],
    ] as const) {
      expect(method.hitSource).toEqual([source])
    }

    for (const method of [
      getAboutPageContent(),
      getHomepageLinks(),
      getProducerMapContent(),
      getPublicSitePackage("sample"),
    ]) {
      expect(method.config.cacheFor).toBe(STABLE_CONTENT_CACHE_FOR)
    }

    for (const method of [
      getWikiCatalog(),
      getWikiStories("765PRO", "天海春香"),
    ]) {
      expect(method.config.cacheFor).toEqual(WIKI_PUBLIC_CACHE)
      expect(method.hitSource).toEqual([PUBLIC_CACHE_INVALIDATION_SOURCE.wiki])
    }

    expect(getNamecardPage().config.cacheFor).toBe(NO_CLIENT_CACHE)
    expect(getWikiRandomBackground().config.cacheFor).toBe(NO_CLIENT_CACHE)
    expect(getWikiRandomIdol().config.cacheFor).toBe(NO_CLIENT_CACHE)
    expect(getAdminSession().config.cacheFor).toBeUndefined()
    expect(getAdminWikiCatalog().config.cacheFor).toBeUndefined()
    expect(
      createAdminEvent(new FormData(), "cache-policy-test").config.name
    ).toBe(PUBLIC_CACHE_INVALIDATION_SOURCE.events)
    expect(
      uploadIdolMedia(
        "765PRO",
        "天海春香",
        new File(["idol"], "idol.png", { type: "image/png" })
      ).config.name
    ).toBe(PUBLIC_CACHE_INVALIDATION_SOURCE.wiki)
    expect(deleteIdolMedia("765PRO", "天海春香").config.name).toBe(
      PUBLIC_CACHE_INVALIDATION_SOURCE.wiki
    )
    expect(
      updateWikiAgency(1, {
        name: "765PRO",
        color: "#ff0000",
        bannerTitle: "765PRO ALLSTARS",
        wikiEnabled: true,
      }).config.name
    ).toBe(PUBLIC_CACHE_INVALIDATION_SOURCE.wiki)
  })

  it("reuses the canonical recommendation response for the home summary", () => {
    const homeMethod = getHomeNews(4)
    const recommendationMethod = getRecommendationPage({ limit: 4 })

    expect(homeMethod.key).toBe(recommendationMethod.key)
    expect(homeMethod.config.transform).toBe(
      recommendationMethod.config.transform
    )
  })

  it("caches Wiki reads per parameter set but never caches random results", async () => {
    let backgroundRequest = 0
    let randomIdolRequest = 0
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin
      )
      if (url.pathname === "/api/wiki/random_bg") {
        backgroundRequest += 1
        return Response.json({ url: `/image/random-${backgroundRequest}.webp` })
      }
      if (url.pathname === "/api/wiki/random_idol") {
        randomIdolRequest += 1
        return Response.json({
          status: "success",
          eligibleCount: randomIdolRequest,
          idol: null,
        })
      }
      return Response.json(emptyWikiCatalog)
    })
    vi.stubGlobal("fetch", fetchMock)

    const firstCatalog = getWikiCatalog("765PRO")
    const repeatedCatalog = getWikiCatalog("765PRO")
    const otherCatalog = getWikiCatalog("闪耀色彩")

    await firstCatalog.send()
    await repeatedCatalog.send()
    await otherCatalog.send()
    const firstBackground = await getWikiRandomBackground().send()
    const secondBackground = await getWikiRandomBackground().send()
    const firstRandomIdol = await getWikiRandomIdol().send()
    const secondRandomIdol = await getWikiRandomIdol().send()

    expect(repeatedCatalog.fromCache).toBe(true)
    expect(otherCatalog.fromCache).toBe(false)
    expect(firstBackground.url).toBe("/image/random-1.webp")
    expect(secondBackground.url).toBe("/image/random-2.webp")
    expect(firstRandomIdol.eligibleCount).toBe(1)
    expect(secondRandomIdol.eligibleCount).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("invalidates all Wiki variants after legacy media writes", async () => {
    document.cookie = "csrf_token=wiki-cache-test; path=/"
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin
      )
      const method = input instanceof Request ? input.method : init?.method
      if (url.pathname === "/api/wiki/idol-media") {
        return method === "POST"
          ? Response.json({ status: "success", url: "/image/idol.webp" })
          : Response.json({ status: "success" })
      }
      if (url.pathname === "/api/wiki/stories") {
        return Response.json(emptyWikiStories)
      }
      return Response.json(emptyWikiCatalog)
    })
    vi.stubGlobal("fetch", fetchMock)

    const readWikiVariants = async () => {
      await getWikiCatalog("765PRO").send()
      await getWikiCatalog("闪耀色彩").send()
      await getWikiStories("765PRO", "天海春香").send()
    }

    await readWikiVariants()
    await readWikiVariants()
    await uploadIdolMedia(
      "765PRO",
      "天海春香",
      new File(["idol"], "idol.png", { type: "image/png" })
    ).send()
    await readWikiVariants()
    await deleteIdolMedia("765PRO", "天海春香").send()
    await readWikiVariants()

    expect(fetchMock).toHaveBeenCalledTimes(11)
  })

  it("refreshes cached admin-facing event feeds after a write", async () => {
    document.cookie = "csrf_token=event-cache-test; path=/"
    const emptyEventPage = {
      items: [],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: null,
      },
    }
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.origin
      )
      return url.pathname === "/api/events" && url.search
        ? Response.json(emptyEventPage)
        : Response.json({ success: true, id: 1 })
    })
    vi.stubGlobal("fetch", fetchMock)

    await getEventPage({ limit: 50 }).send()
    await getEventPage({ limit: 50 }).send()
    await createAdminEvent(new FormData(), "cache-policy-test").send()
    await getEventPage({ limit: 50 }).send()

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
