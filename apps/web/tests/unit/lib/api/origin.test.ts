import { afterEach, describe, expect, it, vi } from "vitest"

async function loadOrigin(configuredOrigin: string) {
  return loadOrigins(configuredOrigin, "", "", "web")
}

/**
 * Loads the module with both build-time origins stubbed, so a case can pin the
 * API origin and the public site origin independently.
 */
async function loadOrigins(
  apiOrigin: string,
  publicSiteOrigin: string,
  localMediaPathPrefix = "",
  appTarget = "web",
  mapTransportOrigin = ""
) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", apiOrigin)
  vi.stubEnv("VITE_IMS_PUBLIC_SITE_ORIGIN", publicSiteOrigin)
  vi.stubEnv("VITE_IMS_MAP_TRANSPORT_ORIGIN", mapTransportOrigin)
  vi.stubEnv("VITE_IMS_LOCAL_MEDIA_PATH_PREFIX", localMediaPathPrefix)
  vi.stubEnv("VITE_IMS_APP_TARGET", appTarget)
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

  it("keeps browser same-origin root-relative API media unchanged", async () => {
    const { resolveMediaUrl } = await loadOrigin("")

    expect(resolveMediaUrl("/uploads/card.webp")).toBe("/uploads/card.webp")
  })

  it("keeps root-relative API media on the web even when an origin is configured", async () => {
    const { resolveMediaUrl } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top",
      "",
      "web"
    )

    expect(resolveMediaUrl("/uploads/card.webp")).toBe("/uploads/card.webp")
  })

  it("prefixes root-relative API media with the packaged App API origin", async () => {
    const { resolveMediaUrl } = await loadOrigins(
      "https://idol-master.top",
      "https://idol-master.top",
      "",
      "app"
    )

    expect(resolveMediaUrl("/uploads/card.webp")).toBe(
      "https://idol-master.top/uploads/card.webp"
    )
  })

  it("leaves external HTTPS media unchanged for packaged App builds", async () => {
    const { resolveMediaUrl } = await loadOrigins(
      "https://idol-master.top",
      "https://idol-master.top",
      "",
      "app"
    )

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
    const { resolveSiteOrigin } = await loadOrigins(
      "https://idol-master.top",
      "https://idol-master.top",
      "",
      "app"
    )

    expect(resolveSiteOrigin()).toBe("https://idol-master.top")
  })
})

describe("Map transport origin", () => {
  it("always selects an HTTP(S) App transport instead of the document origin", async () => {
    const cases: Array<[string, string, string, "web" | "app", string]> = [
      [
        "https://api.imsweb.test",
        "https://site.imsweb.test",
        "",
        "web",
        window.location.origin,
      ],
      [
        "",
        "http://192.168.31.169:1420",
        "",
        "app",
        "http://192.168.31.169:1420",
      ],
      [
        "https://api.imsweb.test",
        "https://site.imsweb.test",
        "",
        "app",
        "https://site.imsweb.test",
      ],
      [
        "https://api.imsweb.test",
        "https://site.imsweb.test",
        "http://192.168.31.169:1420",
        "app",
        "http://192.168.31.169:1420",
      ],
      ["https://api.imsweb.test", "", "", "app", "https://api.imsweb.test"],
    ]

    for (const [
      apiOrigin,
      publicSiteOrigin,
      mapTransportOrigin,
      appTarget,
      expected,
    ] of cases) {
      const { resolveMapTransportOrigin } = await loadOrigins(
        apiOrigin,
        publicSiteOrigin,
        "",
        appTarget,
        mapTransportOrigin
      )
      expect(resolveMapTransportOrigin()).toBe(expected)
    }
  })
})

describe("App development object-storage proxy", () => {
  it("routes local object-storage URLs through the same-origin App server", async () => {
    const { resolveMediaUrl } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "/imsweb-media-local",
      "app"
    )

    expect(
      resolveMediaUrl("http://127.0.0.1:9000/imsweb-media-local/wiki/logo.webp")
    ).toBe("/imsweb-media-local/wiki/logo.webp")
    expect(
      resolveMediaUrl(
        "http://192.168.31.169:9000/imsweb-media-local/news/cover.jpg?v=2#preview"
      )
    ).toBe("/imsweb-media-local/news/cover.jpg?v=2#preview")
  })

  it("keeps proxied object-storage paths relative for Tauri development", async () => {
    const { resolveSafeMediaUrl } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "/imsweb-media-local",
      "app"
    )

    expect(
      resolveSafeMediaUrl(
        "http://192.168.31.169:9000/imsweb-media-local/editorial/events/poster.png?v=2#preview"
      )
    ).toBe("/imsweb-media-local/editorial/events/poster.png?v=2#preview")
  })

  it("keeps same-origin API paths relative for App development", async () => {
    const { resolveSafeMediaUrl } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "",
      "app"
    )

    expect(resolveSafeMediaUrl("/uploads/events/poster.webp")).toBe(
      "/uploads/events/poster.webp"
    )
  })

  it("does not proxy public or unrelated object-storage URLs", async () => {
    const { resolveMediaUrl } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "/imsweb-media-local",
      "app"
    )

    expect(
      resolveMediaUrl("https://cdn.example/imsweb-media-local/wiki/logo.webp")
    ).toBe("https://cdn.example/imsweb-media-local/wiki/logo.webp")
    expect(
      resolveMediaUrl("http://127.0.0.1:9000/another-bucket/logo.webp")
    ).toBe("http://127.0.0.1:9000/another-bucket/logo.webp")
  })

  it("rewrites local object-storage URLs only for an App with an explicit proxy", async () => {
    const localObjectStorageUrl =
      "http://192.168.31.169:9000/imsweb-media-local/editorial/events/poster.png"
    const { resolveMediaUrl: resolveAppMediaUrl } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "/imsweb-media-local",
      "app"
    )

    expect(resolveAppMediaUrl(localObjectStorageUrl)).toBe(
      "/imsweb-media-local/editorial/events/poster.png"
    )

    const { resolveMediaUrl: resolveAppWithoutProxy } = await loadOrigins(
      "",
      "http://192.168.31.169:1420",
      "",
      "app"
    )
    expect(resolveAppWithoutProxy(localObjectStorageUrl)).toBe(
      localObjectStorageUrl
    )

    const { resolveMediaUrl: resolveBrowserMediaUrl } = await loadOrigins(
      "",
      "",
      "/imsweb-media-local",
      "web"
    )
    expect(resolveBrowserMediaUrl(localObjectStorageUrl)).toBe(
      localObjectStorageUrl
    )
  })
})

describe("public site media URL", () => {
  it("stays root-relative in browser builds", async () => {
    const { resolvePublicSiteMediaUrl } = await loadOrigins("", "")

    expect(resolvePublicSiteMediaUrl("/brand/about/hero.png")).toBe(
      "/brand/about/hero.png"
    )
  })

  it("uses the public site origin for packaged App media", async () => {
    const { resolvePublicSiteMediaUrl } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top",
      "",
      "app"
    )

    expect(resolvePublicSiteMediaUrl("/brand/about/hero.png")).toBe(
      "https://idol-master.top/brand/about/hero.png"
    )
  })

  it("falls back to the API origin for the current combined deployment", async () => {
    const { resolvePublicSiteMediaUrl } = await loadOrigins(
      "https://idol-master.top",
      "",
      "",
      "app"
    )

    expect(resolvePublicSiteMediaUrl("/brand/about/hero.png")).toBe(
      "https://idol-master.top/brand/about/hero.png"
    )
  })

  it("leaves absolute and protocol-relative URLs unchanged", async () => {
    const { resolvePublicSiteMediaUrl } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top"
    )

    expect(resolvePublicSiteMediaUrl("https://cdn.example/hero.png")).toBe(
      "https://cdn.example/hero.png"
    )
    expect(resolvePublicSiteMediaUrl("//cdn.example/hero.png")).toBe(
      "//cdn.example/hero.png"
    )
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
      "",
      "",
      "app"
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

  it("uses the runtime target rather than origin presence for the site origin", async () => {
    const cases: Array<[string, string, "web" | "app", string]> = [
      ["", "", "web", window.location.origin],
      ["", "https://idol-master.top", "web", window.location.origin],
      [
        "https://api.idol-master.top",
        "https://idol-master.top",
        "web",
        window.location.origin,
      ],
      [
        "https://api.idol-master.top",
        "https://idol-master.top",
        "app",
        "https://api.idol-master.top",
      ],
    ]

    for (const [apiOrigin, publicSiteOrigin, appTarget, expected] of cases) {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      const { API_ORIGIN, isCrossOriginApi, resolveSiteOrigin } =
        await loadOrigins(apiOrigin, publicSiteOrigin, "", appTarget)

      expect(resolveSiteOrigin()).toBe(expected)
      expect(API_ORIGIN).toBe(apiOrigin)
      expect(isCrossOriginApi).toBe(apiOrigin !== "")
      warn.mockRestore()
    }
  })

  it("leaves media resolution untouched by the public origin", async () => {
    const { resolveMediaUrl, resolveSafeMediaUrl } = await loadOrigins(
      "https://api.idol-master.top",
      "https://idol-master.top",
      "",
      "app"
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
