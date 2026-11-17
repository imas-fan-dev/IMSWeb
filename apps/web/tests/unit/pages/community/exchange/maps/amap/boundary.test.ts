import { expect, it, vi } from "vitest"
import { loadAMapMapBoundary } from "~/pages/community/exchange/maps/amap/boundary"

function fixture() {
  const codes: Record<string, string> = {
    中国: "100000",
    香港特别行政区: "810000",
    澳门特别行政区: "820000",
    台湾省: "710000",
  }
  const search = vi.fn(
    (name: string, callback: (status: string, result: unknown) => void) =>
      callback("complete", {
        districtList: [
          {
            adcode: codes[name],
            boundaries: [
              [
                [110, 20],
                [120, 20],
                [120, 30],
              ].map(([lng, lat]) => ({
                getLng: () => lng!,
                getLat: () => lat!,
              })),
            ],
          },
        ],
      })
  )
  return {
    search,
    sdk: {
      DistrictSearch: class {
        search = search
      },
    },
  }
}
it("uses official native country boundaries and separately excludes Hong Kong, Macao and Taiwan without GPS conversion", async () => {
  const f = fixture(),
    result = await loadAMapMapBoundary(f.sdk, new AbortController().signal)
  expect(f.search.mock.calls.map(([name]) => name)).toEqual([
    "中国",
    "香港特别行政区",
    "澳门特别行政区",
    "台湾省",
  ])
  expect(result.country).toEqual([
    [
      [110, 20],
      [120, 20],
      [120, 30],
    ],
  ])
  expect(result.overseas).toHaveLength(3)
})
it("rejects absent or mismatched coverage with a safe error instead of silently using a coarse mask", async () => {
  const f = fixture()
  f.search.mockImplementationOnce((_name, callback) =>
    callback("complete", {
      districtList: [{ adcode: "wrong", boundaries: [] }],
    })
  )
  await expect(
    loadAMapMapBoundary(f.sdk, new AbortController().signal)
  ).rejects.toThrow("大陆与海外地图边界暂不可用，请重试地图。")
  expect(f.search).toHaveBeenCalledTimes(1)
})
it("cancels a pending boundary query and ignores its late result", async () => {
  const f = fixture(),
    controller = new AbortController()
  let late: ((status: string, result: unknown) => void) | undefined
  f.search.mockImplementationOnce((_name, callback) => {
    late = callback
  })
  const pending = loadAMapMapBoundary(f.sdk, controller.signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  controller.abort()
  await rejected
  late!("complete", { districtList: [] })
  expect(f.search).toHaveBeenCalledTimes(1)
})
