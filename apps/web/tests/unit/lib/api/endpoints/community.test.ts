import { describe, expect, it } from "vitest"

import {
  getNamecardCollectionPage,
  getNamecardPage,
  namecardSchema,
} from "~/lib/api/endpoints/community"
import { makeNamecard } from "@/mocks/data/namecards"
import {
  installFetchMock,
  jsonResponse,
  requestDetails,
  type RequestDetails,
} from "@/tests/unit/support/api-client"

describe("community API contracts", () => {
  it("rejects numeric string card IDs instead of coercing wire data", () => {
    expect(() =>
      namecardSchema.parse({
        id: "12",
        status: "approved",
        created_at: null,
      })
    ).toThrow()
  })

  it("rejects an incomplete card", () => {
    expect(() =>
      namecardSchema.parse({
        id: 1,
      })
    ).toThrow()
  })

  it("does not cache viewer-specific claim state across sessions", async () => {
    let requestCount = 0
    installFetchMock(() => {
      requestCount += 1
      return Promise.resolve(
        Response.json({
          list: [
            {
              id: 42,
              cardId: "card-42",
              cardNumber: 42,
              revision: 1,
              producerName: "天海春香",
              producerReading: null,
              groupName: null,
              madeOn: null,
              isOriginal: false,
              madeWithAi: false,
              bio: null,
              tradeNote: null,
              exchangeMode: "manual",
              accent: "#ff74b8",
              seriesCodes: [],
              credits: [],
              canEdit: false,
              hasOwner: false,
              seriesCode: null,
              favoriteCharacters: [],
              claimStatus: requestCount === 1 ? "unclaimed" : "pending",
              supplementPending: false,
              viewerClaimState: requestCount === 1 ? null : "pending",
              claimerName: null,
              claimerUid: null,
            },
          ],
          total: 1,
          totalPage: 1,
        })
      )
    })

    const first = await getNamecardPage().send()
    const second = await getNamecardPage().send()

    expect(requestCount).toBe(2)
    expect(first.list[0]?.viewerClaimState).toBeNull()
    expect(second.list[0]?.viewerClaimState).toBe("pending")
  })
})

const collectionSnapshot = {
  producerName: "天海春香",
  producerReading: null,
  groupName: null,
  madeOn: null,
  bio: null,
  tradeNote: null,
  isOriginal: false,
  madeWithAi: false,
  exchangeMode: "manual" as const,
  accent: null,
  seriesCodes: ["765"],
  credits: [],
  sortNameKey: "amami haruka",
  sortNameBucket: 1,
  favoriteCharacterIds: [1],
}

function collectionPayload() {
  return {
    list: [
      {
        cardNumber: 42,
        obtainedAt: "2026-08-01T00:00:00.000Z",
        hiddenAt: null,
        available: true,
        own: false,
        card: makeNamecard({ id: 42, cardNumber: 42, cardId: "card-42" }),
        snapshot: collectionSnapshot,
      },
    ],
    total: 1,
    totalPage: 1,
  }
}

describe("getNamecardCollectionPage", () => {
  it("serialises every filter, including repeated keys, and normalises the cards", async () => {
    let requested: RequestDetails | undefined
    installFetchMock(async (...args) => {
      requested = requestDetails(args)
      return jsonResponse(collectionPayload())
    })

    const page = await getNamecardCollectionPage({
      page: 2,
      size: 24,
      sort: "name",
      q: " 春香 ",
      series: ["765", "cg"],
      group: "765PRO",
      character: [1, 2],
      match: "all",
      excludeOther: true,
      excludeCross: true,
      includeOwn: true,
      includeHidden: true,
    }).send()

    const url = new URL(requested!.url, "http://ims.test")
    expect(url.pathname).toBe("/api/community/exchange/me/collection")
    expect(url.searchParams.get("page")).toBe("2")
    expect(url.searchParams.get("size")).toBe("24")
    expect(url.searchParams.get("sort")).toBe("name")
    // 缺省方向跟着排序键：名称正序（PRD §3）。
    expect(url.searchParams.get("dir")).toBe("asc")
    expect(url.searchParams.get("q")).toBe("春香")
    expect(url.searchParams.getAll("series")).toEqual(["765", "cg"])
    expect(url.searchParams.getAll("character")).toEqual(["1", "2"])
    expect(url.searchParams.get("match")).toBe("all")
    expect(url.searchParams.get("excludeOther")).toBe("true")
    expect(url.searchParams.get("excludeCross")).toBe("true")
    expect(url.searchParams.get("includeOwn")).toBe("true")
    expect(url.searchParams.get("includeHidden")).toBe("true")
    expect(page.list[0]?.cardNumber).toBe(42)
  })

  it("omits every off switch from the query string", async () => {
    let requested: RequestDetails | undefined
    installFetchMock(async (...args) => {
      requested = requestDetails(args)
      return jsonResponse(collectionPayload())
    })

    await getNamecardCollectionPage().send()

    const url = new URL(requested!.url, "http://ims.test")
    expect(url.searchParams.get("sort")).toBe("exchange")
    expect(url.searchParams.get("dir")).toBe("desc")
    expect(url.searchParams.has("q")).toBe(false)
    expect(url.searchParams.has("series")).toBe(false)
    expect(url.searchParams.has("character")).toBe(false)
    expect(url.searchParams.has("includeOwn")).toBe(false)
    expect(url.searchParams.has("includeHidden")).toBe(false)
  })
})
