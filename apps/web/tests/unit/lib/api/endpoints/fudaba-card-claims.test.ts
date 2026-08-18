import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createFudabaLegacyCardClaim,
  getAdminFudabaCardClaims,
  getAdminFudabaCardReviews,
  getFudabaClaimEnvelopes,
  respondFudabaClaimEnvelope,
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
  favoriteIdols: [idol],
  state: "pending",
  message: "旧活动现场交换",
  reviewNote: "",
  revision: 0,
  createdAt: "2026-08-16T10:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
  reviewedAt: null,
}
const envelope = {
  id: "envelope-1",
  legacyCardId: 42,
  cardId: "42",
  kind: "legacy-card-match",
  title: "这是你的历史名片吗？",
  body: "系统发现了同 ID 的历史名片。",
  actionState: "pending",
  claimId: null,
  revision: 0,
  readAt: null,
  actedAt: null,
  createdAt: "2026-08-16T10:00:00.000Z",
}
const ownerCard = {
  id: "registered-1",
  producerName: "春香P",
  displayName: "注册名片",
  seriesCode: "765",
  favoriteIdol: "天海春香",
  favoriteIdols: [idol],
  frontImageUrl: "/front.webp",
  backImageUrl: "/back.webp",
  accent: "#f34e6c",
  bio: "",
  tradeNote: "",
  available: true,
  mediaRightsStatus: "unknown",
  publicationStatus: "pending",
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
  vi.unstubAllGlobals()
  document.cookie = "ims_platform_csrf=; Max-Age=0; path=/"
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("Fudaba card claim API", () => {
  it("lists and confirms same-ID claim envelopes with Platform CSRF", async () => {
    document.cookie = "ims_platform_csrf=platform-claim-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = requestOf(input, init)
        requests.push(request)
        if (request.method === "GET") {
          return Response.json({ items: [envelope] })
        }
        return Response.json({
          success: true,
          envelope: {
            ...envelope,
            actionState: "confirmed",
            claimId: claim.id,
            revision: 1,
            actedAt: "2026-08-16T10:05:00.000Z",
          },
          claim,
        })
      })
    )

    await expect(getFudabaClaimEnvelopes().send()).resolves.toMatchObject({
      items: [{ legacyCardId: 42, actionState: "pending" }],
    })
    await expect(
      respondFudabaClaimEnvelope("envelope-1", "confirm", 0).send()
    ).resolves.toMatchObject({ claim: { id: "claim-1" } })

    expect(requests[1]?.url).toContain(
      "/api/community/exchange/me/claim-envelopes/envelope-1"
    )
    expect(requests[1]?.headers.get(CSRF_HEADER_NAME)).toBe(
      "platform-claim-csrf"
    )
    await expect(requests[1]?.json()).resolves.toEqual({
      decision: "confirm",
      expectedRevision: 0,
    })
  })

  it("submits an old-card claim with ordered idol IDs", async () => {
    document.cookie = "ims_platform_csrf=platform-claim-csrf; path=/"
    let request: Request | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        request = requestOf(input, init)
        return Response.json({ success: true, claim })
      })
    )

    await expect(
      createFudabaLegacyCardClaim(42, {
        targetCardId: null,
        seriesCode: "765",
        favoriteIdolIds: [1, 2],
        message: "旧活动现场交换",
      }).send()
    ).resolves.toMatchObject({ claim: { legacyCardId: 42 } })

    expect(request!.url).toContain(
      "/api/community/exchange/legacy-cards/42/claims"
    )
    await expect(request!.json()).resolves.toEqual({
      targetCardId: null,
      seriesCode: "765",
      favoriteIdolIds: [1, 2],
      message: "旧活动现场交换",
    })
  })

  it("parses admin card and claim queues and sends revisioned reviews", async () => {
    document.cookie = "ims_admin_csrf=admin-claim-csrf; path=/"
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
                claimant: { id: "owner-1", displayName: "春香P" },
                legacyCard: {
                  id: 42,
                  frontImageUrl: "/legacy-front.webp",
                  backImageUrl: "/legacy-back.webp",
                },
              },
            ],
          })
        }
        return Response.json({ success: true, revision: 3 })
      })
    )

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
