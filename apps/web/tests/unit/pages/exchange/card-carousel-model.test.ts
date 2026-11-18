import { describe, expect, it } from "vitest"

import {
  carouselTeleportTarget,
  carouselTrackIndex,
  carouselTrackLength,
  carouselTrackPosition,
  clampCarouselIndex,
  shouldStepCarousel,
  stepCarouselIndex,
} from "~/pages/exchange/card-carousel-model"

describe("carousel index clamping", () => {
  it.each([
    [-3, 0],
    [-1, 0],
    [0, 0],
    [2, 2],
    [3, 2],
    [1.7, 1],
  ])("clamps %s inside a 3 slide set to %s", (index, expected) => {
    expect(clampCarouselIndex(index, 3)).toBe(expected)
  })

  it("has nowhere to go without any slide", () => {
    expect(clampCarouselIndex(2, 0)).toBe(0)
  })

  it("steps over both ends instead of stopping there", () => {
    expect(stepCarouselIndex(1, 1, 3)).toBe(2)
    expect(stepCarouselIndex(2, 1, 3)).toBe(0)
    expect(stepCarouselIndex(0, -1, 3)).toBe(2)
    expect(stepCarouselIndex(0, -1, 0)).toBe(0)
  })
})

describe("carousel swipe decision", () => {
  it("steps when the drag covers the width ratio", () => {
    expect(shouldStepCarousel({ dx: -60, elapsedMs: 900, width: 400 })).toBe(true)
    expect(shouldStepCarousel({ dx: 48, elapsedMs: 900, width: 400 })).toBe(true)
  })

  it("keeps the page when a slow drag stays under the ratio", () => {
    expect(shouldStepCarousel({ dx: -30, elapsedMs: 900, width: 400 })).toBe(false)
    expect(shouldStepCarousel({ dx: 0, elapsedMs: 20, width: 400 })).toBe(false)
  })

  it("steps on a quick flick even when the distance is short", () => {
    expect(shouldStepCarousel({ dx: -16, elapsedMs: 80, width: 400 })).toBe(true)
    expect(shouldStepCarousel({ dx: -16, elapsedMs: 400, width: 400 })).toBe(false)
  })

  it("falls back to the pixel floor when the width is unknown", () => {
    expect(shouldStepCarousel({ dx: -24, elapsedMs: 900, width: 0 })).toBe(true)
    expect(shouldStepCarousel({ dx: -20, elapsedMs: 900, width: 0 })).toBe(false)
  })
})

describe("carousel loop track", () => {
  it("adds one clone on each end only when it loops", () => {
    expect(carouselTrackLength(3, true)).toBe(5)
    expect(carouselTrackLength(3, false)).toBe(3)
  })

  it("maps every slide onto the middle of the track", () => {
    expect(carouselTrackPosition(0, 3, true)).toBe(1)
    expect(carouselTrackPosition(2, 3, true)).toBe(3)
    expect(carouselTrackPosition(0, 3, false)).toBe(0)
  })

  it("resolves clone cells back to the wrapped slide", () => {
    expect(carouselTrackIndex(0, 3, true)).toBe(2)
    expect(carouselTrackIndex(1, 3, true)).toBe(0)
    expect(carouselTrackIndex(4, 3, true)).toBe(0)
    expect(carouselTrackIndex(0, 3, false)).toBe(0)
  })

  it("round trips slide to track and back", () => {
    for (const index of [0, 1, 2]) {
      const position = carouselTrackPosition(index, 3, true)
      expect(carouselTrackIndex(position, 3, true)).toBe(index)
    }
  })

  it("teleports only after resting on a clone cell", () => {
    expect(carouselTeleportTarget(0, 3, true)).toBe(3)
    expect(carouselTeleportTarget(4, 3, true)).toBe(1)
    expect(carouselTeleportTarget(2, 3, true)).toBeNull()
    expect(carouselTeleportTarget(0, 3, false)).toBeNull()
    expect(carouselTeleportTarget(0, 1, true)).toBeNull()
  })
})
