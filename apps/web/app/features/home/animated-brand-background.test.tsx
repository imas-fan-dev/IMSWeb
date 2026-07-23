import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AnimatedBrandBackground } from "./animated-brand-background"

function readTransform(element: Element) {
  const values = element
    .getAttribute("style")
    ?.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)deg\)/)

  if (!values) throw new Error("Expected the motif to have a transform")
  return values.slice(1).map(Number)
}

describe("AnimatedBrandBackground", () => {
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

  it("uses the legacy count, random styling, and per-frame speed", () => {
    const { container } = render(<AnimatedBrandBackground />)
    const background = screen.getByTestId("home-brand-background")
    const motifs = container.querySelectorAll("img.home-brand-motif")
    const firstMotif = motifs[0]

    expect(background).toHaveAttribute("aria-hidden", "true")
    expect(motifs).toHaveLength(20)
    expect(firstMotif).toHaveAttribute(
      "src",
      "/assets/images/Production/Shinycolors.png"
    )
    expect(firstMotif).toHaveStyle({ width: "82.5px", opacity: "0.825" })

    const [initialX, initialY, initialRotation] = readTransform(firstMotif)
    act(() => nextFrame?.(16))
    const [nextX, nextY, nextRotation] = readTransform(firstMotif)

    expect(nextX - initialX).toBeCloseTo(0.2)
    expect(nextY - initialY).toBeCloseTo(0.2)
    expect(nextRotation - initialRotation).toBeCloseTo(0.1)
  })

  it("applies the legacy pointer repulsion inside 120 pixels", () => {
    const { container } = render(<AnimatedBrandBackground />)
    const firstMotif = container.querySelector("img.home-brand-motif")
    if (!firstMotif) throw new Error("Expected a background motif")

    const [initialX] = readTransform(firstMotif)
    fireEvent.mouseMove(document, { clientX: 550, clientY: 450 })
    act(() => nextFrame?.(16))
    const [repelledX] = readTransform(firstMotif)

    expect(repelledX - initialX).toBeCloseTo(0.2251)
  })
})
