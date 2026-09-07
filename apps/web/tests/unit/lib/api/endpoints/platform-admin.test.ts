import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createAdminPlatformOAuthProvider,
  deleteAdminPlatformOAuthProvider,
  getAdminPlatformOAuthProviders,
  updateAdminPlatformOAuthProvider,
} from "~/lib/api/endpoints/platform/admin"
import { CSRF_HEADER_NAME } from "~/lib/api/request"

const provider = {
  code: "github",
  displayName: "GitHub",
  icon: "github",
  buttonColor: "#24292e",
  enabled: true,
  configured: true,
  clientIdMasked: "git***",
  redirectUri: null,
  authorizationEndpoint: "https://github.test/authorize",
  tokenEndpoint: "https://github.test/token",
  userInfoEndpoint: "https://github.test/user",
  scopes: ["read:user"],
  tokenAuthMethod: "client_secret_post" as const,
  pkceEnabled: true,
  profileSubjectPath: "id",
  profileDisplayNamePath: "login",
  profileDisplayNameFallbackPath: null,
  profileAvatarUrlPath: "avatar_url",
  updatedAt: 1000,
}

const writeInput = {
  authorizationEndpoint: " https://github.test/authorize ",
  buttonColor: "#24292E",
  clientId: " github-client ",
  clientSecret: " github-secret ",
  displayName: " GitHub ",
  enabled: true,
  icon: "github",
  pkceEnabled: true,
  profileAvatarUrlPath: " avatar_url ",
  profileDisplayNameFallbackPath: "  ",
  profileDisplayNamePath: " login ",
  profileSubjectPath: " id ",
  redirectUri: " ",
  scopes: [" read:user "],
  tokenAuthMethod: "client_secret_post" as const,
  tokenEndpoint: " https://github.test/token ",
  userInfoEndpoint: " https://github.test/user ",
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = "ims_admin_csrf=; Max-Age=0; path=/"
})

describe("Platform OAuth admin endpoint contracts", () => {
  it("calls each provider endpoint with exact shared request and response schemas", async () => {
    document.cookie = "ims_admin_csrf=admin-csrf; path=/"
    const requests: Array<{
      path: string
      method: string
      csrf: string | null
      body: unknown
    }> = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input), "http://ims.test").pathname
        requests.push({
          path,
          method: init?.method ?? "GET",
          csrf: new Headers(init?.headers).get(CSRF_HEADER_NAME),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        if (init?.method === "GET") {
          return Response.json({ success: true, providers: [provider] })
        }
        if (init?.method === "DELETE") {
          return Response.json({ success: true, deletedCode: "github" })
        }
        return Response.json({ success: true, provider })
      })
    )

    await expect(getAdminPlatformOAuthProviders().send()).resolves.toEqual({
      success: true,
      providers: [provider],
    })
    await expect(
      createAdminPlatformOAuthProvider({ ...writeInput, code: "github" }).send()
    ).resolves.toEqual({ success: true, provider })
    await expect(
      updateAdminPlatformOAuthProvider("github", {
        ...writeInput,
        expectedUpdatedAt: 1000,
      }).send()
    ).resolves.toEqual({ success: true, provider })
    await expect(
      deleteAdminPlatformOAuthProvider("github", 1000).send()
    ).resolves.toEqual({ success: true, deletedCode: "github" })

    expect(requests).toEqual([
      {
        path: "/api/admin/platform/auth/oauth/providers",
        method: "GET",
        csrf: null,
        body: undefined,
      },
      {
        path: "/api/admin/platform/auth/oauth/providers",
        method: "POST",
        csrf: "admin-csrf",
        body: {
          ...writeInput,
          authorizationEndpoint: "https://github.test/authorize",
          buttonColor: "#24292e",
          clientId: "github-client",
          clientSecret: "github-secret",
          code: "github",
          displayName: "GitHub",
          profileAvatarUrlPath: "avatar_url",
          profileDisplayNameFallbackPath: null,
          profileDisplayNamePath: "login",
          profileSubjectPath: "id",
          redirectUri: undefined,
          scopes: ["read:user"],
          tokenEndpoint: "https://github.test/token",
          userInfoEndpoint: "https://github.test/user",
        },
      },
      {
        path: "/api/admin/platform/auth/oauth/github",
        method: "PUT",
        csrf: "admin-csrf",
        body: {
          ...writeInput,
          authorizationEndpoint: "https://github.test/authorize",
          buttonColor: "#24292e",
          clientId: "github-client",
          clientSecret: "github-secret",
          displayName: "GitHub",
          expectedUpdatedAt: 1000,
          profileAvatarUrlPath: "avatar_url",
          profileDisplayNameFallbackPath: null,
          profileDisplayNamePath: "login",
          profileSubjectPath: "id",
          redirectUri: undefined,
          scopes: ["read:user"],
          tokenEndpoint: "https://github.test/token",
          userInfoEndpoint: "https://github.test/user",
        },
      },
      {
        path: "/api/admin/platform/auth/oauth/github",
        method: "DELETE",
        csrf: "admin-csrf",
        body: { expectedUpdatedAt: 1000 },
      },
    ])
  })

  it("rejects success payloads with emitted unknown fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, providers: [], unexpected: true })
      )
    )

    await expect(getAdminPlatformOAuthProviders().send()).rejects.toMatchObject(
      {
        code: "CONTRACT_VIOLATION",
      }
    )
  })
})
