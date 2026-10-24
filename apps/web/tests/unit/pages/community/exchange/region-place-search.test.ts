import { afterEach, expect, it, vi } from "vitest"
import type { FudabaMapSearchConfig } from "@imsweb/contracts/fudaba/map-delivery"
import type { MapPlaceSearcher } from "~/lib/maps/map-search"
import { createRegionPlaceSearch } from "~/pages/community/exchange/region-place-search"
import type { AMapSdk } from "~/pages/community/exchange/amap-sdk"
const mocks = vi.hoisted(() => ({ convert: vi.fn(), boundary: vi.fn() }))
vi.mock("~/pages/community/exchange/amap-sdk", () => ({
  loadAMapSdk: vi.fn(async () => ({ convertFrom: mocks.convert })),
}))
vi.mock("~/pages/community/exchange/amap-map-boundary", () => ({
  loadAMapMapBoundary: mocks.boundary,
}))
vi.mock("~/pages/community/exchange/amap-coordinates", () => ({
  convertAMapPositions: async (_sdk: unknown, points: [number, number][]) =>
    points.map(([lng, lat]) => [lng + 0.005, lat - 0.003]),
}))
const config = {
  provider: "federated" as const,
  mainland: {
    provider: "amap" as const,
    apiKey: "public-amap-key-1234567890",
    securityProxyUrl: "/_AMapService",
  },
  overseas: {
    provider: "mapbox" as const,
    accessToken: "pk.public-mapbox-token-1234567890",
  },
} satisfies Extract<FudabaMapSearchConfig, { provider: "federated" }>
const polygon = {
  country: [
    [
      [100, 20],
      [125, 20],
      [125, 45],
      [100, 45],
    ],
  ],
  overseas: [
    [
      [110, 25],
      [112, 25],
      [112, 27],
      [110, 27],
    ],
  ],
}
const place = (id: string, position: [number, number]) => ({
  id,
  label: id,
  address: id,
  target: { kind: "wgs84" as const, position },
})
afterEach(() => vi.restoreAllMocks())
function setup() {
  mocks.convert.mockImplementation(
    (
      points: [number, number][],
      _type: "gps",
      done: Parameters<AMapSdk["convertFrom"]>[2]
    ) =>
      done("complete", {
        info: "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng,
          getLat: () => lat,
        })),
      })
  )
  mocks.boundary.mockResolvedValue(polygon)
}
it("queries only AMap for the Mapbox camera in mainland China and ranks from device location", async () => {
  setup()
  const amap = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place("far", [116.8, 39.9]), place("near", [116.401, 39.9])],
    attribution: "© 高德地图",
  }))
  const mapbox = vi.fn<MapPlaceSearcher>(async () => ({
    items: [],
    attribution: "© Mapbox",
  }))
  const search = createRegionPlaceSearch(config, amap, mapbox)
  const response = await search("咖啡", new AbortController().signal, {
    viewportCenter: [116.4, 39.9],
    devicePosition: [116.4, 39.9],
  })
  expect(amap).toHaveBeenCalledOnce()
  expect(mapbox).not.toHaveBeenCalled()
  expect(amap.mock.calls[0]?.[2]).toEqual({
    viewportCenter: [116.4, 39.9],
    devicePosition: [116.4, 39.9],
  })
  expect(response.items.map((item) => item.id)).toEqual(["near", "far"])
  expect(response.items[0]?.distanceLabel).toMatch(/^距你 /)
  expect(response.items[1]?.distanceLabel).toMatch(/^距你 /)
  expect(response.attribution).toBe("© 高德地图")
})
it("routes a China-named search to Mapbox when the submitted camera is overseas and distance-falls back honestly", async () => {
  setup()
  const amap = vi.fn<MapPlaceSearcher>(async () => ({
    items: [],
    attribution: "© 高德地图",
  }))
  const mapbox = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place("Tokyo", [139.701, 35.6]), place("Far Tokyo", [139.9, 35.6])],
    attribution: "© Mapbox",
  }))
  const response = await createRegionPlaceSearch(config, amap, mapbox)(
    "上海",
    new AbortController().signal,
    { viewportCenter: [139.7, 35.6], devicePosition: [121.5, 31.2] }
  )
  expect(mapbox).toHaveBeenCalledOnce()
  expect(amap).not.toHaveBeenCalled()
  expect(response.items[0]?.id).toBe("Tokyo")
  expect(response.items[0]?.distanceLabel).toMatch(/^距你 /)
})
it("uses map-centre fallback when device location is unavailable", async () => {
  setup()
  const amap = vi.fn<MapPlaceSearcher>(async () => ({
    items: [place("near", [116.401, 39.9])],
    attribution: "© 高德地图",
  }))
  const mapbox = vi.fn<MapPlaceSearcher>()
  const response = await createRegionPlaceSearch(config, amap, mapbox)(
    "北京",
    new AbortController().signal,
    { viewportCenter: [116.4, 39.9] }
  )
  expect(response.items[0]?.distanceLabel).toMatch(/^距地图中心 /)
  expect(response.notice).toContain("未取得当前位置")
})
it("does not silently change the selected regional provider after failure", async () => {
  setup()
  const amap = vi.fn<MapPlaceSearcher>(async () => {
    throw new Error("vendor down")
  })
  const mapbox = vi.fn<MapPlaceSearcher>()
  await expect(
    createRegionPlaceSearch(config, amap, mapbox)(
      "北京",
      new AbortController().signal,
      { viewportCenter: [116.4, 39.9] }
    )
  ).rejects.toThrow("vendor down")
  expect(mapbox).not.toHaveBeenCalled()
})
it("keeps a stable request-time copy of map and device positions", async () => {
  setup()
  let finish!: (value: {
    items: ReturnType<typeof place>[]
    attribution: string
  }) => void
  const amap = vi.fn<MapPlaceSearcher>(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const mapbox = vi.fn<MapPlaceSearcher>()
  const context = {
    viewportCenter: [116.4, 39.9] as [number, number],
    devicePosition: [116.5, 39.9] as [number, number],
  }
  const pending = createRegionPlaceSearch(config, amap, mapbox)(
    "北京",
    new AbortController().signal,
    context
  )
  await vi.waitFor(() => expect(amap).toHaveBeenCalledOnce())
  context.viewportCenter[0] = 139.7
  context.devicePosition[0] = 121.5
  finish({
    items: [place("Beijing", [116.401, 39.9])],
    attribution: "© 高德地图",
  })
  const result = await pending
  expect(amap).toHaveBeenCalledOnce()
  expect(mapbox).not.toHaveBeenCalled()
  expect(amap.mock.calls[0]?.[2]?.viewportCenter).toEqual([116.4, 39.9])
  expect(result.items[0]?.distanceLabel).toMatch(/^距你 /)
})
