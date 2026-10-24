import { afterEach, expect, it, vi } from "vitest"
import { createAMapPlaceSearch } from "~/pages/community/exchange/amap-place-search"
import { loadAMapSdk, type AMapSdk } from "~/pages/community/exchange/amap-sdk"
vi.mock("~/pages/community/exchange/amap-sdk", () => ({ loadAMapSdk: vi.fn() }))
const config = {
  provider: "amap" as const,
  apiKey: "public-test-key",
  securityProxyUrl: "/_AMapService",
}
afterEach(() => vi.useRealTimers())
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
  await expect(pending).resolves.toMatchObject({ items: [{ id: "tokyo" }] })
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
