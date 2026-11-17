import { describe, expect, it } from "vitest"

import {
  clampCarouselIndex,
  nextAutoCarouselIndex,
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

  it("never leaves the range when stepping by hand", () => {
    expect(stepCarouselIndex(0, -1, 3)).toBe(0)
    expect(stepCarouselIndex(1, 1, 3)).toBe(2)
    expect(stepCarouselIndex(2, 1, 3)).toBe(2)
  })
})

describe("carousel auto advance", () => {
  it("wraps back to the first slide", () => {
    expect(nextAutoCarouselIndex(0, 3)).toBe(1)
    expect(nextAutoCarouselIndex(2, 3)).toBe(0)
  })

  it("has no next slide for a single (or empty) set", () => {
    expect(nextAutoCarouselIndex(0, 1)).toBeNull()
    expect(nextAutoCarouselIndex(0, 0)).toBeNull()
  })
})
