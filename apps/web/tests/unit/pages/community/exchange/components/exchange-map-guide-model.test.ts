import { describe, expect, it } from "vitest"
import {
  placeMapGuide,
  type GuideRect,
} from "~/pages/community/exchange/components/exchange-map-guide-model"

const viewport = { x: 0, y: 0, width: 1440, height: 900 }
const search = { x: 16, y: 80, width: 360, height: 54 }
const defaults = {
  viewport,
  target: search,
  naturalHeight: 208,
  actionsHeight: 60,
  initial: false,
  compact: false,
}

function expectInside(rect: GuideRect, boundary: GuideRect) {
  expect(rect.x).toBeGreaterThanOrEqual(boundary.x)
  expect(rect.y).toBeGreaterThanOrEqual(boundary.y)
  expect(rect.x + rect.width).toBeLessThanOrEqual(
    boundary.x + boundary.width + 0.001
  )
  expect(rect.y + rect.height).toBeLessThanOrEqual(
    boundary.y + boundary.height + 0.001
  )
}

describe("map guide placement", () => {
  it("centers the introduction and places subsequent cards beside their targets", () => {
    const first = placeMapGuide({ ...defaults, initial: true })
    expect(first.placement).toBe("center")
    expect(first.card.x + first.card.width / 2).toBe(720)
    expect(first.card.y + first.card.height / 2).toBe(450)
    const next = placeMapGuide(defaults)
    expect(next.placement).toBe("right")
    expect(next.card.x).toBeGreaterThan(search.x + search.width)
    const movedTarget = { ...search, y: 400, height: 44 }
    const moved = placeMapGuide({
      ...defaults,
      target: movedTarget,
      naturalHeight: 168,
    })
    expect(moved.card.y).toBeGreaterThan(next.card.y)
    expect(moved.card.height).toBeLessThan(next.card.height)
    expect(moved.spotlight?.height).toBe(54)
  })

  it("uses the other side near a desktop edge", () => {
    const target = { x: 1160, y: 200, width: 240, height: 44 }
    const layout = placeMapGuide({ ...defaults, target })
    expect(layout.placement).toBe("left")
    expect(layout.card.x + layout.card.width).toBeLessThan(target.x)
    expectInside(layout.card, viewport)
  })

  it("keeps compact cards on a stable horizontal axis while following targets vertically", () => {
    const phone = { x: 0, y: 47, width: 390, height: 763 }
    const top = placeMapGuide({
      ...defaults,
      viewport: phone,
      compact: true,
      target: { x: 140, y: 80, width: 224, height: 44 },
    })
    const bottom = placeMapGuide({
      ...defaults,
      viewport: phone,
      compact: true,
      target: { x: 140, y: 720, width: 224, height: 44 },
    })
    expect(top.placement).toBe("below")
    expect(bottom.placement).toBe("above")
    expect(top.card.x).toBe(bottom.card.x)
    expect(top.card.width).toBe(bottom.card.width)
    expect(top.card.y).not.toBe(bottom.card.y)
    expectInside(top.card, phone)
    expectInside(bottom.card, phone)
  })

  it("makes room for wrapped actions and scrolls long copy on a small screen", () => {
    const layout = placeMapGuide({
      ...defaults,
      viewport: { x: 0, y: 0, width: 320, height: 568 },
      target: { x: 68, y: 480, width: 240, height: 44 },
      compact: true,
      naturalHeight: 720,
      actionsHeight: 112,
    })
    expect(layout.placement).toBe("above")
    expect(layout.scrollContent).toBe(true)
    expect(layout.scrollWholeCard).toBe(false)
    expect(layout.card.height).toBeGreaterThan(112 + 64)
    expect(layout.card.y + layout.card.height).toBeLessThan(480)
  })

  it("uses a panned visual viewport and falls back safely when the target is outside it", () => {
    const keyboardViewport = { x: 8, y: 320, width: 374, height: 250 }
    const layout = placeMapGuide({
      ...defaults,
      viewport: keyboardViewport,
      compact: true,
      target: { x: 16, y: 740, width: 350, height: 52 },
      naturalHeight: 400,
    })
    expectInside(layout.card, keyboardViewport)
    expect(layout.spotlight).toBeNull()
    expect(layout.placement).toBe("center")
    expect(layout.scrollContent).toBe(true)
  })

  it("can scroll the entire card if even its footer cannot fit comfortably", () => {
    const tiny = { x: 0, y: 0, width: 240, height: 140 }
    const layout = placeMapGuide({
      ...defaults,
      viewport: tiny,
      compact: true,
      naturalHeight: 480,
      actionsHeight: 112,
    })
    expectInside(layout.card, tiny)
    expect(layout.scrollWholeCard).toBe(true)
  })

  it("keeps the card and spotlight within portrait, landscape, zoomed and offset bounds", () => {
    for (const width of [240, 320, 375, 390, 430, 768, 844, 1024, 1440]) {
      for (const height of [224, 360, 390, 568, 844, 900]) {
        const bounds = { x: 12, y: 34, width, height }
        for (const initial of [false, true]) {
          for (const naturalHeight of [168, 260, 720]) {
            for (const y of [-48, 34, 130, height - 30, height + 100]) {
              const layout = placeMapGuide({
                ...defaults,
                viewport: bounds,
                target: { x: width - 200, y, width: 240, height: 44 },
                compact: width < 1024,
                initial,
                naturalHeight,
              })
              expectInside(layout.card, bounds)
              if (layout.spotlight) expectInside(layout.spotlight, bounds)
            }
          }
        }
      }
    }
  })
})
