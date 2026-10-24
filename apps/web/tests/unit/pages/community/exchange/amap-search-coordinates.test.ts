import { expect, it, vi } from "vitest"
import { estimateAMapSearchPositions } from "~/pages/community/exchange/amap-search-coordinates"
import type { AMapSdk } from "~/pages/community/exchange/amap-sdk"

function fixture() {
  return {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, done) => {
      done("complete", {
        info: "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng + 0.005 + (lng - 120) * 0.001,
          getLat: () => lat - 0.003,
        })),
      })
    }),
  }
}

it("estimates temporary search coordinates through official forward conversion and verifies the residual", async () => {
  const sdk = fixture()
  const input: [number, number][] = [[120.005, 29.997]]
  const result = await estimateAMapSearchPositions(
    sdk,
    input,
    new AbortController().signal
  )
  const errorMeters =
    Math.hypot(
      (result[0]![0] - 120) * Math.cos(Math.PI / 6),
      result[0]![1] - 30
    ) * 111320
  expect(errorMeters).toBeLessThanOrEqual(1)
  expect(input).toEqual([[120.005, 29.997]])
  expect(sdk.convertFrom).toHaveBeenCalledTimes(2)
  expect(
    sdk.convertFrom.mock.calls.every(
      ([points, type]) => points.length <= 40 && type === "gps"
    )
  ).toBe(true)
})

it("fails closed for invalid coordinates and nonconverging official responses", async () => {
  const sdk = fixture()
  await expect(
    estimateAMapSearchPositions(sdk, [[NaN, 30]], new AbortController().signal)
  ).rejects.toMatchObject({ kind: "failed" })
  expect(sdk.convertFrom).not.toHaveBeenCalled()
  const divergent = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, done) =>
      done("complete", {
        info: "ok",
        locations: points.map(() => ({ getLng: () => 0, getLat: () => 0 })),
      })
    ),
  }
  await expect(
    estimateAMapSearchPositions(
      divergent,
      [[120, 30]],
      new AbortController().signal
    )
  ).rejects.toMatchObject({ kind: "failed" })
})

it("settles immediately on cancellation even if the shared SDK callback never arrives", async () => {
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>(() => {}),
  }
  const controller = new AbortController()
  const pending = estimateAMapSearchPositions(
    sdk,
    [[120, 30]],
    controller.signal
  )
  await vi.waitFor(() => expect(sdk.convertFrom).toHaveBeenCalledOnce())
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
})

it("rejects late conversion results after cancellation without scheduling another iteration", async () => {
  let finish!: Parameters<AMapSdk["convertFrom"]>[2]
  const sdk = {
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((_points, _type, done) => {
      finish = done
    }),
  }
  const controller = new AbortController()
  const pending = estimateAMapSearchPositions(
    sdk,
    [[120, 30]],
    controller.signal
  )
  controller.abort()
  finish("complete", {
    info: "ok",
    locations: [{ getLng: () => 120.005, getLat: () => 29.997 }],
  })
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  expect(sdk.convertFrom).toHaveBeenCalledOnce()
})
