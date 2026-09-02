import { afterEach, describe, expect, it, vi } from "vitest"

import {
  changePlatformPassword,
  getPlatformOAuthLinks,
  getPlatformSessionDevices,
  platformOAuthLinkListResponseSchema,
  platformPasswordChangeInputSchema,
  platformSessionListResponseSchema,
  revokeOtherPlatformSessions,
  revokePlatformSessionDevice,
  unlinkPlatformOAuthLink,
} from "~/lib/api/endpoints/platform"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

interface CapturedRequest {
  path: string
  method?: string
  csrf: string | null
  body: unknown
}

const device = {
  id: "session-1",
  current: true,
  userAgent: "Mozilla/5.0 (Macintosh)",
  ipAddress: "203.0.113.7",
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_500_000,
  expiresAt: 1_800_000_000_000,
}

const link = {
  provider: "github",
  providerName: "GitHub",
  enabled: true,
  accountName: "producer",
  avatarUrl: "https://example.test/avatar.png",
  linkedAt: 1_700_000_000_000,
  removable: true,
}

function captureRequests(response: (path: string) => unknown) {
  const requests: CapturedRequest[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "http://ims.test").pathname
      requests.push({
        path,
        method: init?.method,
        csrf: new Headers(init?.headers).get(CSRF_HEADER_NAME),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return Response.json(response(path))
    })
  )
  return requests
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_platform_csrf=; Max-Age=0; path=/"
})

describe("Platform account security API contracts", () => {
  it("normalizes the current password leniently and the new password strictly", () => {
    // The API compares the current password against a stored digest, so a
    // legacy credential below today's floor must still be submittable; the
    // replacement takes the registration rule instead.
    expect(
      platformPasswordChangeInputSchema.parse({
        currentPassword: "  legacy  ",
        newPassword: "  correct-horse-battery  ",
      })
    ).toEqual({
      currentPassword: "legacy",
      newPassword: "correct-horse-battery",
    })
    expect(
      platformPasswordChangeInputSchema.safeParse({
        currentPassword: "x",
        newPassword: "short",
      }).success
    ).toBe(false)
    expect(
      platformPasswordChangeInputSchema.safeParse({
        currentPassword: "legacy",
        newPassword: "a".repeat(73),
      }).success
    ).toBe(false)
    expect(() =>
      platformPasswordChangeInputSchema.parse({
        currentPassword: "legacy",
        newPassword: "correct-horse-battery",
        extra: true,
      })
    ).toThrow()
  })

  it("posts a password change with the CSRF header and both secrets", async () => {
    document.cookie = "ims_platform_csrf=security-csrf; path=/"
    const requests = captureRequests(() => ({
      success: true,
      revokedSessionCount: 3,
    }))

    await expect(
      changePlatformPassword({
        currentPassword: " legacy ",
        newPassword: " correct-horse-battery ",
      }).send()
    ).resolves.toMatchObject({ revokedSessionCount: 3 })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/password",
        method: "POST",
        csrf: "security-csrf",
        body: {
          currentPassword: "legacy",
          newPassword: "correct-horse-battery",
        },
      },
    ])
  })

  it("reads the device list with Platform auth and no CSRF header", async () => {
    const requests = captureRequests(() => ({
      success: true,
      sessions: [device],
    }))

    await expect(getPlatformSessionDevices().send()).resolves.toMatchObject({
      sessions: [{ id: "session-1", current: true }],
    })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/sessions",
        method: "GET",
        csrf: null,
        body: undefined,
      },
    ])
    // Bearer secrets must never reach the client, so the contract is strict.
    expect(
      platformSessionListResponseSchema.safeParse({
        success: true,
        sessions: [{ ...device, tokenHash: "leaked" }],
      }).success
    ).toBe(false)
  })

  it("revokes one device and every other device as distinct DELETEs", async () => {
    document.cookie = "ims_platform_csrf=revoke-csrf; path=/"
    const requests = captureRequests((path) => ({
      success: true,
      revokedSessionCount: path.endsWith("/sessions") ? 4 : 1,
    }))

    await expect(
      revokePlatformSessionDevice("session-2").send()
    ).resolves.toMatchObject({ revokedSessionCount: 1 })
    await expect(revokeOtherPlatformSessions().send()).resolves.toMatchObject({
      revokedSessionCount: 4,
    })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/sessions/session-2",
        method: "DELETE",
        csrf: "revoke-csrf",
        body: undefined,
      },
      {
        path: "/api/platform/me/sessions",
        method: "DELETE",
        csrf: "revoke-csrf",
        body: undefined,
      },
    ])
  })

  it("rejects session ids the API path parser would refuse", () => {
    expect(() => revokePlatformSessionDevice("")).toThrow()
    expect(() => revokePlatformSessionDevice("a".repeat(129))).toThrow()
    expect(() => revokePlatformSessionDevice("bad\u0000id")).toThrow()
  })

  it("reads OAuth links and unlinks one provider by path segment", async () => {
    document.cookie = "ims_platform_csrf=unlink-csrf; path=/"
    const requests = captureRequests((path) =>
      path.endsWith("/oauth-links")
        ? { success: true, links: [link], passwordEnabled: true }
        : { success: true, provider: "github" }
    )

    await expect(getPlatformOAuthLinks().send()).resolves.toMatchObject({
      links: [{ provider: "github", removable: true }],
      // The list doubles as the login-method inventory: without this the
      // password form could only discover an OAuth-only account by submitting.
      passwordEnabled: true,
    })
    await expect(
      unlinkPlatformOAuthLink("github").send()
    ).resolves.toMatchObject({ provider: "github" })

    expect(requests).toEqual([
      {
        path: "/api/platform/me/oauth-links",
        method: "GET",
        csrf: null,
        body: undefined,
      },
      {
        path: "/api/platform/me/oauth-links/github",
        method: "DELETE",
        csrf: "unlink-csrf",
        body: undefined,
      },
    ])
  })

  it("keeps removable on the wire so the client never recomputes it", () => {
    // The server-side guard also weighs whether the surviving providers are
    // still enabled, which this payload does not carry per sibling; dropping
    // the flag would leave the UI with no sound way to decide.
    expect(
      platformOAuthLinkListResponseSchema.safeParse({
        success: true,
        links: [{ ...link, removable: undefined }],
        passwordEnabled: true,
      }).success
    ).toBe(false)
    // Omitting the login-method flag is equally unacceptable.
    expect(
      platformOAuthLinkListResponseSchema.safeParse({
        success: true,
        links: [link],
      }).success
    ).toBe(false)
    expect(() => unlinkPlatformOAuthLink("Not A Provider")).toThrow()
  })
})
