import { beforeEach, expect, it, vi } from "vitest"
import { createNearbyPlaceSearcher } from "~/pages/community/exchange/maps/nearby-places"
import type { FudabaMapConfig } from "~/lib/api"

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  nearby: vi.fn(),
  sdk: vi.fn(),
}))
vi.mock("~/lib/api", async (original) => ({
  ...(await original<typeof import("~/lib/api")>()),
  createMapboxNearbySearch: () => mocks.nearby,
}))
vi.mock("~/pages/community/exchange/maps/regional/resolve-point", () => ({
  createRegionPointResolver: () => mocks.resolve,
}))
vi.mock("~/pages/community/exchange/maps/amap/sdk", () => ({
  loadAMapSdk: mocks.sdk,
}))
vi.mock("~/pages/community/exchange/maps/amap/coordinates", () => ({
  convertAMapPositions: async (_sdk: unknown, positions: unknown) => positions,
}))

const amap = {
  provider: "amap" as const,
  apiKey: "test",
  securityProxyUrl: "/_AMapService",
}
const config: FudabaMapConfig = {
  provider: "regional",
  defaultRegion: "overseas",
  mainland: { ...amap, mapStyle: "normal" },
  overseas: {
    provider: "mapbox",
    accessToken: "pk.test",
    styleUrl: "mapbox://styles/mapbox/streets-v12",
  },
  search: {
    provider: "federated",
    mainland: amap,
    overseas: { provider: "mapbox", accessToken: "pk.test" },
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.nearby.mockResolvedValue({ items: [], attribution: "© Mapbox" })
})
it("routes by the chosen coordinate rather than device or default region", async () => {
  mocks.resolve.mockResolvedValue({ region: "overseas" })
  const signal = new AbortController().signal
  await createNearbyPlaceSearcher(config)(
    { kind: "wgs84", position: [139.7, 35.6] },
    signal
  )
  expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith([139.7, 35.6], signal)
  expect(mocks.nearby).toHaveBeenCalledExactlyOnceWith([139.7, 35.6], signal)
})
it("uses mainland geocoder POIs without a made-up keyword and retains transient provenance", async () => {
  const query = vi.fn()
  class Geocoder {
    getAddress(
      position: unknown,
      callback: (status: string, result: unknown) => void
    ) {
      query(position)
      callback("complete", {
        regeocode: {
          formattedAddress: "商场地址",
          pois: [
            {
              id: "poi-1",
              name: "附近商场",
              address: "商场路",
              location: { getLng: () => 121.5, getLat: () => 31.2 },
            },
            {
              id: "invalid",
              name: "无效地点",
              location: { lng: 999, lat: 31.2 },
            },
          ],
        },
      })
    }
  }
  mocks.resolve.mockResolvedValue({
    region: "mainland",
    sdk: { Geocoder },
    nativePosition: [121.51, 31.21],
  })
  const result = await createNearbyPlaceSearcher(config)(
    { kind: "wgs84", position: [121.5, 31.2] },
    new AbortController().signal
  )
  expect(query).toHaveBeenCalledExactlyOnceWith([121.51, 31.21])
  expect(mocks.nearby).not.toHaveBeenCalled()
  expect(result.items).toEqual([
    expect.objectContaining({
      id: "poi-1",
      label: "附近商场",
      previewOnly: true,
      source: expect.objectContaining({
        provider: "amap",
        coordinateSystem: "gcj02",
      }),
    }),
  ])
})
it("retires cancelled lookups before choosing a provider", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    createNearbyPlaceSearcher(config)(
      { kind: "wgs84", position: [121, 31] },
      controller.signal
    )
  ).rejects.toThrow()
  expect(mocks.resolve).not.toHaveBeenCalled()
})
