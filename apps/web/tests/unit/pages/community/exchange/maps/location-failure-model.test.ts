import { describe, expect, it } from "vitest"

import { GeolocationFailure } from "~/lib/geolocation"
import {
  locationFailureCopy,
  locationFailureKind,
  placeLocationFailureNotice,
} from "~/pages/community/exchange/maps/location-failure-model"

describe("map location failure feedback", () => {
  it("keeps permission, timeout and capability failures distinct without leaking errors", () => {
    for (const kind of [
      "permission-denied",
      "timeout",
      "unavailable",
      "unsupported",
    ] as const) {
      expect(locationFailureKind(new GeolocationFailure(kind))).toBe(kind)
    }
    expect(locationFailureKind(new Error("private provider details"))).toBe(
      "unavailable"
    )
    expect(locationFailureCopy.unsupported.retry).toBe(false)
    expect(locationFailureCopy["permission-denied"].description).toContain(
      "系统设置"
    )
  })

  it.each([320, 390, 430])(
    "keeps the card clear of search and native side controls at %spx",
    (width) => {
      const layout = placeLocationFailureNotice(width, 844, {
        x: 12,
        y: 690,
        width: width - 24,
        height: 64,
      })
      expect(layout.visible).toBe(true)
      expect(layout.left).toBeGreaterThanOrEqual(12)
      expect(layout.left + layout.width).toBeLessThanOrEqual(width - 84)
      expect(layout.bottom).toBe(166)
    }
  )

  it.each([
    { x: 0, y: 0, width: 380, height: 800 },
    { x: 900, y: 0, width: 380, height: 800 },
  ])("avoids a full-height side workspace", (occlusion) => {
    const layout = placeLocationFailureNotice(1280, 800, occlusion)
    expect(layout.visible).toBe(true)
    expect(
      layout.left >= occlusion.x + occlusion.width + 12 ||
        layout.left + layout.width <= occlusion.x - 12
    ).toBe(true)
  })

  it("defers the visual card while expanded search leaves insufficient room", () => {
    expect(
      placeLocationFailureNotice(390, 844, {
        x: 12,
        y: 40,
        width: 366,
        height: 700,
      }).visible
    ).toBe(false)
  })
})
