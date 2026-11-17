import { describe, expect, it } from "vitest"
import {
  exchangeNavigationLayout,
  navigationDockBottom,
  navigationInline,
  type ExchangeNavigationLayout,
} from "~/pages/community/exchange/components/exchange-navigation-layout"

const viewport = { width: 440, height: 956 }
const host = { x: 0, y: 0, ...viewport }
const base: ExchangeNavigationLayout = {
  layoutGeneration: 10,
  revision: 1,
  route: "/community/exchange",
  available: true,
  visible: true,
  viewport,
  inline: { x: 20, width: 400 },
  provenance: "native-public-layout-calibrated",
}
const event = (value: unknown) => new CustomEvent("layout", { detail: value })

describe("DOM navigation docking", () => {
  it.each([
    { inset: 0, offset: 24, body: 58, fallback: 96 },
    { inset: 24, offset: 24, body: 58, fallback: 120 },
    { inset: 34, offset: 25, body: 58, fallback: 130 },
    { inset: 34, offset: 25, body: 72.5, fallback: 151 },
  ])(
    "counts navigation safe area only once at $inset inset / $body body",
    ({ offset, body, fallback }) => {
      const navigation = {
        x: 20,
        y: 956 - offset - body,
        width: 400,
        height: body,
      }
      const bottom = navigationDockBottom(host, 956, navigation, fallback)
      expect(956 - bottom).toBe(navigation.y - 12)
      // A downward correction must replace, not min with, the old clearance.
      expect(bottom).toBeLessThan(fallback)
    }
  )
  it("converts an offset host exactly once", () => {
    expect(
      navigationDockBottom(
        { x: 0, y: 47, width: 440, height: 909 },
        956,
        { x: 20, y: 873, width: 400, height: 58 },
        130
      )
    ).toBe(95)
  })
  it("keeps the fallback for absent, invalid or keyboard-clipped navigation", () => {
    for (const navigation of [
      undefined,
      { x: 20, y: NaN, width: 400, height: 58 },
      { x: 20, y: 500, width: 400, height: 0 },
      { x: 20, y: -1, width: 400, height: 58 },
      { x: 20, y: 873, width: 400, height: 58 },
    ])
      expect(navigationDockBottom(host, 600, navigation, 368)).toBe(368)
  })
})

describe("exchange navigation layout", () => {
  it("accepts an optional safe-area-excluded native body height", () => {
    const measured = { ...base, bodyHeight: 52 }
    expect(exchangeNavigationLayout(event(measured), viewport, null)).toEqual(
      measured
    )
  })
  it("uses actual DOM navigation for a native-search/DOM-navigation mix", () => {
    expect(
      navigationInline(
        host,
        viewport,
        { x: 28, y: 880, width: 384, height: 64 },
        base
      )
    ).toEqual({ x: 28, width: 384 })
  })
  it("uses calibrated native inline information for a DOM-search/native-navigation mix", () => {
    expect(navigationInline(host, viewport, undefined, base)).toEqual({
      x: 20,
      width: 400,
    })
  })
  it("retains same-viewport native inline width during suppression", () => {
    expect(
      navigationInline(host, viewport, undefined, { ...base, visible: false })
    ).toEqual({ x: 20, width: 400 })
    expect(
      navigationInline(host, viewport, undefined, {
        ...base,
        available: false,
        visible: false,
        inline: null,
      })
    ).toBeUndefined()
  })
  it("accepts restore with a newer revision, and rejects delayed old layouts", () => {
    const restored = { ...base, revision: 3 }
    expect(
      exchangeNavigationLayout(event(restored), viewport, {
        ...base,
        visible: false,
        revision: 2,
      })
    ).toEqual(restored)
    expect(exchangeNavigationLayout(event(base), viewport, restored)).toBeNull()
    expect(
      exchangeNavigationLayout(
        event({ ...base, layoutGeneration: 9, revision: 100 }),
        viewport,
        base
      )
    ).toBeNull()
  })
  it("invalidates old geometry after rotation and accepts current viewport binding", () => {
    const rotated = { width: 956, height: 440 }
    expect(
      navigationInline({ x: 0, y: 0, ...rotated }, rotated, undefined, base)
    ).toBeUndefined()
    expect(exchangeNavigationLayout(event(base), rotated, null)).toBeNull()
    const current = {
      ...base,
      revision: 2,
      viewport: rotated,
      inline: { x: 47, width: 862 },
    }
    expect(exchangeNavigationLayout(event(current), rotated, base)).toEqual(
      current
    )
  })
  it("leaves absent events available to the renderer's supported fallback", () => {
    expect(navigationInline(host, viewport, undefined, null)).toBeUndefined()
    expect(
      exchangeNavigationLayout(new Event("layout"), viewport, null)
    ).toBeNull()
  })
  it.each([
    { inline: { x: -1, width: 400 } },
    { inline: { x: 20, width: Infinity } },
    { inline: { x: 20, width: 43 } },
    { inline: { x: 20, width: 440 } },
    { layoutGeneration: -1 },
    { revision: 1.5 },
    { route: "/" },
    { provenance: "outer-AX-frame" },
    { available: false },
    { bodyHeight: NaN },
    { bodyHeight: 43 },
    { bodyHeight: 957 },
  ])("rejects invalid or unrelated information %j", (change) => {
    expect(
      exchangeNavigationLayout(event({ ...base, ...change }), viewport, null)
    ).toBeNull()
  })
})
