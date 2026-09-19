import { afterEach, describe, expect, it } from "vitest"

import {
  installFetchMock,
  type FetchMock,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import {
  getAdminPlatformUser,
  getAdminPlatformUsers,
  revokeAdminPlatformUserSessions,
  triggerAdminPlatformUserPasswordReset,
  unlinkAdminPlatformUserOAuth,
  updateAdminPlatformUserStatus,
} from "~/lib/api/endpoints/platform/admin-users"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const user = {
  id: "account-1",
  status: "active" as const,
  displayName: "Producer One",
  email: "one@ims.test",
  hasPassword: true,
  activeSessionCount: 2,
  lastLoginAt: 1_000,
  createdAt: 900,
  updatedAt: 1_100,
}

const link = {
  provider: "github",
  providerName: "GitHub",
  enabled: true,
  accountName: "one",
  avatarUrl: null,
  linkedAt: 950,
  removable: true,
}

interface Recorded {
  path: string
  method: string
  csrf: string | null
  body: unknown
  params: string
}

function capture(fetchMock: FetchMock): Recorded[] {
  return fetchMock.mock.calls.map((call) => {
    const [input, init] = call as [RequestInfo | URL, RequestInit | undefined]
    const url = new URL(String(input), "http://ims.test")
    return {
      path: url.pathname,
      method: init?.method ?? "GET",
      csrf: new Headers(init?.headers).get(CSRF_HEADER_NAME),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      params: url.search,
    }
  })
}

afterEach(() => {
  clearCsrfCookie("backoffice")
})

describe("Platform user admin endpoint contracts", () => {
  it("targets the six admin endpoints with the right method, CSRF and body", async () => {
    setCsrfCookie("backoffice", "admin-csrf")
    const fetchMock = installFetchMock(async (input) => {
      const url = new URL(String(input), "http://ims.test")
      if (url.pathname.endsWith("/oauth-links/github")) {
        return Response.json({ success: true, provider: "github" })
      }
      if (url.pathname.endsWith("/password-reset")) {
        return Response.json(
          { success: true, queued: true, retryAfterSeconds: 60 },
          { status: 202 }
        )
      }
      if (url.pathname.endsWith("/sessions")) {
        return Response.json({ success: true, revokedSessionCount: 2 })
      }
      if (url.pathname.endsWith("/status")) {
        return Response.json({ success: true, user })
      }
      if (url.pathname === "/api/admin/platform/users/account-1") {
        return Response.json({
          success: true,
          user: { ...user, oauthLinks: [link] },
        })
      }
      return Response.json({
        success: true,
        users: [user],
        pageInfo: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      })
    })

    await expect(
      getAdminPlatformUsers({
        query: "one@ims.test",
        field: "email",
        page: 2,
      }).send()
    ).resolves.toMatchObject({ success: true, users: [user] })
    await expect(
      getAdminPlatformUser("account-1").send()
    ).resolves.toMatchObject({
      success: true,
      user: { id: "account-1" },
    })
    await expect(
      updateAdminPlatformUserStatus("account-1", {
        status: "suspended",
        expectedUpdatedAt: 1_100,
      }).send()
    ).resolves.toMatchObject({ success: true })
    await expect(
      revokeAdminPlatformUserSessions("account-1").send()
    ).resolves.toMatchObject({ revokedSessionCount: 2 })
    await expect(
      triggerAdminPlatformUserPasswordReset("account-1").send()
    ).resolves.toMatchObject({ queued: true })
    await expect(
      unlinkAdminPlatformUserOAuth("account-1", "github").send()
    ).resolves.toMatchObject({ provider: "github" })

    expect(capture(fetchMock)).toEqual([
      {
        path: "/api/admin/platform/users",
        method: "GET",
        csrf: null,
        body: undefined,
        params: "?query=one@ims.test&field=email&page=2",
      },
      {
        path: "/api/admin/platform/users/account-1",
        method: "GET",
        csrf: null,
        body: undefined,
        params: "",
      },
      {
        path: "/api/admin/platform/users/account-1/status",
        method: "PUT",
        csrf: "admin-csrf",
        body: { status: "suspended", expectedUpdatedAt: 1_100 },
        params: "",
      },
      {
        path: "/api/admin/platform/users/account-1/sessions",
        method: "DELETE",
        csrf: "admin-csrf",
        body: undefined,
        params: "",
      },
      {
        path: "/api/admin/platform/users/account-1/password-reset",
        method: "POST",
        csrf: "admin-csrf",
        body: undefined,
        params: "",
      },
      {
        path: "/api/admin/platform/users/account-1/oauth-links/github",
        method: "DELETE",
        csrf: "admin-csrf",
        body: undefined,
        params: "",
      },
    ])
  })

  it("omits empty search keys instead of sending an invalid query", async () => {
    setCsrfCookie("backoffice", "admin-csrf")
    const fetchMock = installFetchMock(async () =>
      Response.json({
        success: true,
        users: [],
        pageInfo: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
        },
      })
    )

    await getAdminPlatformUsers({ query: "", page: 1 }).send()
    expect(capture(fetchMock)[0]?.params).toBe("?page=1")
  })

  it("rejects list responses carrying a credential hash field", async () => {
    installFetchMock(async () =>
      Response.json({
        success: true,
        users: [{ ...user, csrfHash: "leak" }],
        pageInfo: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
        },
      })
    )

    await expect(getAdminPlatformUsers().send()).rejects.toMatchObject({
      code: "CONTRACT_VIOLATION",
    })
  })

  it("surfaces the last-credential refusal as a distinct error code", async () => {
    setCsrfCookie("backoffice", "admin-csrf")
    installFetchMock(async () =>
      Response.json(
        { success: false, code: "PLATFORM_OAUTH_LAST_LOGIN_METHOD" },
        { status: 409 }
      )
    )

    await expect(
      unlinkAdminPlatformUserOAuth("account-1", "github").send()
    ).rejects.toMatchObject({
      status: 409,
      code: "PLATFORM_OAUTH_LAST_LOGIN_METHOD",
    })
  })
})
