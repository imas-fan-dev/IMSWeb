import { afterEach, expect, it, vi } from "vitest"
import { createAMapRasterProjection } from "~/pages/community/exchange/amap-raster-projection"
import type { AMapSdk } from "~/pages/community/exchange/amap-sdk"

afterEach(() => vi.useRealTimers())
it("coalesces adjacent raster work into shared official samples and cancels queued work", async () => {
  vi.useFakeTimers()
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((positions, _type, done) =>
      done("complete", {
        info: "ok",
        locations: positions.map(([lng, lat]) => ({
          getLng: () => lng + 0.006,
          getLat: () => lat - 0.004,
        })),
      })
    ),
  }
  const controller = new AbortController(),
    project = createAMapRasterProjection(sdk, controller.signal)
  const a = project([[114.1701, 22.3001]], 14),
    b = project([[114.1702, 22.3002]], 14)
  await vi.advanceTimersByTimeAsync(25)
  expect(sdk.convertFrom).toHaveBeenCalledTimes(1)
  expect(vi.mocked(sdk.convertFrom).mock.calls[0]?.[0]).toHaveLength(4)
  expect((await a)[0]![0]).toBeCloseTo(114.1761)
  expect((await b)[0]![1]).toBeCloseTo(22.2962)
  const pending = project([[115, 23]], 14)
  const canceled = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  controller.abort()
  await canceled
  await vi.runAllTimersAsync()
  expect(sdk.convertFrom).toHaveBeenCalledTimes(1)
})
