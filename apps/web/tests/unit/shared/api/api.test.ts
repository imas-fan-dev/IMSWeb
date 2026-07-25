import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError, normalizeRequestError } from "~/shared/api/api-error"
import { apiClient } from "~/shared/api/client"
import { readCookie } from "~/shared/api/cookies"
import { getAdminSession, loginAdmin } from "~/shared/api/endpoints/admin"
import { applyApiRequestPolicy, CSRF_HEADER_NAME } from "~/shared/api/request"
import { handleApiResponse } from "~/shared/api/response"
import { withCsrf } from "~/shared/api/types"

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "csrf_token=; Max-Age=0; path=/"
})

describe("API request policy", () => {
  it("decodes cookie values without truncating embedded equals signs", () => {
    expect(
      readCookie("csrf_token", "theme=dark; csrf_token=a%2Fb%3D%3D; other=1")
    ).toBe("a/b==")
  })

  it("uses the current CSRF cookie and enforces same-origin credentials", () => {
    const request = {
      config: {
        credentials: "omit" as RequestCredentials,
        headers: { "x-csrftoken": "stale", Accept: "application/json" },
      },
      meta: withCsrf(),
      type: "POST",
      url: "/api/admin/news",
    }

    applyApiRequestPolicy(request, "csrf_token=fresh-token")

    expect(request.config.credentials).toBe("same-origin")
    expect(request.config.headers).toEqual({
      Accept: "application/json",
      [CSRF_HEADER_NAME]: "fresh-token",
    })
  })

  it("fails before sending a protected request when the CSRF cookie is missing", () => {
    const applyWithoutToken = () =>
      applyApiRequestPolicy(
        {
          config: { headers: {} },
          meta: withCsrf(),
          type: "DELETE",
          url: "/api/admin/cards/1",
        },
        "theme=dark"
      )

    expect(applyWithoutToken).toThrowError(ApiError)
    expect(applyWithoutToken).toThrowError(
      expect.objectContaining({
        kind: "csrf",
        code: "CSRF_TOKEN_MISSING",
      })
    )
  })
})

describe("API response policy", () => {
  it("parses JSON responses", async () => {
    const response = Response.json({ success: true, user: { dept: "op" } })

    await expect(handleApiResponse(response)).resolves.toEqual({
      success: true,
      user: { dept: "op" },
    })
  })

  it("normalizes a non-2xx Hono payload into an HTTP ApiError", async () => {
    const response = Response.json({ error: "活动不存在" }, { status: 404 })

    await expect(
      handleApiResponse(response, { method: "GET", url: "/api/events/7" })
    ).rejects.toMatchObject({
      name: "ApiError",
      kind: "http",
      status: 404,
      code: "HTTP_404",
      message: "活动不存在",
      payload: { error: "活动不存在" },
    })
  })

  it("normalizes an HTTP 200 business failure", async () => {
    const response = Response.json({ success: false, msg: "数据库错误" })

    await expect(handleApiResponse(response)).rejects.toMatchObject({
      kind: "business",
      status: 200,
      code: "BUSINESS_ERROR",
      message: "数据库错误",
    })
  })

  it("allows an explicitly opted-out failure-shaped payload", async () => {
    const payload = { status: "error", msg: "上游结果" }
    const response = Response.json(payload)

    await expect(
      handleApiResponse(response, { meta: { skipBusinessErrorCheck: true } })
    ).resolves.toEqual(payload)
  })

  it("reports malformed JSON as a parse error", async () => {
    const response = new Response("{not-json", {
      headers: { "content-type": "application/json" },
    })

    await expect(handleApiResponse(response)).rejects.toMatchObject({
      kind: "parse",
      code: "RESPONSE_PARSE_ERROR",
    })
  })

  it("keeps non-JSON successful responses as text", async () => {
    const response = new Response("ok", {
      headers: { "content-type": "text/plain" },
    })

    await expect(handleApiResponse(response)).resolves.toBe("ok")
  })
})

describe("network errors", () => {
  it("preserves request cancellation as a distinct error kind", () => {
    expect(
      normalizeRequestError(new DOMException("aborted", "AbortError"), {
        method: "GET",
        url: "/api/news",
      })
    ).toMatchObject({
      kind: "aborted",
      code: "REQUEST_ABORTED",
      method: "GET",
      url: "/api/news",
    })
  })
})

describe("Alova access-token refresh", () => {
  it("uses the role-gated admin endpoint without refreshing a failed login", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input), "http://ims.test").pathname).toBe(
        "/api/admin/login"
      )
      return Response.json(
        {
          success: false,
          message: "用户名或密码错误",
        },
        { status: 401 }
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(loginAdmin("reader", "password").send()).rejects.toMatchObject(
      {
        kind: "http",
        status: 401,
        message: "用户名或密码错误",
      }
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("coalesces concurrent 401 responses and replays both requests", async () => {
    document.cookie = "csrf_token=alova-refresh-csrf; path=/"
    let checkRequests = 0
    let refreshRequests = 0
    let refreshHeaders: Headers | undefined
    let releaseInitialChecks!: () => void
    const initialChecksReady = new Promise<void>((resolve) => {
      releaseInitialChecks = resolve
    })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), "http://ims.test").pathname
        if (pathname === "/api/refresh") {
          refreshRequests += 1
          refreshHeaders = new Headers(init?.headers)
          return Response.json({ success: true })
        }
        if (pathname === "/api/check") {
          checkRequests += 1
          if (checkRequests <= 2) {
            if (checkRequests === 2) releaseInitialChecks()
            await initialChecksReady
            return Response.json(
              { success: false, message: "token无效" },
              { status: 401 }
            )
          }
          return Response.json({
            success: true,
            user: {
              id: 1,
              username: "alova-op",
              producername: "Alova Producer",
              dept: "op",
            },
          })
        }
        throw new Error(`Unexpected request: ${pathname}`)
      })
    )

    const [first, second] = await Promise.all([
      getAdminSession().send(),
      apiClient
        .Get<{
          success: true
          user: { username: string }
        }>("/api/check?request=second")
        .send(),
    ])

    expect(first.user.username).toBe("alova-op")
    expect(second.user.username).toBe("alova-op")
    expect(refreshRequests).toBe(1)
    expect(checkRequests).toBe(4)
    expect(refreshHeaders?.get("X-CSRFToken")).toBe("alova-refresh-csrf")
  })
})
