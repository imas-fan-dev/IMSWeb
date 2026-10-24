import { expect, it, vi } from "vitest"
import { rasterSourceWindow } from "~/pages/community/exchange/geographic-raster"
import { mapWorldPoint } from "~/pages/community/exchange/geographic-map-geometry"
import type { AMapSdk } from "~/pages/community/exchange/amap-sdk"

it("locates source patches using official forward evaluations without changing the native target or business coordinates", async () => {
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, type, callback) => {
      expect(type).toBe("gps")
      expect(points.length).toBeLessThanOrEqual(40)
      callback("complete", {
        info: "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng + 0.006,
          getLat: () => lat - 0.004,
        })),
      })
    }),
  }
  const z = 18,
    point = mapWorldPoint([114.17, 22.3]),
    x = Math.floor(point.x * 2 ** z),
    y = Math.floor(point.y * 2 ** z)
  const window = await rasterSourceWindow(
    sdk,
    x,
    y,
    z,
    new AbortController().signal
  )
  expect(window.east).toBeLessThan(x / 2 ** z)
  expect(window.north).toBeLessThan(y / 2 ** z)
  expect(sdk.convertFrom).toHaveBeenCalledTimes(2)
})
it("rejects canceled raster work before using the conversion service", async () => {
  const sdk = { convertFrom: vi.fn() },
    controller = new AbortController()
  controller.abort()
  await expect(
    rasterSourceWindow(sdk, 1, 1, 2, controller.signal)
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(sdk.convertFrom).not.toHaveBeenCalled()
})

it("pads by the retina sampling footprint without loading an unused third row or column", async () => {
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, done) =>
      done("complete", {
        info: "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng + 0.004,
          getLat: () => lat + 0.0025,
        })),
      })
    ),
  }
  const z = 9,
    count = 2 ** z,
    point = mapWorldPoint([119.7, 24.2])
  const window = await rasterSourceWindow(
    sdk,
    Math.floor(point.x * count),
    Math.floor(point.y * count),
    z,
    new AbortController().signal,
    undefined,
    2
  )
  const columns =
    Math.floor(window.east * count) - Math.floor(window.west * count) + 1
  const rows =
    Math.floor(window.south * count) - Math.floor(window.north * count) + 1
  expect(columns * rows).toBeLessThanOrEqual(4)
})
