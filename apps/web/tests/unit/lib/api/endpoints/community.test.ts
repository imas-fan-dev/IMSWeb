import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getNamecardSubmission,
  namecardSchema,
  uploadNamecard,
  withdrawNamecardSubmission,
} from "~/lib/api/endpoints/community"

describe("community API contracts", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("normalizes numeric string card IDs", () => {
    expect(
      namecardSchema.parse({
        id: "12",
        image1_url: "/uploads/front.webp",
        image2_url: "/uploads/back.webp",
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

  it("parses the one-time withdrawal receipt returned after upload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            msg: "已提交审核",
            submission: { id: 19, status: "pending", revision: 0 },
            withdrawalToken: "a".repeat(43),
          })
        )
      )
    )

    await expect(
      uploadNamecard(
        new File(["front"], "front.png", { type: "image/png" }),
        new File(["back"], "back.png", { type: "image/png" })
      ).send()
    ).resolves.toMatchObject({
      submission: { id: 19, status: "pending", revision: 0 },
      withdrawalToken: "a".repeat(43),
    })
  })

  it("keeps the withdrawal token in a header for status and mutation", async () => {
    const requests: Request[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(String(input), "http://localhost"), init)
        requests.push(request)
        return Promise.resolve(
          request.method === "GET"
            ? Response.json({
                submission: { id: 19, status: "pending", revision: 2 },
              })
            : Response.json({
                success: true,
                submission: { id: 19, status: "withdrawn", revision: 3 },
              })
        )
      })
    )

    await getNamecardSubmission(19, "private-receipt-token").send()
    await withdrawNamecardSubmission(19, "private-receipt-token", 2).send()

    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.headers.get("X-Namecard-Withdrawal-Token")).toBe(
        "private-receipt-token"
      )
      expect(request.url).not.toContain("private-receipt-token")
    }
    await expect(requests[1]?.json()).resolves.toEqual({
      expected_revision: 2,
    })
  })
})
