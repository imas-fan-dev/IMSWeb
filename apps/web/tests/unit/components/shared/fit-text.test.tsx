import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  FitText,
  fitTextSize,
  FIT_TEXT_MAX_PX,
  FIT_TEXT_MIN_PX,
} from "~/components/shared/fit-text"

describe("fitTextSize", () => {
  it("keeps the base size when the text already fits", () => {
    expect(fitTextSize({ available: 120, naturalWidth: 120 })).toEqual({
      size: FIT_TEXT_MAX_PX,
      truncated: false,
    })
    expect(fitTextSize({ available: 200, naturalWidth: 120 })).toEqual({
      size: FIT_TEXT_MAX_PX,
      truncated: false,
    })
  })

  it("scales down between 14px and 11px", () => {
    const result = fitTextSize({ available: 90, naturalWidth: 100 })

    expect(result.size).toBeLessThanOrEqual(FIT_TEXT_MAX_PX)
    expect(result.size).toBeGreaterThanOrEqual(FIT_TEXT_MIN_PX)
    expect(result.size).toBe(12.6)
    expect(result.truncated).toBe(false)
  })

  it("clamps at 11px and asks for an ellipsis once even that overflows", () => {
    const result = fitTextSize({ available: 40, naturalWidth: 100 })

    expect(result.size).toBe(FIT_TEXT_MIN_PX)
    expect(result.truncated).toBe(true)
  })

  it("never reports a size outside the range when there is no measurement", () => {
    expect(fitTextSize({ available: 0, naturalWidth: 100 })).toEqual({
      size: FIT_TEXT_MAX_PX,
      truncated: false,
    })
  })
})

describe("FitText", () => {
  it("falls back to the base size without a canvas measurement", () => {
    render(<FitText text="天海春香" />)

    expect(screen.getByText("天海春香")).toHaveStyle({
      fontSize: `${FIT_TEXT_MAX_PX}px`,
    })
  })
})
