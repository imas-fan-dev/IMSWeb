import { afterEach, describe, expect, it } from "vitest"

import {
  commitCardShare,
  commitQuickExchange,
  requestCardExchange,
} from "~/lib/api/endpoints/fudaba"
import { CSRF_HEADER_NAME } from "~/lib/api/request"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { installFetchMock } from "@/tests/unit/support/api-client"

/** 交换结果的最小合法响应（`namecardExchangeResultSchema`）。 */
function exchangeResult(overrides: Record<string, unknown> = {}) {
  return {
    exchangeId: "exchange-1",
    status: "completed",
    targetCardNumbers: [101],
    initiatorCardNumbers: [7],
    skipped: [],
    targetMissingCount: 2,
    ...overrides,
  }
}

function requestOf(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://localhost"), init)
}

const CLIENT_EXCHANGE_ID = "6b1f0f9c-3d0e-4a4b-9d6a-1f2c3b4a5d6e"

afterEach(() => {
  clearCsrfCookie("platform")
})

describe("namecard exchange writes", () => {
  it("requests one wall card with the round id and the given cards", async () => {
    setCsrfCookie("platform", "platform-exchange-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json(exchangeResult())
    })

    await expect(
      requestCardExchange(101, {
        clientExchangeId: CLIENT_EXCHANGE_ID,
        giveCardNumbers: [7, 8],
      }).send()
    ).resolves.toMatchObject({ exchangeId: "exchange-1", status: "completed" })

    expect(request!.method).toBe("POST")
    expect(new URL(request!.url).pathname).toBe(
      "/api/community/exchange/cards/101/request"
    )
    expect(request!.headers.get(CSRF_HEADER_NAME)).toBe(
      "platform-exchange-csrf"
    )
    await expect(request!.json()).resolves.toEqual({
      clientExchangeId: CLIENT_EXCHANGE_ID,
      giveCardNumbers: [7, 8],
    })
  })

  it("commits a single-card share through the slug path", async () => {
    setCsrfCookie("platform", "platform-exchange-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json(exchangeResult({ status: "pending" }))
    })

    await expect(
      commitCardShare("abcdef ghijkl", {
        clientExchangeId: CLIENT_EXCHANGE_ID,
        giveCardNumbers: [],
      }).send()
    ).resolves.toMatchObject({ status: "pending" })

    expect(request!.method).toBe("POST")
    // slug 里可能有空格，路径必须编码。
    expect(new URL(request!.url).pathname).toBe(
      "/api/community/exchange/card/abcdef%20ghijkl/commit"
    )
    await expect(request!.json()).resolves.toEqual({
      clientExchangeId: CLIENT_EXCHANGE_ID,
      giveCardNumbers: [],
    })
  })

  it("commits a quick list through the handle path", async () => {
    setCsrfCookie("platform", "platform-exchange-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json(
        exchangeResult({
          status: "declined",
          skipped: [
            { cardNumber: 7, side: "initiator", reason: "owned-by-target" },
          ],
        })
      )
    })

    await expect(
      commitQuickExchange("haruka", {
        clientExchangeId: CLIENT_EXCHANGE_ID,
        giveCardNumbers: [7],
      }).send()
    ).resolves.toMatchObject({ status: "declined" })

    expect(request!.method).toBe("POST")
    expect(new URL(request!.url).pathname).toBe(
      "/api/community/exchange/quick/haruka/commit"
    )
    await expect(request!.json()).resolves.toEqual({
      clientExchangeId: CLIENT_EXCHANGE_ID,
      giveCardNumbers: [7],
    })
  })

  it("rejects a round id shorter than the contract minimum before sending", () => {
    const fetchMock = installFetchMock(async () =>
      Response.json(exchangeResult())
    )

    expect(() =>
      commitCardShare("abcdefghijkl", {
        clientExchangeId: "short",
        giveCardNumbers: [7],
      })
    ).toThrow()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
