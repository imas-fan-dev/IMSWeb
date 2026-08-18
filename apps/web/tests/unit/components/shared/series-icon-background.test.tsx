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
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(pointer: fine)" }))
    )
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
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("moves a reduced set of six-series motifs across the viewport", () => {
    const { container } = render(<SeriesIconBackground />)
    const background = screen.getByTestId("series-icon-background")
    const motifs = container.querySelectorAll("img.series-icon-motif")
    const firstMotif = motifs[0]

    expect(background).toHaveAttribute("aria-hidden", "true")
    expect(motifs).toHaveLength(12)
    expect(firstMotif).toHaveAttribute("src", "/brand/series/wall/765pro.webp")
    expect(firstMotif).toHaveAttribute("width", "585")
    expect(firstMotif).toHaveAttribute("height", "500")
    expect(firstMotif).toHaveStyle({ width: "119px", opacity: "0.370" })

    const [initialX, initialY, initialRotation] = readTransform(firstMotif)
    act(() => nextFrame?.(16))
    const [nextX, nextY, nextRotation] = readTransform(firstMotif)

    expect(nextX - initialX).toBeCloseTo(0.3)
    expect(nextY - initialY).toBeCloseTo(0.3)
    expect(nextRotation - initialRotation).toBeCloseTo(0.16)

    act(() => nextFrame?.(24))
    expect(readTransform(firstMotif)).toEqual([nextX, nextY, nextRotation])
  })

  it("repels a nearby motif without allowing unbounded acceleration", () => {
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

    expect(repelledX - initialX).toBeGreaterThan(0.3)
    expect(repelledX - initialX).toBeLessThanOrEqual(0.96)
  })

  it("keeps four motifs inactive on compact viewports", () => {
    vi.stubGlobal("innerWidth", 390)

    const { container } = render(<SeriesIconBackground />)
    const motifs = [...container.querySelectorAll(".series-icon-motif")]

    expect(
      motifs.filter((motif) => (motif as HTMLElement).hidden)
    ).toHaveLength(4)
    expect(motifs[0]).toHaveStyle({ width: "86px" })
  })

  it("keeps the motifs static when reduced motion is preferred", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }))
    )

    const { container } = render(<SeriesIconBackground />)
    const firstMotif = container.querySelector(".series-icon-motif")

    expect(firstMotif?.getAttribute("style")).toContain("translate3d(")
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
