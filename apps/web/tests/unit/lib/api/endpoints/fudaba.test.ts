import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createFudabaCard,
  createFudabaOffice,
  deleteFudabaCard,
  fudabaCardPageSchema,
  fudabaCardUpdateSchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficePageSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerLocationDetailSchema,
  fudabaOwnerOfficeListSchema,
  fudabaSeriesListSchema,
  getFudabaOwnerLocation,
  getFudabaOwnerOffice,
  getFudabaOwnerOffices,
  getFudabaOwnerCard,
  getFudabaOwnerCards,
  getFudabaOwnerSeries,
  getFudabaMapConfig,
  getFudabaMapOffices,
  updateFudabaCard,
  updateFudabaOwnerOffice,
  uploadFudabaCardMedia,
  saveFudabaOwnerLocation,
  withdrawFudabaOwnerLocation,
} from "~/lib/api/endpoints/fudaba"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const card = {
  id: "card-1",
  producerName: "春香P",
  displayName: "交换会用名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  frontImageUrl: "/media/card-1-front.webp",
  backImageUrl: "/media/card-1-back.webp",
  accent: "#f34e6c",
  bio: "周末参加线下活动",
  tradeNote: "希望交换同系列名片",
  available: true,
  source: null,
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 2,
    favorites: 1,
    viewerLiked: false,
    viewerFavorited: true,
  },
}

const office = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  intro: "面向线下活动的交换点。",
  city: "上海",
  accent: "#2581c7",
  coverUrl: null,
  isOpen: true,
  visitorCount: 12,
  seriesCodes: ["765as", "cinderella"],
}

const ownerCard = {
  id: "owner-card",
  producerName: "春香P",
  displayName: "交换会用名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  frontImageUrl: "/api/community/exchange/me/cards/owner-card/media/front?v=1",
  backImageUrl: "/api/community/exchange/me/cards/owner-card/media/back?v=1",
  accent: "#f34e6c",
  bio: "周末参加线下活动",
  tradeNote: "希望交换同系列名片",
  available: true,
  mediaRightsStatus: "unknown" as const,
  publicationStatus: "pending" as const,
  revision: 1,
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
}

const ownerOffice = {
  id: "owner-office",
  slug: "shanghai-owner-office",
  name: "上海制作人交换事务所",
  intro: "周末线下交换",
  city: "上海",
  address: "西岸艺术中心入口",
  location: {
    latitude: 31.18452,
    longitude: 121.45678,
    precision: "exact" as const,
  },
  accent: "#2581c7",
  coverUrl: null,
  pendingCoverUrl: null,
  pendingCoverSubmittedAt: null,
  isOpen: true,
  visitorCount: 12,
  status: "active" as const,
  revision: 3,
  seriesCodes: ["765as"],
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
  archivedAt: null,
}

const ownerLocation = {
  officeId: ownerOffice.id,
  location: {
    latitude: 31.2,
    longitude: 121.5,
    precision: "regional" as const,
  },
  reviewState: "published" as const,
  revision: 2,
  submittedAt: "2026-08-02T09:00:00.000Z",
  reviewedAt: "2026-08-02T10:00:00.000Z",
  reviewNote: "区域范围合适",
}

const cardFields = {
  producerName: "春香P",
  displayName: "交换会用名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
  accent: "#f34e6c",
  bio: "周末参加线下活动",
  tradeNote: "希望交换同系列名片",
  available: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_platform_csrf=; Max-Age=0; path=/"
})

describe("Fudaba Web API contracts", () => {
  it("accepts the public discovery responses", () => {
    expect(
      fudabaSeriesListSchema.parse({
        items: [
          {
            code: "765as",
            displayName: "本家 / 765AS",
            displayOrder: 0,
            activeOfficeCount: 1,
          },
        ],
      }).items[0]?.code
    ).toBe("765as")

    expect(
      fudabaOfficePageSchema.parse({
        items: [office],
        pageInfo: { hasNextPage: false, nextCursor: null },
      }).items[0]?.city
    ).toBe("上海")

    expect(
      fudabaCardPageSchema.parse({
        items: [card],
        pageInfo: { hasNextPage: true, nextCursor: "next-page" },
      }).items[0]?.interactions.viewerFavorited
    ).toBe(true)
  })

  it("accepts placement metadata only within the public wall bounds", () => {
    expect(
      fudabaOfficeDetailSchema.parse({
        office: {
          ...office,
          cards: [
            {
              ...card,
              placement: {
                pinnedAt: "2026-08-02T09:00:00.000Z",
                x: 55,
                y: 42,
                rotation: -4,
                zIndex: 8,
              },
            },
          ],
        },
      }).office.cards[0]?.placement.x
    ).toBe(55)

    expect(() =>
      fudabaOfficeDetailSchema.parse({
        office: {
          ...office,
          cards: [
            {
              ...card,
              placement: {
                pinnedAt: "2026-08-02T09:00:00.000Z",
                x: 101,
                y: 42,
                rotation: -4,
                zIndex: 8,
              },
            },
          ],
        },
      })
    ).toThrow()
  })

  it("accepts only regional map DTOs and same-origin style paths", () => {
    const mapOffice = {
      id: office.id,
      slug: office.slug,
      name: office.name,
      city: office.city,
      accent: office.accent,
      isOpen: office.isOpen,
      seriesCodes: office.seriesCodes,
      location: {
        latitude: 31.2,
        longitude: 121.5,
        precision: "regional" as const,
      },
    }

    expect(
      fudabaMapOfficeListSchema.parse({
        items: [mapOffice],
        truncated: false,
      }).items[0]?.location.precision
    ).toBe("regional")
    expect(() =>
      fudabaMapOfficeListSchema.parse({
        items: [{ ...mapOffice, intro: "private precision leak" }],
        truncated: false,
      })
    ).toThrow()
    expect(() =>
      fudabaMapOfficeListSchema.parse({
        items: [
          {
            ...mapOffice,
            location: { ...mapOffice.location, latitude: 31.25 },
          },
        ],
        truncated: false,
      })
    ).toThrow(/0.1 degree grid/)
    for (const latitude of [-60.1, 60.1]) {
      expect(() =>
        fudabaMapOfficeListSchema.parse({
          items: [
            {
              ...mapOffice,
              location: { ...mapOffice.location, latitude },
            },
          ],
          truncated: false,
        })
      ).toThrow()
    }

    expect(
      fudabaMapConfigSchema.parse({
        styleUrl: " /api/community/exchange/map/style.json ",
      }).styleUrl
    ).toBe("/api/community/exchange/map/style.json")
    for (const styleUrl of [
      "",
      "style.json",
      "https://maps.example/style",
      "//maps.example/style",
      "/styles//map.json",
      "/styles\\map.json",
      "/styles/map.json?key=secret",
      "/styles/map.json#layer",
      "/styles/map\n.json",
      `/styles/${"x".repeat(2048)}`,
    ]) {
      expect(() => fudabaMapConfigSchema.parse({ styleUrl })).toThrow()
    }
  })

  it("requests map config and bounded offices with Platform auth", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), "http://ims.test")
        requests.push({ url, init })
        if (url.pathname.endsWith("/map/config")) {
          return Response.json({
            styleUrl: "/api/community/exchange/map/style.json",
          })
        }
        return Response.json({ items: [], truncated: false })
      })
    )

    await getFudabaMapConfig().send()
    await getFudabaMapOffices({
      bbox: [100, 20, 130, 45],
      city: " 上海 ",
      series: "765as",
      open: true,
      limit: 200,
    }).send()

    expect(requests.map(({ url }) => url.pathname)).toEqual([
      "/api/community/exchange/map/config",
      "/api/community/exchange/map/offices",
    ])
    const query = requests[1]?.url.searchParams
    expect(query?.get("bbox")).toBe("100,20,130,45")
    expect(query?.get("city")).toBe("上海")
    expect(query?.get("series")).toBe("765as")
    expect(query?.get("open")).toBe("true")
    expect(query?.get("limit")).toBe("200")
    for (const request of requests) {
      expect(request.init?.credentials).toBe("same-origin")
      expect(
        new Headers(request.init?.headers).get(CSRF_HEADER_NAME)
      ).toBeNull()
    }
  })

  it("strips privacy-only fields and rejects inconsistent pagination", () => {
    expect(() =>
      fudabaOfficePageSchema.parse({
        items: [{ ...office, ownerAccountId: "private-owner" }],
        pageInfo: { hasNextPage: false, nextCursor: null },
      })
    ).not.toThrow()

    const parsed = fudabaOfficePageSchema.parse({
      items: [{ ...office, ownerAccountId: "private-owner" }],
      pageInfo: { hasNextPage: false, nextCursor: null },
    })
    expect(parsed.items[0]).not.toHaveProperty("ownerAccountId")
    expect(parsed.items[0]).not.toHaveProperty("address")
    expect(parsed.items[0]).not.toHaveProperty("latitude")

    expect(() =>
      fudabaOfficePageSchema.parse({
        items: [],
        pageInfo: { hasNextPage: true, nextCursor: null },
      })
    ).toThrow(/pagination state is inconsistent/)
  })

  it("accepts only the exact owner card projection and mutation fields", () => {
    expect(
      fudabaOwnerCardListSchema.parse({ items: [ownerCard] }).items[0]
        ?.publicationStatus
    ).toBe("pending")

    expect(() =>
      fudabaOwnerCardListSchema.parse({
        items: [{ ...ownerCard, frontObjectKey: "protected/front.webp" }],
      })
    ).toThrow()
    expect(() =>
      fudabaCardUpdateSchema.parse({
        ...cardFields,
        expectedRevision: 1,
        publicationStatus: "published",
      })
    ).toThrow()
  })

  it("keeps exact owner office data separate from regional public locations", () => {
    expect(
      fudabaOwnerOfficeListSchema.parse({ items: [ownerOffice] }).items[0]
        ?.location
    ).toEqual({
      latitude: 31.18452,
      longitude: 121.45678,
      precision: "exact",
    })
    expect(
      fudabaOwnerLocationDetailSchema.parse({ location: ownerLocation })
        .location?.location
    ).toEqual({ latitude: 31.2, longitude: 121.5, precision: "regional" })
    expect(() =>
      fudabaOwnerLocationDetailSchema.parse({
        location: {
          ...ownerLocation,
          location: { ...ownerLocation.location, latitude: 31.25 },
        },
      })
    ).toThrow(/0.1 degree grid/)
    expect(() =>
      fudabaOwnerOfficeListSchema.parse({
        items: [{ ...ownerOffice, ownerAccountId: "private-owner" }],
      })
    ).toThrow()
  })

  it("uses authenticated owner reads and URL-encodes card IDs", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const encodedCardId = "owner%20card%3F%23"
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), "http://ims.test").pathname
        requests.push({ url: pathname, init })
        if (pathname.endsWith("/me/series")) {
          return Response.json({
            items: [
              {
                code: "765as",
                displayName: "本家 / 765AS",
                displayOrder: 0,
                activeOfficeCount: 1,
              },
            ],
          })
        }
        if (pathname.endsWith("/me/cards")) {
          return Response.json({ items: [ownerCard] })
        }
        if (pathname.endsWith(`/${encodedCardId}`)) {
          return Response.json({
            card: { ...ownerCard, id: "owner card?#" },
          })
        }
        throw new Error(`Unexpected request: ${pathname}`)
      })
    )

    await expect(getFudabaOwnerSeries().send()).resolves.toMatchObject({
      items: [{ code: "765as" }],
    })
    await expect(getFudabaOwnerCards().send()).resolves.toMatchObject({
      items: [{ id: "owner-card" }],
    })
    await expect(
      getFudabaOwnerCard("owner card?#").send()
    ).resolves.toMatchObject({ card: { id: "owner card?#" } })

    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ["/api/community/exchange/me/series", "GET"],
      ["/api/community/exchange/me/cards", "GET"],
      [`/api/community/exchange/me/cards/${encodedCardId}`, "GET"],
    ])
    for (const request of requests) {
      expect(
        new Headers(request.init?.headers).get(CSRF_HEADER_NAME)
      ).toBeNull()
    }
  })

  it("uses strict JSON and multipart bodies with Platform CSRF for writes", async () => {
    document.cookie = "ims_platform_csrf=owner-write-csrf; path=/"
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), "http://ims.test").pathname
        requests.push({ url: pathname, init })
        if (init?.method === "DELETE") {
          return Response.json({ success: true, revision: 2 })
        }
        return Response.json({ success: true, card: ownerCard })
      })
    )
    const front = new File(["front"], "front.png", { type: "image/png" })
    const back = new File(["back"], "back.png", { type: "image/png" })
    const replacement = new File(["next"], "next.png", {
      type: "image/png",
    })

    await createFudabaCard({ ...cardFields, front, back }).send()
    await updateFudabaCard("owner card?#", {
      ...cardFields,
      displayName: "  Updated card  ",
      expectedRevision: 1,
    }).send()
    await uploadFudabaCardMedia("owner card?#", "front", replacement, 1).send()
    await deleteFudabaCard("owner card?#", 1).send()

    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ["/api/community/exchange/cards", "POST"],
      ["/api/community/exchange/me/cards/owner%20card%3F%23", "PUT"],
      ["/api/community/exchange/uploads/front", "PUT"],
      ["/api/community/exchange/me/cards/owner%20card%3F%23", "DELETE"],
    ])
    for (const request of requests) {
      expect(new Headers(request.init?.headers).get(CSRF_HEADER_NAME)).toBe(
        "owner-write-csrf"
      )
    }

    expect(requests[0]?.init?.body).toBeInstanceOf(FormData)
    const create = requests[0]?.init?.body as FormData
    expect(create.get("front")).toBe(front)
    expect(create.get("back")).toBe(back)
    expect(create.get("available")).toBe("true")
    expect(create.get("displayName")).toBe(cardFields.displayName)

    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      ...cardFields,
      displayName: "Updated card",
      expectedRevision: 1,
    })

    expect(requests[2]?.init?.body).toBeInstanceOf(FormData)
    const media = requests[2]?.init?.body as FormData
    expect(media.get("image")).toBe(replacement)
    expect(media.get("cardId")).toBe("owner card?#")
    expect(media.get("expectedRevision")).toBe("1")

    expect(JSON.parse(String(requests[3]?.init?.body))).toEqual({
      expectedRevision: 1,
    })
  })

  it("uses owner office CAS, idempotency, and independent location endpoints", async () => {
    document.cookie = "ims_platform_csrf=owner-office-csrf; path=/"
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), "http://ims.test").pathname
        requests.push({ url: pathname, init })
        if (init?.method === "DELETE") return Response.json({ success: true })
        if (pathname.endsWith("/location") && init?.method === "PUT") {
          return Response.json({
            success: true,
            officeLocation: {
              ...ownerLocation,
              reviewState: "pending",
              revision: 3,
              reviewedAt: null,
              reviewNote: "",
            },
          })
        }
        if (pathname.endsWith("/location")) {
          return Response.json({ location: ownerLocation })
        }
        if (pathname.endsWith("/me/offices") && init?.method === "GET") {
          return Response.json({ items: [ownerOffice] })
        }
        if (pathname.endsWith("/owner-office") && init?.method === "GET") {
          return Response.json({ office: ownerOffice })
        }
        return Response.json({ success: true, office: ownerOffice })
      })
    )
    const fields = {
      name: ownerOffice.name,
      intro: ownerOffice.intro,
      city: ownerOffice.city,
      address: ownerOffice.address,
      latitude: ownerOffice.location.latitude,
      longitude: ownerOffice.location.longitude,
      accent: ownerOffice.accent,
      isOpen: ownerOffice.isOpen,
      seriesCodes: ownerOffice.seriesCodes,
    }

    await getFudabaOwnerOffices().send()
    await getFudabaOwnerOffice(ownerOffice.id).send()
    await getFudabaOwnerLocation(ownerOffice.id).send()
    await createFudabaOffice(fields, "office-create-1").send()
    await updateFudabaOwnerOffice(ownerOffice.id, {
      ...fields,
      expectedRevision: 3,
    }).send()
    await saveFudabaOwnerLocation(ownerOffice.id, {
      latitude: 31.2,
      longitude: 121.5,
      expectedRevision: 2,
    }).send()
    await withdrawFudabaOwnerLocation(ownerOffice.id, 3).send()

    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ["/api/community/exchange/me/offices", "GET"],
      ["/api/community/exchange/me/offices/owner-office", "GET"],
      ["/api/community/exchange/me/offices/owner-office/location", "GET"],
      ["/api/community/exchange/offices", "POST"],
      ["/api/community/exchange/me/offices/owner-office", "PUT"],
      ["/api/community/exchange/me/offices/owner-office/location", "PUT"],
      ["/api/community/exchange/me/offices/owner-office/location", "DELETE"],
    ])

    for (const [index, request] of requests.entries()) {
      expect(new Headers(request.init?.headers).get(CSRF_HEADER_NAME)).toBe(
        index < 3 ? null : "owner-office-csrf"
      )
    }
    expect(new Headers(requests[3]?.init?.headers).get("Idempotency-Key")).toBe(
      "office-create-1"
    )
    expect(JSON.parse(String(requests[4]?.init?.body))).toMatchObject({
      expectedRevision: 3,
      latitude: 31.18452,
      longitude: 121.45678,
    })
    expect(JSON.parse(String(requests[5]?.init?.body))).toEqual({
      latitude: 31.2,
      longitude: 121.5,
      expectedRevision: 2,
    })
    expect(JSON.parse(String(requests[6]?.init?.body))).toEqual({
      expectedRevision: 3,
    })
  })
})
