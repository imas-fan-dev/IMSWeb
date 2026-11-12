import { describe, expect, it } from "vitest"

import {
  artworkShapeMismatch,
  turnedShape,
} from "~/pages/account/me/namecards/card-media-gallery"

describe("artwork shape checks", () => {
  it("treats a 90-degree orientation swap as the same shape", () => {
    expect(
      artworkShapeMismatch(
        { width: 600, height: 900 },
        { width: 900, height: 600 }
      )
    ).toBe(false)
  })

  it("keeps same-orientation equal sizes unchanged", () => {
    expect(
      artworkShapeMismatch(
        { width: 600, height: 900 },
        { width: 600, height: 900 }
      )
    ).toBe(false)
  })

  it("still reports genuinely different aspect ratios", () => {
    expect(
      artworkShapeMismatch(
        { width: 600, height: 900 },
        { width: 1000, height: 1000 }
      )
    ).toBe(true)
  })

  it("swaps width and height for odd rotation turns", () => {
    expect(turnedShape({ width: 600, height: 900 }, 1)).toEqual({
      width: 900,
      height: 600,
    })
    expect(turnedShape({ width: 600, height: 900 }, 2)).toEqual({
      width: 600,
      height: 900,
    })
  })
})
