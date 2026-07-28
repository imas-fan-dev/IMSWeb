import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SeriesIconBackground } from "~/components/shared/series-icon-background"

function readTransform(element: Element) {
  const values = element
    .getAttribute("style")
    ?.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) rotate\(([-\d.]+)deg\)/)

  if (!values) throw new Error("Expected the motif to have a transform")
  return values.slice(1).map(Number)
}

describe("SeriesIconBackground", () => {
  let nextFrame: FrameRequestCallback | undefined

  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.75)
    vi.stubGlobal("innerWidth", 800)
    vi.stubGlobal("innerHeight", 600)
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback
        return 1
      })
    )
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders six-series motifs and advances them per frame", () => {
    const { container } = render(<SeriesIconBackground />)
    const background = screen.getByTestId("series-icon-background")
    const motifs = container.querySelectorAll("img.series-icon-motif")
    const firstMotif = motifs[0]

    expect(background).toHaveAttribute("aria-hidden", "true")
    expect(motifs).toHaveLength(12)
    expect(firstMotif).toHaveAttribute("src", "/brand/series/765pro.png")
    expect(firstMotif).toHaveAttribute("width", "193")
    expect(firstMotif).toHaveAttribute("height", "150")
    expect(firstMotif).toHaveStyle({ width: "82.5px", opacity: "0.505" })

    const [initialX, initialY, initialRotation] = readTransform(firstMotif)
    act(() => nextFrame?.(16))
    const [nextX, nextY, nextRotation] = readTransform(firstMotif)

    expect(nextX - initialX).toBeCloseTo(0.2)
    expect(nextY - initialY).toBeCloseTo(0.2)
    expect(nextRotation - initialRotation).toBeCloseTo(0.1)

    act(() => nextFrame?.(24))
    expect(readTransform(firstMotif)).toEqual([nextX, nextY, nextRotation])
  })

  it("repels a nearby motif from the pointer", () => {
    const { container } = render(<SeriesIconBackground />)
    const firstMotif = container.querySelector(".series-icon-motif")
    if (!firstMotif) throw new Error("Expected a background motif")

    const [initialX, initialY] = readTransform(firstMotif)
    fireEvent.pointerMove(document, {
      clientX: initialX + 20,
      clientY: initialY + 20,
    })
    act(() => nextFrame?.(16))
    const [repelledX] = readTransform(firstMotif)

    expect(repelledX - initialX).toBeGreaterThan(0.2)
  })

  it("keeps the motifs static when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))

    const { container } = render(<SeriesIconBackground />)
    const firstMotif = container.querySelector(".series-icon-motif")

    expect(firstMotif?.getAttribute("style")).toContain("translate3d(")
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
