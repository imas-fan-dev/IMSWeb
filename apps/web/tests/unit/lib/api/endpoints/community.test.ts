import { afterEach, describe, expect, it, vi } from "vitest"

import { getNamecardPage, namecardSchema } from "~/lib/api/endpoints/community"
import {
  getFudabaGuestSubmission,
  getFudabaGuestSubmissionMedia,
  uploadFudabaGuestSubmission,
  withdrawFudabaGuestSubmission,
} from "~/lib/api/endpoints/fudaba/guest-submissions"

describe("community API contracts", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("normalizes numeric string card IDs", () => {
    expect(
      namecardSchema.parse({
        id: "12",
        image1_url: "/uploads/front.webp",
        image2_url: "/uploads/back.webp",
        image1_thumbnail_url: "/uploads/namecard/thumbnail/front.webp.jpg",
        image2_thumbnail_url: "/uploads/namecard/thumbnail/back.webp.jpg",
        status: "approved",
        created_at: null,
      }).id
    ).toBe(12)
  })

  it("rejects incomplete card media", () => {
    expect(() =>
      namecardSchema.parse({
        id: 1,
        image1_url: "/uploads/front.webp",
      })
    ).toThrow()
  })

  it("sends only the descriptive fields a guest filled in", async () => {
    const requests: Array<{
      input: RequestInfo | URL
      init: RequestInit | undefined
    }> = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init })
      return Promise.resolve(
        Response.json({
          success: true,
          message: "已提交审核",
          submission: {
            id: 20,
            publicationStatus: "pending",
            revision: 0,
          },
          withdrawalToken: "b".repeat(64),
        })
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    await uploadFudabaGuestSubmission(
      new File(["front"], "front.png", { type: "image/png" }),
      new File(["back"], "back.png", { type: "image/png" }),
      {
        seriesCode: "765",
        favoriteIdolIds: [1],
        producerName: "  草莓P  ",
        displayName: "",
        bio: "   ",
      }
    ).send()

    const request = requests[0]
    if (!request) throw new Error("Expected the request to be captured")
    const body = request.init?.body
    expect(body).toBeInstanceOf(FormData)
    if (!(body instanceof FormData))
      throw new Error("Expected a multipart body")
    expect(String(request.input)).toContain(
      "/api/community/exchange/guest-submissions"
    )
    expect(body.get("producerName")).toBe("草莓P")
    expect(body.has("displayName")).toBe(false)
    expect(body.has("bio")).toBe(false)
  })

  it("parses the one-time withdrawal receipt returned after upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            success: true,
            message: "已提交审核",
            submission: {
              id: 19,
              publicationStatus: "pending",
              revision: 0,
            },
            withdrawalToken: "a".repeat(64),
          })
        )
      )
    )

    await expect(
      uploadFudabaGuestSubmission(
        new File(["front"], "front.png", { type: "image/png" }),
        new File(["back"], "back.png", { type: "image/png" }),
        { seriesCode: "765", favoriteIdolIds: [1, 2] }
      ).send()
    ).resolves.toMatchObject({
      submission: {
        id: 19,
        publicationStatus: "pending",
        revision: 0,
      },
      withdrawalToken: "a".repeat(64),
    })
  })

  it("does not cache viewer-specific claim state across sessions", async () => {
    let requestCount = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        requestCount += 1
        return Promise.resolve(
          Response.json({
            list: [
              {
                id: 42,
                image1_url: "/uploads/front.webp",
                image2_url: "/uploads/back.webp",
                image1_thumbnail_url:
                  "/uploads/namecard/thumbnail/front.webp.jpg",
                image2_thumbnail_url:
                  "/uploads/namecard/thumbnail/back.webp.jpg",
                claimStatus: requestCount === 1 ? "unclaimed" : "pending",
                viewerClaimState: requestCount === 1 ? null : "pending",
              },
            ],
            total: 1,
            totalPage: 1,
          })
        )
      })
    )

    const first = await getNamecardPage().send()
    const second = await getNamecardPage().send()

    expect(requestCount).toBe(2)
    expect(first.list[0]?.viewerClaimState).toBeNull()
    expect(second.list[0]?.viewerClaimState).toBe("pending")
  })

  it("uses the Fudaba receipt header and camelCase withdrawal body", async () => {
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        requests.push(request)
        const submission = {
          id: 19,
          seriesCode: null,
          favoriteIdols: [],
          frontImageUrl: "/protected/front.webp",
          backImageUrl: "/protected/back.webp",
          publicationStatus: request.method === "GET" ? "pending" : "withdrawn",
          createdAt: "2026-08-11T02:00:00.000Z",
          revision: request.method === "GET" ? 2 : 3,
        }
        return Promise.resolve(Response.json({ success: true, submission }))
      })
    )

    await getFudabaGuestSubmission(19, "private-receipt-token").send()
    await withdrawFudabaGuestSubmission(19, "private-receipt-token", 2).send()
    await getFudabaGuestSubmissionMedia(
      19,
      "front",
      "private-receipt-token"
    ).send()

    expect(requests).toHaveLength(3)
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/community/exchange/guest-submissions/19",
      "/api/community/exchange/guest-submissions/19/withdraw",
      "/api/community/exchange/guest-submissions/19/media/front",
    ])
    for (const request of requests) {
      expect(request.headers.get("X-Fudaba-Guest-Submission-Token")).toBe(
        "private-receipt-token"
      )
      expect(request.url).not.toContain("private-receipt-token")
    }
    await expect(requests[1]?.json()).resolves.toEqual({
      expectedRevision: 2,
    })
  })
})
