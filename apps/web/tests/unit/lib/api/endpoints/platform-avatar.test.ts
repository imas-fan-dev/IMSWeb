import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

async function loadPlatformAvatarEndpoint(apiOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", apiOrigin)
  const tokenStore = await import("~/lib/api/platform-token-store")
  const endpoint = await import("~/lib/api/endpoints/platform")
  return { endpoint, tokenStore }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  window.localStorage.clear()
})

describe("Platform avatar endpoint", () => {
  it("recognizes only the fixed IMSWeb avatar path in bearer mode", async () => {
    const { endpoint } = await loadPlatformAvatarEndpoint(
      "https://api.example.test"
    )

    expect(
      endpoint.isManagedPlatformAvatarUrl(
        "https://api.example.test/api/platform/me/avatar?v=2"
      )
    ).toBe(true)
    expect(
      endpoint.isManagedPlatformAvatarUrl("/api/platform/me/avatar?v=3")
    ).toBe(true)
    expect(
      endpoint.isManagedPlatformAvatarUrl(
        "https://oauth.example.test/api/platform/me/avatar?v=2"
      )
    ).toBe(false)
    expect(
      endpoint.isManagedPlatformAvatarUrl("https://api.example.test/avatar.png")
    ).toBe(false)
    expect(
      endpoint.isManagedPlatformAvatarUrl(
        "https://api.example.test.evil/api/platform/me/avatar?v=2"
      )
    ).toBe(false)
  })

  it("keeps managed avatar URLs direct when bearer mode is disabled", async () => {
    const { endpoint } = await loadPlatformAvatarEndpoint("")

    expect(
      endpoint.isManagedPlatformAvatarUrl("/api/platform/me/avatar?v=2")
    ).toBe(false)
  })

  it("loads Blob bytes through the fixed Platform client path", async () => {
    const requestBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46])
    let requestUrl = ""
    let requestInit: RequestInit | undefined
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input)
        requestInit = init
        return new Response(requestBytes, {
          headers: { "content-type": "image/webp" },
        })
      })
    )
    const { endpoint, tokenStore } = await loadPlatformAvatarEndpoint(
      "https://api.example.test"
    )
    tokenStore.storePlatformTokens({ accessToken: "avatar-access-token" })

    const blob = await endpoint.getPlatformAvatar().send()

    expect(requestUrl).toBe("https://api.example.test/api/platform/me/avatar")
    expect(requestInit?.method).toBe("GET")
    const headers = new Headers(requestInit?.headers)
    expect(headers.get("Authorization")).toBe("Bearer avatar-access-token")
    expect(headers.get("X-IMS-Auth-Mode")).toBe("bearer")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(requestBytes)
  })
})
