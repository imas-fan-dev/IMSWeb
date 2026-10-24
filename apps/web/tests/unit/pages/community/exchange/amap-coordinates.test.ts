import { expect, it, vi } from "vitest"
import {
  amapQueryBounds,
  convertAMapPositions,
} from "~/pages/community/exchange/amap-coordinates"
import type { AMapSdk } from "~/pages/community/exchange/amap-sdk"

function fixture(fail = false) {
  const convertFrom = vi.fn<AMapSdk["convertFrom"]>(
    (points, type, callback) => {
      expect(type).toBe("gps")
      callback(fail ? "error" : "complete", {
        info: fail ? "error" : "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng + 0.005,
          getLat: () => lat - 0.003,
        })),
      })
    }
  )
  return { convertFrom }
}

it("uses official gps conversion, batches at 40, caches duplicate coordinates and preserves input order", async () => {
  const sdk = fixture()
  const points: [number, number][] = Array.from({ length: 81 }, (_, index) => [
    110 + index / 100,
    30,
  ])
  const result = await convertAMapPositions(sdk, [...points, points[0]!])
  expect(sdk.convertFrom).toHaveBeenCalledTimes(3)
  expect(
    vi.mocked(sdk.convertFrom).mock.calls.map(([batch]) => batch.length)
  ).toEqual([40, 40, 1])
  expect(result[0]).toEqual([110.005, 29.997])
  expect(result.at(-1)).toEqual(result[0])
  await convertAMapPositions(sdk, points)
  expect(sdk.convertFrom).toHaveBeenCalledTimes(3)
  expect(points[0]).toEqual([110, 30])
})

it("reports official conversion failures and keeps query bounds conservative", async () => {
  await expect(
    convertAMapPositions(fixture(true), [[116.4, 39.9]])
  ).rejects.toThrow("高德坐标转换失败")
  expect(
    amapQueryBounds({ west: 116, east: 117, south: 39, north: 40 })
  ).toEqual({ west: 115.98, east: 117.02, south: 38.98, north: 40.02 })
})

it("shares in-flight official conversions across overlapping renders", async () => {
  let finish!: Parameters<AMapSdk["convertFrom"]>[2]
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((_points, _type, callback) => {
      finish = callback
    }),
  }
  const first = convertAMapPositions(sdk, [[121.4, 31.2]])
  const second = convertAMapPositions(sdk, [
    [121.4, 31.2],
    [121.4, 31.2],
  ])
  expect(sdk.convertFrom).toHaveBeenCalledTimes(1)
  finish("complete", {
    info: "ok",
    locations: [{ getLng: () => 121.405, getLat: () => 31.197 }],
  })
  await expect(first).resolves.toEqual([[121.405, 31.197]])
  await expect(second).resolves.toEqual([
    [121.405, 31.197],
    [121.405, 31.197],
  ])
})

it("isolates caller coordinates and cache keys from the SDK's in-place LngLat normalization", async () => {
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, callback) => {
      const [lng, lat] = points[0]!
      Reflect.set(points, 0, {
        getLng: () => lng,
        getLat: () => lat,
        toJSON: () => [lng, lat],
      })
      callback("complete", {
        info: "ok",
        locations: [{ getLng: () => lng + 0.005, getLat: () => lat - 0.003 }],
      })
    }),
  }
  const points: [number, number][] = [[121.4, 31.2]]
  await expect(convertAMapPositions(sdk, points)).resolves.toEqual([
    [121.405, 31.197],
  ])
  expect(points).toEqual([[121.4, 31.2]])
  await expect(convertAMapPositions(sdk, points)).resolves.toEqual([
    [121.405, 31.197],
  ])
  expect(sdk.convertFrom).toHaveBeenCalledTimes(1)
})

it("handles failed SDK-normalized coordinates and retries with a fresh conversion", async () => {
  let fail = true
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, callback) => {
      Reflect.set(points, 0, { getLng: () => 121.4, getLat: () => 31.2 })
      queueMicrotask(() =>
        callback(fail ? "error" : "complete", {
          info: fail ? "error" : "ok",
          locations: fail
            ? undefined
            : [{ getLng: () => 121.405, getLat: () => 31.197 }],
        })
      )
    }),
  }
  await expect(convertAMapPositions(sdk, [[121.4, 31.2]])).rejects.toThrow(
    "高德坐标转换失败"
  )
  fail = false
  await expect(convertAMapPositions(sdk, [[121.4, 31.2]])).resolves.toEqual([
    [121.405, 31.197],
  ])
  expect(sdk.convertFrom).toHaveBeenCalledTimes(2)
})
