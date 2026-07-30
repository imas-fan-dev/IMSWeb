import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SeriesAccentStrip } from "~/components/shared/series-accent-strip"
import { seriesWallItems } from "~/lib/series-wall"

describe("SeriesAccentStrip", () => {
  it("renders the shared series colors in homepage order", () => {
    render(<SeriesAccentStrip data-testid="series-strip" />)

    const strip = screen.getByTestId("series-strip")
    const segments = [...strip.querySelectorAll("[data-series-accent]")]

    expect(strip).toHaveClass("grid-cols-6")
    expect(strip).toHaveAttribute("aria-hidden", "true")
    expect(segments.map((segment) => segment.className)).toEqual(
      seriesWallItems.map((series) => series.background)
    )
  })

  it("uses the same order for vertical accents", () => {
    render(
      <SeriesAccentStrip data-testid="series-strip" orientation="vertical" />
    )

    const strip = screen.getByTestId("series-strip")
    expect(strip).toHaveClass("grid-rows-6")
    expect(strip).toHaveAttribute("data-orientation", "vertical")
  })
})
