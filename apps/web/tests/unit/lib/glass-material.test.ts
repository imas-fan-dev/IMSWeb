import { describe, expect, it } from "vitest"

import {
  readAppStylesheet,
  readStyleSheetFile,
} from "@/tests/unit/support/stylesheet-source"

const stylesheet = readAppStylesheet()

describe("glass accessibility and list performance", () => {
  it("keeps the content variant free of backdrop-filter", () => {
    const start = stylesheet.indexOf("  .glass-quiet {")
    expect(start).toBeGreaterThan(-1)
    expect(
      stylesheet.slice(start, stylesheet.indexOf("\n  }", start))
    ).not.toContain("backdrop-filter")
  })

  it("falls back to solid surfaces when transparency is unwanted", () => {
    expect(stylesheet).toContain(
      "@media (prefers-reduced-transparency: reduce)"
    )
    expect(stylesheet).toContain("@media (forced-colors: active)")
    expect(stylesheet).toContain(
      "@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))"
    )
  })

  it("collapses to an instant state change under reduced motion", () => {
    const reduced = stylesheet.slice(
      stylesheet.indexOf("@media (prefers-reduced-motion: reduce)")
    )
    for (const selector of [
      ".glass-lens,",
      ".glass-lens-skin,",
      '.glass-tab[aria-current="page"] [data-glass-tab-icon]',
      ".glass-tab:active",
      ".glass-control[data-glass-pressed]",
      ".glass-tab[data-glass-releasing]",
      ".glass-control[data-glass-exiting]",
    ]) {
      expect(reduced).toContain(selector)
    }
  })
})

describe("Android tab drag material", () => {
  it("scopes direct manipulation and reduced deformation to the Android capsule", () => {
    expect(stylesheet).toContain("[data-android-tab-drag] .glass-tab")
    expect(stylesheet).toContain("touch-action: pan-y")
    const start = stylesheet.indexOf("/* Android App direct manipulation")
    const android = stylesheet.slice(start)
    expect(android).toContain("--android-tab-index")
    expect(android).toContain("@media (prefers-reduced-motion: reduce)")
    expect(android).toContain("transform: none")
    expect(android.slice(0, android.indexOf("\n}\n") + 3)).not.toContain(
      "backdrop-filter"
    )
  })
})

describe("Android map navigation material", () => {
  it("matches collapsed search frosting and shadow without changing geometry or motion", () => {
    const glass = readStyleSheetFile("styles/glass.css")
    const map = readStyleSheetFile(
      "pages/community/exchange/maps/exchange-office-map.css"
    )
    const start = glass.indexOf("  [data-android-map-glass] {")
    expect(start).toBeGreaterThan(-1)
    const material = glass.slice(start, glass.indexOf("\n  }", start))
    const searchStart = map.lastIndexOf(
      "  .exchange-search-card[data-app-search] {"
    )
    expect(searchStart).toBeGreaterThan(-1)
    const search = map.slice(searchStart, map.indexOf("\n  }", searchStart))
    for (const token of [
      "background",
      "foreground",
      "muted-foreground",
      "glass-rgb",
      "glass-highlight",
      "glass-edge",
    ]) {
      const declaration = search.match(new RegExp(`--${token}: [^;]+;`))?.[0]
      expect(declaration).toBeDefined()
      expect(material).toContain(declaration)
    }
    const collapsedStart = map.lastIndexOf("  .exchange-map-app-glass,")
    expect(collapsedStart).toBeGreaterThan(-1)
    const collapsed = map.slice(
      collapsedStart,
      map.indexOf("\n  }", collapsedStart)
    )
    const shadow = collapsed
      .match(/box-shadow:([^;]+);/)?.[1]
      .trim()
      .split("\n")
      .at(-1)
      ?.trim()
    expect(shadow).toBeDefined()
    expect(material).toContain(`--glass-shadow: ${shadow};`)
    expect(collapsed).toContain("var(--glass-alpha-bar)")
    expect(collapsed).toContain("blur(var(--glass-blur))")
    expect(collapsed).toContain("saturate(var(--glass-saturate))")
    expect(material).toContain("background-image: none")
    expect(material).not.toMatch(
      /--glass-alpha:|width:|height:|padding:|transform:|transition:|animation:/
    )
    // Retain shared blur/saturation, opaque and forced-color fallbacks.
    expect(stylesheet).toContain("backdrop-filter: blur(var(--glass-blur))")
    expect(stylesheet).toContain("background-color: var(--background)")
    expect(stylesheet).toContain("border: 1px solid CanvasText")
  })
})
