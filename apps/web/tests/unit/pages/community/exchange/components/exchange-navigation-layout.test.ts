import { describe, expect, it } from "vitest"
import {
  exchangeNavigationLayout,
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

describe("exchange navigation layout", () => {
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
  ])("rejects invalid or unrelated information %j", (change) => {
    expect(
      exchangeNavigationLayout(event({ ...base, ...change }), viewport, null)
    ).toBeNull()
  })
})
