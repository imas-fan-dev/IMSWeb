import { afterEach, describe, expect, it, vi } from "vitest"

import {
  API_PROXY_PATH_PREFIXES,
  PUBLIC_SITE_PROXY_PATH_PREFIXES,
  isPublicSiteOwnedPath,
  isWebBundleOwnedPath,
} from "~/lib/bundle-path-policy"

/**
 * The bug these cover: all three alova clients set `baseURL: API_ORIGIN`, so a
 * root-relative path gains the API origin in a packaged Tauri build. That is
 * right for API routes and wrong for files the web bundle ships itself, which
 * live at the local scheme the WebView serves the frontend from.
 *
 * `API_ORIGIN` is read at module load, so each case needs a fresh module graph
 * under a stubbed env — same shape as `origin.test.ts`.
 */
async function loadApi(configuredOrigin: string) {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", configuredOrigin)
  return {
    bundle: await import("~/lib/api/bundle-client"),
    client: await import("~/lib/api/client"),
    fudaba: await import("~/lib/api/endpoints/fudaba"),
    producerMap: await import("~/lib/api/endpoints/producer-map"),
  }
}

/**
 * Captures the URL alova hands to the fetch adapter. That is the byte string
 * the network sees, after `buildCompletedURL(baseURL, url, params)` — the only
 * thing that decides which server answers.
 */
function captureRequestUrl(body: unknown = {}) {
  const urls: string[] = []
  vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : String(input))
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
  })
  return urls
}

const GEOMETRY_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "北京市" },
      geometry: { type: "Polygon", coordinates: [] },
    },
  ],
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("asset ownership", () => {
  it("keeps checked-in brand, map, and favicon assets in the bundle", () => {
    expect(isWebBundleOwnedPath("/brand/imsweb-logo.webp")).toBe(true)
    expect(isWebBundleOwnedPath("/maps/china-provinces.json")).toBe(true)
    expect(isWebBundleOwnedPath("/favicon.ico")).toBe(true)
    expect(isPublicSiteOwnedPath("/brand/imsweb-logo.webp")).toBe(false)
  })

  it("routes About brand assets to the public website", () => {
    const url = "/brand/about/gakuen-arisa.png"

    expect(isPublicSiteOwnedPath(url)).toBe(true)
    expect(isWebBundleOwnedPath(url)).toBe(false)
  })

  it("keeps API-proxied and absolute paths out of the bundle", () => {
    expect(isWebBundleOwnedPath("/api/producer-map")).toBe(false)
    expect(isWebBundleOwnedPath("/uploads/card.webp")).toBe(false)
    expect(isWebBundleOwnedPath("https://cdn.example/maps/other.json")).toBe(
      false
    )
  })

  it("keeps Vite's static proxy route contract in the shared policy", () => {
    expect(API_PROXY_PATH_PREFIXES).toEqual([
      "/api",
      "/assets",
      "/css",
      "/Data",
      "/eventchronicle",
      "/icon",
      "/image",
      "/runninggame",
      "/site-content",
      "/sites",
      "/uploads",
    ])
    expect(PUBLIC_SITE_PROXY_PATH_PREFIXES).toEqual(["/brand/about"])
  })
})

describe("bundle-owned asset routing", () => {
  it("keeps the geometry URL byte-identical when no API origin is configured", async () => {
    const urls = captureRequestUrl(GEOMETRY_BODY)
    const { producerMap } = await loadApi("")

    await producerMap.getProducerMapGeometry()

    expect(urls).toEqual(["/maps/china-provinces.json"])
  })

  it("does not prefix the API origin onto the geometry URL in packaged builds", async () => {
    const urls = captureRequestUrl(GEOMETRY_BODY)
    const { producerMap } = await loadApi("http://127.0.0.1:3010")

    await producerMap.getProducerMapGeometry()

    expect(urls).toEqual(["/maps/china-provinces.json"])
    expect(urls[0]).not.toContain("127.0.0.1:3010")
  })

  it("still prefixes the API origin onto an ordinary API path", async () => {
    const urls = captureRequestUrl({ regions: [], communities: [], series: [] })
    const { client } = await loadApi("http://127.0.0.1:3010")

    await client.apiClient.Get("/api/producer-map", {
      meta: { skipContractCheck: true },
    })

    expect(urls).toEqual(["http://127.0.0.1:3010/api/producer-map"])
  })

  it("leaves an API path relative when no origin is configured", async () => {
    const urls = captureRequestUrl({ ok: true })
    const { client } = await loadApi("")

    await client.apiClient.Get("/api/producer-map", {
      meta: { skipContractCheck: true },
    })

    expect(urls).toEqual(["/api/producer-map"])
  })

  it("validates the geometry payload against the wire contract", async () => {
    captureRequestUrl({ type: "FeatureCollection", features: "not-an-array" })
    const { producerMap } = await loadApi("http://127.0.0.1:3010")

    await expect(producerMap.getProducerMapGeometry()).rejects.toMatchObject({
      kind: "contract",
    })
  })

  it("keeps the exchange boundary source in the bundle", async () => {
    const urls = captureRequestUrl(GEOMETRY_BODY)
    const { fudaba } = await loadApi("http://127.0.0.1:3010")

    await fudaba.getFudabaChinaBoundaryDashSource()

    expect(urls).toEqual(["/maps/china-boundary-dashes.json"])
  })

  it("validates the exchange boundary source payload", async () => {
    captureRequestUrl({ type: "FeatureCollection", features: "not-an-array" })
    const { fudaba } = await loadApi("http://127.0.0.1:3010")

    await expect(
      fudaba.getFudabaChinaBoundaryDashSource()
    ).rejects.toMatchObject({
      kind: "contract",
    })
  })
})

describe("routeBundleOwnedRequest", () => {
  it.each([
    "/maps/china-provinces.json",
    "/maps/china-boundary-dashes.json",
    "/maps/exchange-style.json",
    "/brand/imsweb-logo.webp",
    "/favicon.ico",
  ])("clears the API baseURL for %s", async (url) => {
    const { bundle } = await loadApi("http://127.0.0.1:3010")
    const request = { baseURL: "http://127.0.0.1:3010", url }

    bundle.routeBundleOwnedRequest(request)

    expect(request.baseURL).toBe("")
  })

  it.each([
    "/api/producer-map",
    "/uploads/card.webp",
    "/brand/about/gakuen-arisa.png",
    "/assets/app.css",
    "/site-content/page.html",
    "https://cdn.example/maps/other.json",
    "//cdn.example/maps/other.json",
  ])("leaves the API baseURL in place for %s", async (url) => {
    const { bundle } = await loadApi("http://127.0.0.1:3010")
    const request = { baseURL: "http://127.0.0.1:3010", url }

    bundle.routeBundleOwnedRequest(request)

    expect(request.baseURL).toBe("http://127.0.0.1:3010")
  })

  it("rescues a bundle-owned path sent through the API client by mistake", async () => {
    const urls = captureRequestUrl({ ok: true })
    const { client } = await loadApi("http://127.0.0.1:3010")

    await client.apiClient.Get("/maps/china-boundary-dashes.json", {
      meta: { skipContractCheck: true },
    })

    expect(urls).toEqual(["/maps/china-boundary-dashes.json"])
  })
})

describe("bundleAssetClient", () => {
  it("refuses a path the bundle does not serve", async () => {
    captureRequestUrl({ ok: true })
    const { bundle } = await loadApi("http://127.0.0.1:3010")

    await expect(
      bundle.bundleAssetClient.Get("/api/producer-map", {
        meta: { skipContractCheck: true },
      })
    ).rejects.toThrow(/not served by the web bundle/)
  })

  it("serves a cached response instead of a second request", async () => {
    const urls = captureRequestUrl(GEOMETRY_BODY)
    const { producerMap } = await loadApi("http://127.0.0.1:3010")

    await producerMap.getProducerMapGeometry()
    await producerMap.getProducerMapGeometry()

    expect(urls).toHaveLength(1)
  })
})
