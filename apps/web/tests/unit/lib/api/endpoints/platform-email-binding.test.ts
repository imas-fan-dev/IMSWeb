import { afterEach, describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  bindPlatformEmail,
  changePlatformEmail,
  getPlatformEmailCredential,
  platformOAuthLinkStartUrl,
  sendPlatformEmailVerificationCode,
  startPlatformOAuthLinkApp,
} from "~/lib/api/endpoints/platform/account-security"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

interface CapturedRequest {
  path: string
  method?: string
  csrf: string | null
  body: unknown
}

function captureRequests(response: (path: string) => unknown) {
  const requests: CapturedRequest[] = []
  installFetchMock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://ims.test").pathname
    requests.push({
      path,
      method: init?.method,
      csrf: new Headers(init?.headers).get(CSRF_HEADER_NAME),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return Response.json(response(path))
  })
  return requests
}

afterEach(() => {
  clearCsrfCookie("platform")
})

describe("Platform email binding API contracts", () => {
  it("reads the current email credential with Platform auth and no CSRF header", async () => {
    const requests = captureRequests(() => ({ success: true, email: null }))

    await expect(getPlatformEmailCredential().send()).resolves.toEqual({
      success: true,
      email: null,
    })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/email",
        method: "GET",
        csrf: null,
        body: undefined,
      },
    ])
  })

  it("posts the verification code request with normalized email and CSRF", async () => {
    setCsrfCookie("platform", "binding-csrf")
    const requests = captureRequests(() => ({
      success: true,
      queued: true,
      retryAfterSeconds: 30,
    }))

    await expect(
      sendPlatformEmailVerificationCode({ email: "New@Example.COM" }).send()
    ).resolves.toMatchObject({ queued: true, retryAfterSeconds: 30 })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/email/verification-code",
        method: "POST",
        csrf: "binding-csrf",
        body: { email: "new@example.com" },
      },
    ])
  })

  it("posts a bind with the new password and a change with the current one", async () => {
    setCsrfCookie("platform", "binding-csrf")
    const requests = captureRequests(() => ({
      success: true,
      email: "new@example.com",
    }))

    await expect(
      bindPlatformEmail({
        email: " New@Example.com ",
        code: "012345",
        newPassword: " correct-horse-battery ",
      }).send()
    ).resolves.toMatchObject({ email: "new@example.com" })
    await expect(
      changePlatformEmail({
        email: "moved@example.com",
        code: "654321",
        currentPassword: " legacy ",
      }).send()
    ).resolves.toMatchObject({ email: "new@example.com" })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/email/bind",
        method: "POST",
        csrf: "binding-csrf",
        body: {
          email: "new@example.com",
          code: "012345",
          newPassword: "correct-horse-battery",
        },
      },
      {
        path: "/api/platform/me/email/change",
        method: "POST",
        csrf: "binding-csrf",
        body: {
          email: "moved@example.com",
          code: "654321",
          currentPassword: "legacy",
        },
      },
    ])
  })

  it("rejects unknown keys rather than forwarding them", () => {
    expect(() =>
      bindPlatformEmail({
        email: "new@example.com",
        code: "012345",
        newPassword: "correct-horse-battery",
        // @ts-expect-error unknown keys are rejected by the strict schema
        extra: true,
      })
    ).toThrow()
    expect(() =>
      changePlatformEmail({
        email: "moved@example.com",
        code: "654321",
        currentPassword: "legacy",
        // @ts-expect-error unknown keys are rejected by the strict schema
        extra: true,
      })
    ).toThrow()
  })

  it("builds the link start URL from a validated provider code", () => {
    expect(platformOAuthLinkStartUrl("github")).toBe(
      "/api/platform/me/oauth-links/github/start"
    )
    expect(() => platformOAuthLinkStartUrl("Not A Provider")).toThrow()
  })

  it("posts the app link start with the challenge, CSRF, and no redirect", async () => {
    setCsrfCookie("platform", "binding-csrf")
    const challenge = "a".repeat(43)
    const requests = captureRequests(() => ({
      success: true,
      authorizationUrl: "https://provider.example/authorize",
    }))

    await expect(
      startPlatformOAuthLinkApp({
        provider: "github",
        codeChallenge: challenge,
      }).send()
    ).resolves.toEqual({
      success: true,
      authorizationUrl: "https://provider.example/authorize",
    })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/oauth-links/github/start",
        method: "POST",
        csrf: "binding-csrf",
        body: { codeChallenge: challenge },
      },
    ])
  })

  it("rejects an invalid provider or challenge before any request", () => {
    expect(() =>
      startPlatformOAuthLinkApp({
        provider: "Not A Provider",
        codeChallenge: "a".repeat(43),
      })
    ).toThrow()
    expect(() =>
      startPlatformOAuthLinkApp({ provider: "github", codeChallenge: "short" })
    ).toThrow()
  })

  it("surfaces the unavailable-provider error code from the app link start", async () => {
    setCsrfCookie("platform", "binding-csrf")
    installFetchMock(async () =>
      Response.json(
        { success: false, code: "PLATFORM_OAUTH_LINK_UNAVAILABLE" },
        { status: 404 }
      )
    )

    await expect(
      startPlatformOAuthLinkApp({
        provider: "google",
        codeChallenge: "a".repeat(43),
      }).send()
    ).rejects.toMatchObject({
      status: 404,
      code: "PLATFORM_OAUTH_LINK_UNAVAILABLE",
    })
  })

  it("rejects a response that carries fields the contract does not allow", async () => {
    installFetchMock(async () =>
      Response.json({
        success: true,
        email: "new@example.com",
        tokenHash: "leaked",
      })
    )

    await expect(getPlatformEmailCredential().send()).rejects.toMatchObject({
      code: "CONTRACT_VIOLATION",
    })
  })
})
