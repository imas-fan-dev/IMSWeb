import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { NamecardMediaPreview } from "~/pages/admin/cards/namecard-media-preview"
import { renderPage } from "@/tests/unit/support/harness"

function setNaturalSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, "naturalWidth", { configurable: true, value: width })
  Object.defineProperty(element, "naturalHeight", { configurable: true, value: height })
}

function renderPreview() {
  renderPage(
    <NamecardMediaPreview
      frontImageUrl="/uploads/namecard/original/front.webp"
      backImageUrl="/uploads/namecard/original/back.webp"
      altBase="名片 #1"
    />,
    { route: "/admin/cards" },
  )
  const [front, back] = screen.getAllByRole("img")
  const container = front?.parentElement?.parentElement ?? null
  return { front, back, container }
}

describe("NamecardMediaPreview", () => {
  test("stacks a landscape card front over back", () => {
    const { front, container } = renderPreview()

    setNaturalSize(front as HTMLImageElement, 1920, 1080)
    fireEvent.load(front)

    expect(container).toHaveAttribute("data-namecard-orientation", "landscape")
    expect(container?.className).toContain("grid-rows-2")
  })

  test("places the two sides of a portrait card side by side", () => {
    const { front, container } = renderPreview()

    setNaturalSize(front as HTMLImageElement, 1080, 1920)
    fireEvent.load(front)

    expect(container).toHaveAttribute("data-namecard-orientation", "portrait")
    expect(container?.className).toContain("grid-cols-2")
  })

  test("follows the front side when the back side disagrees", () => {
    const { front, back, container } = renderPreview()

    setNaturalSize(front as HTMLImageElement, 1920, 1080)
    fireEvent.load(front)
    setNaturalSize(back as HTMLImageElement, 1080, 1920)
    fireEvent.load(back)

    expect(container).toHaveAttribute("data-namecard-orientation", "landscape")
  })

  test("renders both sides at their natural ratio instead of cropping", () => {
    const { front, container } = renderPreview()

    expect(front.className).toContain("object-contain")
    expect(front.className).toContain("max-h-full")
    expect(front.className).toContain("max-w-full")
    expect(front.className).not.toContain("object-cover")
    expect(front).toHaveAttribute("alt", "名片 #1正面")
    expect(container?.className).toContain("aspect-13/10")
  })
})
