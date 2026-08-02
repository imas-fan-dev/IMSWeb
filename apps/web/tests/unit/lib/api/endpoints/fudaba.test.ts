import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createFudabaCard,
  deleteFudabaCard,
  fudabaCardPageSchema,
  fudabaCardUpdateSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficePageSchema,
  fudabaOwnerCardListSchema,
  fudabaSeriesListSchema,
  getFudabaOwnerCard,
  getFudabaOwnerCards,
  getFudabaOwnerSeries,
  updateFudabaCard,
  uploadFudabaCardMedia,
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
})
