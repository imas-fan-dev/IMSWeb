import { afterEach, describe, expect, it, vi } from "vitest"

async function loadOrigin(configuredOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
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
