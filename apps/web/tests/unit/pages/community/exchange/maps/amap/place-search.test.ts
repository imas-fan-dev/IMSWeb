import { afterEach, expect, it, vi } from "vitest"
import { createAMapPlaceSearch } from "~/pages/community/exchange/maps/amap/place-search"
import * as searchCoordinates from "~/pages/community/exchange/maps/amap/search-coordinates"
import {
  loadAMapSdk,
  type AMapSdk,
} from "~/pages/community/exchange/maps/amap/sdk"
vi.mock("~/pages/community/exchange/maps/amap/sdk", () => ({
  loadAMapSdk: vi.fn(),
}))
const config = {
  provider: "amap" as const,
  apiKey: "public-test-key",
  securityProxyUrl: "/_AMapService",
}
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
function fixture() {
  let searchDone!: (status: string, result: unknown) => void
  let nearDone!: (status: string, result: unknown) => void
  const search = vi.fn((_query: string, callback: typeof searchDone) => {
    searchDone = callback
  })
  const searchNearBy = vi.fn(
    (
      _query: string,
      _center: [number, number],
      _radius: number,
      callback: typeof nearDone
    ) => {
      nearDone = callback
    }
  )
  const convertFrom = vi.fn<AMapSdk["convertFrom"]>((points, _type, done) =>
    done("complete", {
      info: "ok",
      locations: points.map(([lng, lat]) => ({
        getLng: () => lng + 0.005,
        getLat: () => lat - 0.003,
      })),
    })
  )
  const sdk = {
    plugin: vi.fn((_names: string[], callback: () => void) => callback()),
    convertFrom,
    PlaceSearch: class {
      search = search
      searchNearBy = searchNearBy
    },
  }
  vi.mocked(loadAMapSdk).mockResolvedValue(sdk as unknown as AMapSdk)
  return {
    search,
    searchNearBy,
    convertFrom,
    searchDone: (s: string, r: unknown) => searchDone(s, r),
    nearDone: (s: string, r: unknown) => nearDone(s, r),
  }
}
const poi = (id: string, lng = 121.5) => ({
  id,
  name: id,
  adcode: "310106",
  pname: "上海市",
  address: "测试路",
  location: { getLng: () => lng, getLat: () => 31.2 },
})
const response = (pois: unknown[]) => ({ poiList: { pois } })
it("uses official nearby PlaceSearch first and falls back only when nearby has no matches", async () => {
  const f = fixture()
  const estimate = vi.spyOn(searchCoordinates, "estimateAMapSearchPositions")
  const pending = createAMapPlaceSearch(config, "wgs84", {
    vicinityFirst: true,
  })("咖啡", new AbortController().signal, { viewportCenter: [121.5, 31.2] })
  await vi.waitFor(() => expect(f.searchNearBy).toHaveBeenCalledOnce())
  expect(f.search).not.toHaveBeenCalled()
  expect(f.searchNearBy.mock.calls[0]?.[0]).toBe("咖啡")
  expect(f.searchNearBy.mock.calls[0]?.[2]).toBe(3000)
  f.nearDone("complete", response([]))
  await vi.waitFor(() => expect(f.search).toHaveBeenCalledOnce())
  f.searchDone("complete", response([poi("coffee", 121.505)]))
  const result = await pending
  expect(result.items[0]?.id).toBe("coffee")
  expect(result.items[0]?.target.kind).toBe("wgs84")
  expect(estimate).toHaveBeenCalledOnce()
  expect(result.items[0]?.target.position[0]).toBeCloseTo(121.5, 8)
  expect(result.items[0]?.target.position[1]).toBeCloseTo(31.203, 8)
  expect(result.items[0]?.source).toEqual({
    provider: "amap",
    coordinateSystem: "gcj02",
    position: [121.505, 31.2],
    calibration: "amap-forward-estimate",
  })
  result.items[0]!.target.position[0] = 0
  expect(result.items[0]?.source?.position).toEqual([121.505, 31.2])
  expect(result.notice).toContain("地图中心附近 3 公里内没有匹配结果")
  expect(f.convertFrom).toHaveBeenCalledTimes(3)
})
it("returns nearby native AMap targets without making a global text search", async () => {
  const f = fixture()
  const pending = createAMapPlaceSearch(config, "native", {
    vicinityFirst: true,
  })("车站", new AbortController().signal, { viewportCenter: [121.5, 31.2] })
  await vi.waitFor(() => expect(f.searchNearBy).toHaveBeenCalledOnce())
  f.nearDone("complete", response([poi("station")]))
  const result = await pending
  expect(result.items[0]?.target.kind).toBe("native")
  expect(result.items[0]?.source).toEqual({
    provider: "amap",
    coordinateSystem: "gcj02",
    position: [121.5, 31.2],
    calibration: "identity",
  })
  // Only the viewport is converted; native candidates need no conversion.
  expect(f.convertFrom).toHaveBeenCalledOnce()
  expect(f.search).not.toHaveBeenCalled()
})
it("uses text search when no viewport context was supplied", async () => {
  const f = fixture()
  const pending = createAMapPlaceSearch(config, "native", {
    vicinityFirst: true,
  })("东京", new AbortController().signal)
  await vi.waitFor(() => expect(f.search).toHaveBeenCalledOnce())
  expect(f.searchNearBy).not.toHaveBeenCalled()
  f.searchDone("complete", response([poi("tokyo")]))
  const result = await pending
  expect(result.items).toMatchObject([{ id: "tokyo" }])
  expect(f.convertFrom).not.toHaveBeenCalled()
  result.items[0]!.target.position[0] = 0
  expect(result.items[0]?.source?.position).toEqual([121.5, 31.2])
})
it("settles cancellation immediately and ignores late SDK callbacks", async () => {
  const f = fixture()
  const controller = new AbortController()
  const pending = createAMapPlaceSearch(config)("上海场馆", controller.signal)
  await vi.waitFor(() => expect(f.search).toHaveBeenCalledOnce())
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  controller.abort()
  f.searchDone("error", { info: "private" })
  await rejected
})

it("rejects a failed WGS84 estimate instead of returning native coordinates", async () => {
  const f = fixture()
  f.convertFrom.mockImplementation((_points, _type, done) =>
    done("error", { info: "failed", locations: [] })
  )
  const pending = createAMapPlaceSearch(config, "wgs84")(
    "上海",
    new AbortController().signal
  )
  const rejected = expect(pending).rejects.toMatchObject({ kind: "failed" })
  await vi.waitFor(() => expect(f.search).toHaveBeenCalledOnce())
  f.searchDone("complete", response([poi("station")]))
  await rejected
})

it("discards an estimate completed after cancellation", async () => {
  const f = fixture()
  let finish!: Parameters<AMapSdk["convertFrom"]>[2]
  f.convertFrom.mockImplementation((_points, _type, done) => {
    finish = done
  })
  const controller = new AbortController()
  const pending = createAMapPlaceSearch(config, "wgs84")(
    "上海",
    controller.signal
  )
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  await vi.waitFor(() => expect(f.search).toHaveBeenCalledOnce())
  f.searchDone("complete", response([poi("station")]))
  await vi.waitFor(() => expect(f.convertFrom).toHaveBeenCalledOnce())
  controller.abort()
  finish("complete", {
    info: "ok",
    locations: [{ getLng: () => 121.5, getLat: () => 31.2 }],
  })
  await rejected
})
