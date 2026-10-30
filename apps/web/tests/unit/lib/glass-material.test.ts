import { describe, expect, it } from "vitest"

import { readAppStylesheet } from "@/tests/unit/support/stylesheet-source"

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
