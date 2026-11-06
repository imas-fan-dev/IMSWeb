import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { getNamecardPage, namecardSchema } from "~/lib/api/endpoints/community"

describe("community API contracts", () => {
  it("rejects numeric string card IDs instead of coercing wire data", () => {
    expect(() =>
      namecardSchema.parse({
        id: "12",
        image1_url: "/uploads/front.webp",
        image2_url: "/uploads/back.webp",
        image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
        image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
        status: "approved",
        created_at: null,
      })
    ).toThrow()
  })

  it("rejects incomplete card media", () => {
    expect(() =>
      namecardSchema.parse({
        id: 1,
        image1_url: "/uploads/front.webp",
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
              middleImageUrls: [],
              canEdit: false,
              hasOwner: false,
              seriesCode: null,
              favoriteCharacters: [],
              image1_url: "/uploads/front.webp",
              image2_url: "/uploads/back.webp",
              image1_thumbnail_url:
                "/uploads/namecard/thumbnail/front.webp.jpg",
              image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
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
