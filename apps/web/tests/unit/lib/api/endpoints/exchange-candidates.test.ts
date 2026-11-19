import { describe, expect, it } from "vitest"

import { getExchangeCandidates } from "~/lib/api/endpoints/fudaba"
import { CSRF_HEADER_NAME } from "~/lib/api/request"
import { makeCardPage } from "@/mocks/data/namecards"
import { installFetchMock } from "@/tests/unit/support/api-client"

/** 候选接口的最小合法响应：一张卡、没有目标视角字段。 */
function quickSettings(overrides: Record<string, unknown> = {}) {
  return {
    limit: 20,
    cards: [
      {
        cardNumber: 12,
        pages: [
          makeCardPage({
            role: "front",
            order: 1,
            url: "/uploads/namecard/original/12.webp",
          }),
        ],
        exchangeMode: "manual",
        selected: true,
      },
    ],
    ...overrides,
  }
}

describe("getExchangeCandidates", () => {
  it("reads the quick settings path without a target and without CSRF", async () => {
    const requests: Array<{ url: URL; init?: RequestInit }> = []
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: new URL(String(input), "http://ims.test"), init })
      return Response.json(quickSettings())
    })

    const response = await getExchangeCandidates().send()

    expect(requests[0]?.url.pathname).toBe("/api/community/exchange/me/quick")
    expect(requests[0]?.url.search).toBe("")
    expect(
      new Headers(requests[0]?.init?.headers).get(CSRF_HEADER_NAME)
    ).toBeNull()
    expect(response).toEqual({
      limit: 20,
      cards: [
        {
          cardNumber: 12,
          pages: [
            {
              pageId: "page-1",
              role: "front",
              order: 1,
              url: "/uploads/namecard/original/12.webp",
              previewUrl: "/uploads/namecard/original/12.webp",
              thumbUrl: "/uploads/namecard/original/12.webp",
              width: 900,
              height: 500,
            },
          ],
          exchangeMode: "manual",
          selected: true,
        },
      ],
    })
  })

  it("encodes the target as a query parameter", async () => {
    let requested: URL | undefined
    installFetchMock(async (input: RequestInfo | URL) => {
      requested = new URL(String(input), "http://ims.test")
      return Response.json(quickSettings())
    })

    await getExchangeCandidates({ target: "春香 P/slug" }).send()

    expect(requested?.pathname).toBe("/api/community/exchange/me/quick")
    expect(requested?.searchParams.get("target")).toBe("春香 P/slug")
  })

  it("passes the target card number instead of the handle when the wall has only the card", async () => {
    let requested: URL | undefined
    installFetchMock(async (input: RequestInfo | URL) => {
      requested = new URL(String(input), "http://ims.test")
      return Response.json(quickSettings())
    })

    await getExchangeCandidates({ targetCard: 786 }).send()

    expect(requested?.pathname).toBe("/api/community/exchange/me/quick")
    expect(requested?.searchParams.get("targetCard")).toBe("786")
    expect(requested?.searchParams.has("target")).toBe(false)
  })

  it("carries the target view when the API answers with it", async () => {
    installFetchMock(async () =>
      Response.json(
        quickSettings({
          cards: [
            {
              cardNumber: 12,
              pages: [],
              exchangeMode: "none",
              selected: false,
              targetOwns: true,
            },
          ],
          targetMissingCount: 3,
        })
      )
    )

    const response = await getExchangeCandidates({ target: "u1" }).send()

    expect(response.cards[0]).toMatchObject({
      cardNumber: 12,
      targetOwns: true,
      selected: false,
    })
    expect(response.targetMissingCount).toBe(3)
  })
})
