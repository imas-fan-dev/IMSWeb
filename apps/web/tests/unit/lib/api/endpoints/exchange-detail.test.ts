import { afterEach, describe, expect, it } from "vitest"

import {
  acceptExchange,
  declineExchange,
  getExchangeDetail,
} from "~/lib/api/endpoints/community"
import { isApiError } from "~/lib/api/api-error"
import { CSRF_HEADER_NAME } from "~/lib/api/request"
import { makeNamecard } from "@/mocks/data/namecards"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  installFetchMock,
  jsonResponse,
  requestDetails,
  type RequestDetails,
} from "@/tests/unit/support/api-client"

/** 详情接口的合法响应：两侧各一张卡，卡片与分享页同形。 */
function exchangeDetailPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    status: "pending",
    source: "card-request",
    createdAt: "2026-11-18T02:03:04.000Z",
    expiresAt: "2026-11-25T02:03:04.000Z",
    initiator: { accountId: "u1", displayName: "天海春香" },
    target: { accountId: "u2", displayName: "如月千早" },
    targetCards: [makeNamecard({ cardId: "card-11", cardNumber: 11 })],
    initiatorCards: [makeNamecard({ cardId: "card-22", cardNumber: 22 })],
    skipped: [],
    ...overrides,
  }
}

describe("getExchangeDetail", () => {
  it("reads the exchange detail path without CSRF and keeps both card sides", async () => {
    let requested: RequestDetails | undefined
    installFetchMock(async (...args) => {
      requested = requestDetails(args)
      return jsonResponse(exchangeDetailPayload())
    })

    const detail = await getExchangeDetail("ex/1").send()

    expect(requested?.method).toBe("GET")
    expect(new URL(requested!.url, "http://ims.test").pathname).toBe(
      "/api/community/exchange/exchanges/ex%2F1"
    )
    expect(requested?.headers.get(CSRF_HEADER_NAME)).toBeNull()
    expect(detail.initiator.displayName).toBe("天海春香")
    expect(detail.targetCards.map((card) => card.cardNumber)).toEqual([11])
    expect(detail.initiatorCards.map((card) => card.cardNumber)).toEqual([22])
    expect(detail.targetCards[0]?.pages?.[0]?.thumbUrl).toBe(
      "/uploads/namecard/original/abc.webp"
    )
    expect(detail.expiresAt).toBe("2026-11-25T02:03:04.000Z")
  })
})

describe("exchange decisions", () => {
  afterEach(() => {
    clearCsrfCookie("platform")
  })

  it("accepts through the accept path with the platform CSRF token", async () => {
    setCsrfCookie("platform", "platform-token")
    let requested: RequestDetails | undefined
    installFetchMock(async (...args) => {
      requested = requestDetails(args)
      return jsonResponse({ success: true, status: "completed" })
    })

    const result = await acceptExchange("ex-1").send()

    expect(requested?.method).toBe("POST")
    expect(new URL(requested!.url, "http://ims.test").pathname).toBe(
      "/api/community/exchange/exchanges/ex-1/accept"
    )
    expect(requested?.headers.get(CSRF_HEADER_NAME)).toBe("platform-token")
    expect(result).toEqual({ success: true, status: "completed" })
  })

  it("declines through the decline path", async () => {
    setCsrfCookie("platform", "platform-token")
    let requested: RequestDetails | undefined
    installFetchMock(async (...args) => {
      requested = requestDetails(args)
      return jsonResponse({ success: true, status: "declined" })
    })

    const result = await declineExchange("ex-1").send()

    expect(new URL(requested!.url, "http://ims.test").pathname).toBe(
      "/api/community/exchange/exchanges/ex-1/decline"
    )
    expect(result).toEqual({ success: true, status: "declined" })
  })

  it("surfaces a 409 when the exchange already expired", async () => {
    setCsrfCookie("platform", "platform-token")
    installFetchMock(async () =>
      jsonResponse({ error: "这条交换请求已过期，对方需要重新发起" }, 409)
    )

    const failure = await acceptExchange("ex-1")
      .send()
      .catch((error: unknown) => error)

    expect(isApiError(failure) && failure.status).toBe(409)
  })
})
