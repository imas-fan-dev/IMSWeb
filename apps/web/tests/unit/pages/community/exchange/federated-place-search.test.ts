import { beforeEach, expect, it, vi } from "vitest"
import type { MapPlaceSearcher, MapSearchPlace } from "~/lib/maps/map-search"
import { MapSearchError } from "~/lib/maps/map-search"
import { loadExchangeMapSearch } from "~/pages/community/exchange/exchange-map-search"
import { loadAMapSdk } from "~/pages/community/exchange/amap-sdk"
import { loadAMapMapBoundary } from "~/pages/community/exchange/amap-map-boundary"

const mocks = vi.hoisted(() => ({
  amap: vi.fn<MapPlaceSearcher>(),
  mapbox: vi.fn<MapPlaceSearcher>(),
  createAMap: vi.fn(),
  createMapbox: vi.fn(),
}))
vi.mock("~/pages/community/exchange/amap-place-search", () => ({
  createAMapPlaceSearch: mocks.createAMap,
}))
vi.mock("~/lib/api", () => ({
  createMapboxPlaceSearch: mocks.createMapbox,
  searchFudabaPlaces: vi.fn(),
  sendWithAbort: vi.fn(),
}))
vi.mock("~/pages/community/exchange/amap-sdk", () => ({
  loadAMapSdk: vi.fn(async () => ({})),
}))
vi.mock("~/pages/community/exchange/amap-coordinates", () => ({
  convertAMapPositions: async (_sdk: unknown, points: unknown) => points,
}))
vi.mock("~/pages/community/exchange/amap-map-boundary", () => ({
  loadAMapMapBoundary: vi.fn(async () => ({
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
  })),
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
}
const place = (id: string, position: [number, number]): MapSearchPlace => ({
  id,
  label: id,
  address: id,
  target: { kind: "wgs84", position },
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createAMap.mockReturnValue(mocks.amap)
  mocks.createMapbox.mockReturnValue(mocks.mapbox)
  mocks.amap.mockResolvedValue({
    items: [place("far", [121.8, 31.2]), place("near", [121.51, 31.2])],
    attribution: "© 高德地图",
  })
  mocks.mapbox.mockResolvedValue({
    items: [place("Tokyo", [139.7, 35.6])],
    attribution: "© Mapbox",
  })
})
it("queries only AMap for a mainland view, normalizes its targets and ranks by device position", async () => {
  const search = await loadExchangeMapSearch(config)
  const response = await search("咖啡", new AbortController().signal, {
    viewportCenter: [121.5, 31.2],
    devicePosition: [121.5, 31.2],
  })
  expect(mocks.createAMap).toHaveBeenCalledWith(config.mainland, "wgs84", {
    vicinityFirst: true,
  })
  expect(mocks.amap).toHaveBeenCalledOnce()
  expect(mocks.mapbox).not.toHaveBeenCalled()
  expect(response.items.map((p) => p.id)).toEqual(["near", "far"])
  expect(response.items[0]?.distanceLabel).toMatch(/^距你 /)
  expect(response.attribution).toBe("© 高德地图")
})
it("routes by map region rather than user location or words and preserves Mapbox attribution", async () => {
  const search = await loadExchangeMapSearch(config)
  const response = await search("上海", new AbortController().signal, {
    viewportCenter: [139.7, 35.6],
    devicePosition: [121.5, 31.2],
  })
  expect(mocks.mapbox).toHaveBeenCalledOnce()
  expect(mocks.amap).not.toHaveBeenCalled()
  expect(loadAMapSdk).not.toHaveBeenCalled()
  expect(response.attribution).toBe("© Mapbox")
})
it("excludes HK/MO/TW geometry and labels map-centre fallback honestly", async () => {
  const response = await (
    await loadExchangeMapSearch(config)
  )("车站", new AbortController().signal, { viewportCenter: [111, 26] })
  expect(mocks.amap).not.toHaveBeenCalled()
  expect(mocks.mapbox).toHaveBeenCalledOnce()
  expect(loadAMapMapBoundary).toHaveBeenCalledOnce()
  expect(response.items[0]?.distanceLabel).toMatch(/^距地图中心 /)
})
it("does not silently switch providers after a mainland failure", async () => {
  mocks.amap.mockRejectedValue(new MapSearchError("unavailable"))
  await expect(
    (await loadExchangeMapSearch(config))(
      "上海",
      new AbortController().signal,
      { viewportCenter: [121.5, 31.2] }
    )
  ).rejects.toMatchObject({ kind: "unavailable" })
  expect(mocks.mapbox).not.toHaveBeenCalled()
})
it("rejects late responses and retains the request-time position snapshot", async () => {
  let finish!: (value: Awaited<ReturnType<MapPlaceSearcher>>) => void
  mocks.mapbox.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const search = await loadExchangeMapSearch(config)
  const controller = new AbortController()
  const center: [number, number] = [139.7, 35.6]
  const pending = search("Tokyo", controller.signal, { viewportCenter: center })
  center[0] = 121.5
  controller.abort()
  finish({ items: [place("late", [139.7, 35.6])], attribution: "© Mapbox" })
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  expect(mocks.mapbox.mock.calls[0]?.[2]?.viewportCenter).toEqual([139.7, 35.6])
})
