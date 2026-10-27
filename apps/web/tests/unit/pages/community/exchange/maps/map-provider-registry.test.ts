import { expect, it, vi } from "vitest"
import { fudabaMapConfigSchema } from "@imsweb/contracts/fudaba/map-delivery"
import type { FudabaMapConfig } from "~/lib/api"
import { createMapRendererRegistry } from "~/pages/community/exchange/maps/exchange-map-renderer"
import { mapProviderFor, preferredMapSource } from "~/lib/maps/provider-catalog"
import { amapProvider } from "~/lib/maps/providers/amap"
import { MapDisplayError, mapFailureDescription } from "~/lib/maps/map-errors"
import type { FudabaMapSource } from "~/lib/api"

it("loads an independently registered renderer without a provider branch in its consumer", async () => {
  const renderer = () => null
  const original = vi.fn(async () => renderer)
  const extension = vi.fn(async () => renderer)
  const load = createMapRendererRegistry<string>([
    { matches: (value) => value === "original", load: original },
    { matches: (value) => value === "extension", load: extension },
  ])
  await expect(load("extension")).resolves.toBe(renderer)
  expect(extension).toHaveBeenCalledExactlyOnceWith("extension")
  expect(original).not.toHaveBeenCalled()
  await expect(load("unknown")).rejects.toMatchObject({
    kind: "unsupported-provider",
  })
  const ambiguous = createMapRendererRegistry<string>([
    { matches: () => true, load: original },
    { matches: () => true, load: extension },
  ])
  await expect(ambiguous("extension")).rejects.toMatchObject({
    kind: "unsupported-provider",
  })
  expect(extension).toHaveBeenCalledTimes(1)
})

it("uses explicit providers and independent drafts while selecting regional defaults", () => {
  const legacy = {
    id: "legacy",
    name: "OpenFreeMap",
    provider: "maplibre" as const,
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
  }
  const amap: FudabaMapSource = {
    id: "cn",
    name: "大陆",
    provider: "amap",
    apiKey: "public-key-1234567890",
    securityProxyUrl: "/_AMapService",
    mapStyle: "amap://styles/custom-portal",
  }
  const mapbox: FudabaMapSource = {
    id: "global",
    name: "海外",
    provider: "mapbox",
    accessToken: "pk.public-mapbox-token-1234567890",
    styleUrl: "mapbox://styles/owner/custom",
  }
  expect(mapProviderFor(legacy).id).toBe("maplibre")
  for (const source of [legacy, amap, mapbox]) {
    const provider = mapProviderFor(source)
    expect(provider.toConfig(provider.createDraft(source))).toEqual(
      Object.fromEntries(
        Object.entries(source).filter(([key]) => key !== "id" && key !== "name")
      )
    )
  }
  expect(preferredMapSource([legacy, mapbox, amap], "mainland")).toBe("cn")
  expect(preferredMapSource([amap, legacy, mapbox], "overseas")).toBe("global")
  expect(preferredMapSource([legacy], "mainland")).toBeUndefined()
  const draft = amapProvider.createDraft()
  draft.apiKey = "changed"
  expect(amapProvider.createDraft().apiKey).toBe("")
  expect(amapProvider.createDraft().mapStyle).toBe("amap://styles/whitesmoke")
})

it("accepts dual native regional configuration but rejects the retired Mapbox federated renderer", () => {
  const config = {
    provider: "regional",
    defaultRegion: "mainland",
    mainland: {
      provider: "amap",
      apiKey: "public-key-1234567890",
      securityProxyUrl: "/_AMapService",
      mapStyle: "amap://styles/normal",
    },
    overseas: {
      provider: "mapbox",
      accessToken: "pk.public-mapbox-token-1234567890",
      styleUrl: "mapbox://styles/owner/custom",
    },
    search: {
      provider: "federated",
      mainland: {
        provider: "amap",
        apiKey: "public-key-1234567890",
        securityProxyUrl: "/_AMapService",
      },
      overseas: {
        provider: "mapbox",
        accessToken: "pk.public-mapbox-token-1234567890",
      },
    },
  } satisfies FudabaMapConfig
  expect(fudabaMapConfigSchema.safeParse(config).success).toBe(true)
  expect(
    fudabaMapConfigSchema.safeParse({
      provider: "mapbox",
      accessToken: config.overseas.accessToken,
      styleUrl: config.overseas.styleUrl,
      search: config.search,
    }).success
  ).toBe(false)
})

it("shows only adapter-owned explanations and hides raw SDK error messages", () => {
  expect(
    mapFailureDescription(
      new MapDisplayError("authorization", "当前网站未获授权。")
    )
  ).toContain("当前网站未获授权。")
  expect(
    mapFailureDescription(
      new MapDisplayError("reload-required", "配置已变更，请刷新页面")
    )
  ).toBe("配置已变更，请刷新页面")
  expect(
    mapFailureDescription(new Error("SDK failed?key=private&sec_code=secret"))
  ).not.toMatch(/private|secret|sec_code/)
  expect(mapFailureDescription(new Error("map disabled"))).toContain("尚未启用")
})
