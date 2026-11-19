import { afterEach, describe, expect, it } from "vitest"

import {
  commitScanSession,
  createScanSession,
  getScanSession,
} from "~/lib/api/endpoints/fudaba"
import { CSRF_HEADER_NAME } from "~/lib/api/request"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { installFetchMock } from "@/tests/unit/support/api-client"

const TOKEN = "b".repeat(64)
const EXPIRES_AT = "2026-11-19T12:00:00.000Z"

function requestOf(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://localhost"), init)
}

afterEach(() => {
  clearCsrfCookie("platform")
})

describe("namecard scan session", () => {
  it("registers the selected cards and returns the QR token", async () => {
    setCsrfCookie("platform", "platform-exchange-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({ token: TOKEN, expiresAt: EXPIRES_AT })
    })

    await expect(createScanSession([3, 5]).send()).resolves.toEqual({
      token: TOKEN,
      expiresAt: EXPIRES_AT,
    })

    expect(request!.method).toBe("POST")
    expect(new URL(request!.url).pathname).toBe(
      "/api/community/exchange/scan/sessions"
    )
    expect(request!.headers.get(CSRF_HEADER_NAME)).toBe(
      "platform-exchange-csrf"
    )
    await expect(request!.json()).resolves.toEqual({ cardNumbers: [3, 5] })
  })

  it("commits the scanned token with the picked cards and CSRF", async () => {
    setCsrfCookie("platform", "platform-exchange-csrf")
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({
        exchangeId: "exchange-1",
        status: "completed",
        targetCardNumbers: [9],
        initiatorCardNumbers: [3, 5],
        skipped: [],
        targetMissingCount: 0,
      })
    })

    await expect(
      commitScanSession(TOKEN, {
        clientExchangeId: "client-exchange-1",
        giveCardNumbers: [3, 5],
      }).send()
    ).resolves.toMatchObject({ exchangeId: "exchange-1" })

    expect(request!.method).toBe("POST")
    expect(new URL(request!.url).pathname).toBe(
      `/api/community/exchange/scan/sessions/${TOKEN}/commit`
    )
    expect(request!.headers.get(CSRF_HEADER_NAME)).toBe(
      "platform-exchange-csrf"
    )
    await expect(request!.json()).resolves.toEqual({
      clientExchangeId: "client-exchange-1",
      giveCardNumbers: [3, 5],
    })
  })

  it("polls the creator-scoped status path without CSRF", async () => {
    let request: Request | null = null
    installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = requestOf(input, init)
      return Response.json({
        status: "active",
        expiresAt: EXPIRES_AT,
        exchangeId: null,
      })
    })

    await expect(getScanSession(TOKEN).send()).resolves.toEqual({
      status: "active",
      expiresAt: EXPIRES_AT,
      exchangeId: null,
    })

    expect(request!.method).toBe("GET")
    expect(new URL(request!.url).pathname).toBe(
      `/api/community/exchange/scan/sessions/${TOKEN}`
    )
    expect(request!.headers.get(CSRF_HEADER_NAME)).toBeNull()
  })
})
