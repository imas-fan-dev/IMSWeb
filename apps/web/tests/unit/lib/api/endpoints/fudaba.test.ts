import { describe, expect, it } from "vitest"

import {
  fudabaCardPageSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficePageSchema,
  fudabaSeriesListSchema,
} from "~/lib/api/endpoints/fudaba"

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
})
