import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  clearOfficeCreateIntent,
  readOfficeCreateIntent,
  startOfficeCreateIntent,
} from "~/lib/maps/office-create-intent"

beforeEach(() => {
  clearOfficeCreateIntent()
  vi.useFakeTimers()
})
afterEach(() => {
  clearOfficeCreateIntent()
  vi.useRealTimers()
})
it("retains the independent chosen coordinate through an authentication return", () => {
  const point: [number, number] = [139.7, 35.6]
  const href = startOfficeCreateIntent({ kind: "wgs84", position: point })
  point[0] = 0
  expect(href).not.toContain("139.7")
  const id = new URL(href, "https://example.test").searchParams.get("create")
  expect(readOfficeCreateIntent(id)).toEqual({
    kind: "wgs84",
    position: [139.7, 35.6],
  })
  expect(readOfficeCreateIntent("other-intent")).toBeNull()
  clearOfficeCreateIntent()
  expect(readOfficeCreateIntent(id)).toBeNull()
})
it("expires abandoned location intents", () => {
  const href = startOfficeCreateIntent({ kind: "wgs84", position: [0, 0] })
  const id = new URL(href, "https://example.test").searchParams.get("create")
  vi.advanceTimersByTime(30 * 60 * 1000 + 1)
  expect(readOfficeCreateIntent(id)).toBeNull()
})
it("rejects invalid stored coordinates and preserves native coordinate identity", () => {
  sessionStorage.setItem(
    "ims:office-create-intent",
    JSON.stringify({
      id: "invalid",
      createdAt: Date.now(),
      target: { kind: "wgs84", position: [190, 0] },
    })
  )
  expect(readOfficeCreateIntent("invalid")).toBeNull()
  const href = startOfficeCreateIntent({
    kind: "native",
    provider: "amap",
    position: [121.5, 31.2],
  })
  expect(
    readOfficeCreateIntent(
      new URL(href, "https://example.test").searchParams.get("create")
    )
  ).toEqual({ kind: "native", provider: "amap", position: [121.5, 31.2] })
})
