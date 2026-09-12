import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function loadBearerModules(configuredOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
  const store = await import("~/lib/api/platform-token-store")
  const request = await import("~/lib/api/request")
  return { store, request }
}

function policyTarget(meta?: Record<string, unknown>) {
  return {
    config: { headers: {} as Record<string, unknown> },
    meta,
    type: "POST",
    url: "/api/platform/auth/login",
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  window.localStorage.clear()
})

describe("platform token custody", () => {
  it("stores nothing for browser builds so the session stays in httpOnly cookies", async () => {
    const { store } = await loadBearerModules("")

    store.storePlatformTokens({ accessToken: "a", refreshToken: "r" })

    expect(store.usesPlatformBearerAuth).toBe(false)
    expect(store.readPlatformAccessToken()).toBeNull()
    expect(store.hasStoredPlatformSession()).toBe(false)
    expect(window.localStorage.length).toBe(0)
  })

  it("keeps the tokens a packaged build is handed", async () => {
    const { store } = await loadBearerModules("https://idol-master.top")

    store.capturePlatformTokens({
      success: true,
      accessToken: "access-1",
      refreshToken: "refresh-1",
    })

    expect(store.readPlatformAccessToken()).toBe("access-1")
    expect(store.readPlatformRefreshToken()).toBe("refresh-1")
    expect(store.hasStoredPlatformSession()).toBe(true)

    store.clearPlatformTokens()
    expect(store.hasStoredPlatformSession()).toBe(false)
  })

  it("ignores payloads that carry no tokens", async () => {
    const { store } = await loadBearerModules("https://idol-master.top")

    store.storePlatformTokens({ accessToken: "access-1" })
    store.capturePlatformTokens({ success: true })
    store.capturePlatformTokens(null)

    expect(store.readPlatformAccessToken()).toBe("access-1")
    expect(store.readPlatformRefreshToken()).toBeNull()
  })
})

describe("platform request policy", () => {
  it("sends cookies and CSRF for browser builds", async () => {
    const { request } = await loadBearerModules("")
    document.cookie = "ims_platform_csrf=csrf-value"
    const target = policyTarget({ authRealm: "platform", csrf: true })

    request.applyApiRequestPolicy(target, {
      authRealm: "platform",
      csrfCookieName: "ims_platform_csrf",
    })

    expect(target.config).toMatchObject({ credentials: "same-origin" })
    expect(target.config.headers["X-CSRFToken"]).toBe("csrf-value")
    expect(target.config.headers).not.toHaveProperty("Authorization")
  })

  it("carries a bearer token instead of cookies for packaged builds", async () => {
    const { store, request } = await loadBearerModules(
      "https://idol-master.top"
    )
    store.storePlatformTokens({ accessToken: "access-1" })
    const target = policyTarget({ authRealm: "platform", csrf: true })

    request.applyApiRequestPolicy(target, {
      authRealm: "platform",
      csrfCookieName: "ims_platform_csrf",
    })

    // No cookie can reach a cross-origin API that grants no credentials, so a
    // CSRF double-submit is impossible; the bearer token replaces both.
    expect(target.config).toMatchObject({ credentials: "omit" })
    expect(target.config.headers["Authorization"]).toBe("Bearer access-1")
    expect(target.config.headers["X-IMS-Auth-Mode"]).toBe("bearer")
    expect(target.config.headers).not.toHaveProperty("X-CSRFToken")
  })

  it("still announces bearer mode before the first token exists", async () => {
    const { request } = await loadBearerModules("https://idol-master.top")
    const target = policyTarget({ authRealm: "platform" })

    request.applyApiRequestPolicy(target, {
      authRealm: "platform",
      csrfCookieName: "ims_platform_csrf",
    })

    expect(target.config.headers["X-IMS-Auth-Mode"]).toBe("bearer")
    expect(target.config.headers).not.toHaveProperty("Authorization")
  })

  it("rejects a request routed through the wrong realm client", async () => {
    const { request } = await loadBearerModules("https://idol-master.top")
    const target = policyTarget({ authRealm: "backoffice" })

    expect(() =>
      request.applyApiRequestPolicy(target, { authRealm: "platform" })
    ).toThrow(/backoffice request cannot use the platform API client/)
  })
})
