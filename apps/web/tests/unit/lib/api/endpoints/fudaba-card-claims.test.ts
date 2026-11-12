import { afterEach, describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  createFudabaLegacyCardClaim,
  getAdminFudabaCardClaims,
  createFudabaCardSupplement,
  getAdminFudabaCardReviews,
  reviewAdminFudabaCard,
  reviewAdminFudabaCardClaim,
} from "~/lib/api/endpoints/fudaba/card-claims"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const idol = { id: 1, name: "天海春香", seriesCode: "765" }
const claim = {
  id: "claim-1",
  legacyCardId: 42,
  targetCardId: null,
  seriesCode: "765",
  payload: { seriesCodes: ["765"], favoriteCharacterIds: [1] },
  favoriteCharacters: [idol],
  state: "pending",
  message: "旧活动现场交换",
  reviewNote: "",
  revision: 0,
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
  reviewedAt: null,
}
const supplement = {
  id: "supplement-1",
  cardId: "card-1",
  state: "pending",
  payload: { producerName: "新しい名前" },
  submitter: { id: "acct-1", displayName: "补充者" },
  reviewNote: "",
  revision: 0,
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
  reviewedAt: null,
}
const ownerCard = {
  id: "registered-1",
  cardNumber: 1,
  producerName: "春香P",
  seriesCodes: ["765"],
  favoriteCharacters: [idol],
  frontImageUrl: "/front.webp",
  backImageUrl: "/back.webp",
  accent: "#f34e6c",
  bio: "",
  tradeNote: "",
  exchangeMode: "manual",
  madeOn: null,
  groupName: null,
  isGroupCard: false,
  producerReading: null,
  isOriginal: false,
  madeWithAi: false,
  visible: true,
  credits: [],
  publicationStatus: "pending",
  reviewStatus: null,
  reviewReason: null,
  reviewSubmittedAt: null,
  pendingContent: null,
  revision: 2,
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
}

function requestOf(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://localhost"), init)
}

afterEach(() => {
  clearCsrfCookie("platform")
  clearCsrfCookie("backoffice")
})

describe("Fudaba card claim API", () => {
  it("submits a wall supplement with Platform CSRF", async () => {
    setCsrfCookie("platform", "platform-claim-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({ success: true, supplement })
    })

    await expect(
      createFudabaCardSupplement("card-1", {
        producerName: "新しい名前",
        seriesCodes: ["765", "ml"],
      }).send()
    ).resolves.toMatchObject({ supplement: { id: "supplement-1" } })

    expect(request!.url).toContain(
      "/api/community/exchange/cards/card-1/supplements"
    )
    expect(request!.headers.get(CSRF_HEADER_NAME)).toBe("platform-claim-csrf")
    await expect(request!.json()).resolves.toEqual({
      producerName: "新しい名前",
      seriesCodes: ["765", "ml"],
    })
  })

  it("submits an old-card claim with ordered idol IDs", async () => {
    setCsrfCookie("platform", "platform-claim-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({ success: true, claim })
    })

    await expect(
      createFudabaLegacyCardClaim(42, {
        targetCardId: null,
        payload: { seriesCodes: ["765"], favoriteCharacterIds: [1, 2] },
        message: "旧活动现场交换",
      }).send()
    ).resolves.toMatchObject({ claim: { legacyCardId: 42 } })

    expect(request!.url).toContain(
      "/api/community/exchange/legacy-cards/42/claims"
    )
    await expect(request!.json()).resolves.toEqual({
      targetCardId: null,
      payload: { seriesCodes: ["765"], favoriteCharacterIds: [1, 2] },
      message: "旧活动现场交换",
    })
  })

  it("accepts a claim that leaves 企划 and 担当角色 unset", async () => {
    setCsrfCookie("platform", "platform-claim-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({ success: true, claim })
    })

    await expect(
      createFudabaLegacyCardClaim(42, {
        targetCardId: null,
        payload: { producerName: "制作人" },
        message: "",
      }).send()
    ).resolves.toMatchObject({ claim: { legacyCardId: 42 } })

    await expect(request!.json()).resolves.toEqual({
      targetCardId: null,
      payload: { producerName: "制作人" },
      message: "",
    })
  })

  it("validates exact Backoffice errors on the admin review queue", async () => {
    installFetchMock()
      .mockResolvedValueOnce(
        Response.json({ message: "无权限（仅op可访问）" }, { status: 403 })
      )
      .mockResolvedValueOnce(
        Response.json(
          { message: "无权限（仅op可访问）", unexpected: true },
          { status: 403 }
        )
      )

    await expect(getAdminFudabaCardReviews().send()).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: { message: "无权限（仅op可访问）" },
    })
    await expect(getAdminFudabaCardReviews().send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 403,
    })
  })

  it("parses admin card and claim queues and sends revisioned reviews", async () => {
    setCsrfCookie("backoffice", "admin-claim-csrf")
    const requests: Request[] = []
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = requestOf(input, init)
      requests.push(request)
      const pathname = new URL(request.url).pathname
      if (request.method === "GET" && pathname.endsWith("card-reviews")) {
        return Response.json({
          items: [
            {
              card: ownerCard,
              owner: { id: "owner-1", displayName: "春香P" },
            },
          ],
        })
      }
      if (request.method === "GET") {
        return Response.json({
          items: [
            {
              ...claim,
              targetCardNumber: null,
              claimant: { id: "owner-1", displayName: "春香P" },
              legacyCard: {
                id: 42,
                pages: [
                  {
                    pageId: "page-front",
                    role: "front",
                    order: 1,
                    url: "/legacy-front.webp",
                    previewUrl: "/legacy-front.webp",
                    thumbUrl: "/legacy-front.webp",
                    width: 960,
                    height: 640,
                  },
                  {
                    pageId: "page-back",
                    role: "back",
                    order: 2,
                    url: "/legacy-back.webp",
                    previewUrl: "/legacy-back.webp",
                    thumbUrl: "/legacy-back.webp",
                    width: 960,
                    height: 640,
                  },
                ],
              },
            },
          ],
        })
      }
      return Response.json({ success: true, revision: 3 })
    })

    await expect(getAdminFudabaCardReviews().send()).resolves.toMatchObject({
      items: [{ card: { id: "registered-1" } }],
    })
    await expect(getAdminFudabaCardClaims().send()).resolves.toMatchObject({
      items: [{ legacyCardId: 42 }],
    })
    await reviewAdminFudabaCard("registered-1", {
      decision: "approve",
      expectedRevision: 2,
      note: "",
    }).send()
    await reviewAdminFudabaCardClaim("claim-1", {
      decision: "reject",
      expectedRevision: 0,
      note: "无法确认归属",
    }).send()

    for (const request of requests.slice(2)) {
      expect(request.headers.get(CSRF_HEADER_NAME)).toBe("admin-claim-csrf")
    }
  })
})
