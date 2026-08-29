import { afterEach, describe, expect, it, vi } from "vitest"

async function loadOrigin(configuredOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
  return import("~/lib/api/origin")
}

/**
 * Loads the module with both build-time origins stubbed, so a case can pin the
 * API origin and the public site origin independently.
 */
async function loadOrigins(apiOrigin: string, publicSiteOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", apiOrigin)
  vi.stubEnv("VITE_IMS_PUBLIC_SITE_ORIGIN", publicSiteOrigin)
  return import("~/lib/api/origin")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("API origin", () => {
  it("stays empty for browser builds so requests remain same-origin", async () => {
    const { API_ORIGIN, isCrossOriginApi } = await loadOrigin("")

    expect(API_ORIGIN).toBe("")
    expect(isCrossOriginApi).toBe(false)
  })

  it("drops trailing slashes so joined paths keep a single separator", async () => {
    const { API_ORIGIN, isCrossOriginApi } = await loadOrigin(
      "https://idol-master.top//"
    )

    expect(API_ORIGIN).toBe("https://idol-master.top")
    expect(isCrossOriginApi).toBe(true)
  })

  it("returns media URLs untouched when no origin is configured", async () => {
    const { resolveMediaUrl } = await loadOrigin("")

    expect(resolveMediaUrl("/uploads/card.webp")).toBe("/uploads/card.webp")
  })

  it("prefixes root-relative media URLs for packaged builds", async () => {
    const { resolveMediaUrl } = await loadOrigin("https://idol-master.top")

    expect(resolveMediaUrl("/uploads/card.webp")).toBe(
      "https://idol-master.top/uploads/card.webp"
    )
  })

  it("leaves already-resolvable media URLs alone", async () => {
    const { resolveMediaUrl } = await loadOrigin("https://idol-master.top")

    expect(resolveMediaUrl("https://objects.example.com/a.webp")).toBe(
      "https://objects.example.com/a.webp"
    )
    expect(resolveMediaUrl("//objects.example.com/a.webp")).toBe(
      "//objects.example.com/a.webp"
    )
    expect(resolveMediaUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    )
    expect(resolveMediaUrl("relative/a.webp")).toBe("relative/a.webp")
  })

  it("treats blank media URLs as absent", async () => {
    const { resolveMediaUrl } = await loadOrigin("https://idol-master.top")

    expect(resolveMediaUrl(null)).toBe("")
    expect(resolveMediaUrl(undefined)).toBe("")
    expect(resolveMediaUrl("   ")).toBe("")
  })

  it("resolves the site origin against the document for browser builds", async () => {
    const { resolveSiteOrigin } = await loadOrigin("")

    expect(resolveSiteOrigin()).toBe(window.location.origin)
  })

  it("resolves the site origin against the API for packaged builds", async () => {
    const { resolveSiteOrigin } = await loadOrigin("https://idol-master.top")

    expect(resolveSiteOrigin()).toBe("https://idol-master.top")
  })
})

/**
 * The bug these cover: a link the user copies and opens in a real browser needs
 * the origin that serves *pages*. In the packaged client the API origin serves
 * none, and the document origin is a local WebView scheme, so neither constant
 * that already existed can build one.
 */
describe("shareable origin", () => {
  it("stays empty by default so the website resolves against the document", async () => {
    const { PUBLIC_SITE_ORIGIN, resolveShareableOrigin } = await loadOrigins(
      "",
      ""
    )

    expect(PUBLIC_SITE_ORIGIN).toBe("")
    expect(resolveShareableOrigin()).toBe(window.location.origin)
  })

  it("returns the configured public origin", async () => {
    const { PUBLIC_SITE_ORIGIN, resolveShareableOrigin } = await loadOrigins(
      "",
      "https://idol-master.top"
    )

    expect(PUBLIC_SITE_ORIGIN).toBe("https://idol-master.top")
    expect(resolveShareableOrigin()).toBe("https://idol-master.top")
  })

  it("drops trailing slashes so joined paths keep a single separator", async () => {
    const { PUBLIC_SITE_ORIGIN, resolveShareableOrigin } = await loadOrigins(
      "",
      "https://idol-master.top//"
    )

    expect(PUBLIC_SITE_ORIGIN).toBe("https://idol-master.top")
    expect(
      new URL("/community/namecards/7", resolveShareableOrigin()).href
    ).toBe("https://idol-master.top/community/namecards/7")
  })

  it("prefers the public origin over the API origin in a packaged build", async () => {
    const { resolveShareableOrigin } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top"
    )

    expect(resolveShareableOrigin()).toBe("https://idol-master.top")
  })

  it("falls back to a real http origin when a packaged build omits it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { resolveShareableOrigin } = await loadOrigins(
      "https://api.idol-master.top",
      ""
    )

    // Never the WebView scheme: an unusable `tauri://` link is the one outcome
    // worth ruling out structurally.
    expect(resolveShareableOrigin()).toBe("https://api.idol-master.top")
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it("stays quiet on the website, where the fallback is the right answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { resolveShareableOrigin } = await loadOrigins("", "")

    expect(resolveShareableOrigin()).toBe(window.location.origin)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("leaves resolveSiteOrigin() untouched in every combination", async () => {
    const cases: Array<[string, string, string]> = [
      ["", "", window.location.origin],
      ["", "https://idol-master.top", window.location.origin],
      ["https://api.idol-master.top", "", "https://api.idol-master.top"],
      [
        "https://api.idol-master.top",
        "https://idol-master.top",
        "https://api.idol-master.top",
      ],
    ]

    for (const [apiOrigin, publicSiteOrigin, expected] of cases) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const { API_ORIGIN, isCrossOriginApi, resolveSiteOrigin } =
        await loadOrigins(apiOrigin, publicSiteOrigin)

      expect(resolveSiteOrigin()).toBe(expected)
      expect(API_ORIGIN).toBe(apiOrigin)
      expect(isCrossOriginApi).toBe(apiOrigin !== "")
      warn.mockRestore()
    }
  })

  it("leaves media resolution untouched by the public origin", async () => {
    const { resolveMediaUrl, resolveSafeMediaUrl } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top"
    )

    // Media belongs to the API, so it must keep following the API origin even
    // though a different public origin is now configured.
    expect(resolveMediaUrl("/uploads/card.webp")).toBe(
      "https://api.idol-master.top/uploads/card.webp"
    )
    expect(resolveSafeMediaUrl("/uploads/card.webp")).toBe(
      "https://api.idol-master.top/uploads/card.webp"
    )
  })
})
