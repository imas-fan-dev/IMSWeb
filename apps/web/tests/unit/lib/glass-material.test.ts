import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { seriesWallItems } from "~/lib/series-wall"

const stylesheet = readFileSync(resolve(process.cwd(), "app/app.css"), "utf8")
const designReference = readFileSync(
  resolve(process.cwd(), "DESIGN.md"),
  "utf8"
)

function ruleBody(selector: string) {
  const start = stylesheet.indexOf(`${selector} {`)
  expect(start, `${selector} is missing from app.css`).toBeGreaterThan(-1)
  return stylesheet.slice(start, stylesheet.indexOf("\n  }", start))
}

describe("liquid glass material", () => {
  it("keeps the full recipe on the floating surface", () => {
    const surface = ruleBody("  .glass-surface")

    // saturate() is what stops blurred glass from turning grey.
    expect(stylesheet).toContain(
      "backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))"
    )
    expect(stylesheet).toContain(
      "-webkit-backdrop-filter: blur(var(--glass-blur))"
    )
    expect(surface).toContain("inset 0 1px 0 0 var(--glass-highlight)")
    expect(surface).toContain("inset 0 0 0 1px var(--glass-edge)")
    expect(surface).toContain("var(--glass-shadow)")
  })

  it("defines the material in both themes", () => {
    for (const token of [
      "--glass-rgb",
      "--glass-alpha-bar",
      "--glass-alpha-panel",
      "--glass-alpha-rest",
      "--glass-highlight",
      "--glass-edge",
    ]) {
      const declarations = stylesheet.match(new RegExp(`${token}:`, "g")) as
        | string[]
        | null
      expect(
        declarations?.length,
        `${token} needs a light and a dark value`
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it("expresses interaction level as an opacity ladder", () => {
    expect(ruleBody("  .glass-control:hover")).toContain(
      "--glass-alpha: var(--glass-alpha-hover)"
    )
    expect(ruleBody("  .glass-control:active")).toContain(
      "--glass-alpha: var(--glass-alpha-active)"
    )
  })

  it("keeps the content variant free of backdrop-filter", () => {
    // .glass-quiet is the variant allowed inside long lists and tables, so it
    // must never create a compositing layer per row.
    expect(ruleBody("  .glass-quiet")).not.toContain("backdrop-filter")
  })

  it("maps every series to a franchise-tinted glass accent", () => {
    for (const series of seriesWallItems) {
      expect(stylesheet).toContain(`[data-glass-accent="${series.accent}"]`)
      expect(stylesheet).toContain(
        `--glass-accent: var(--franchise-${series.accent});`
      )
    }
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

  it("keeps the motion contract to four shared curves", () => {
    for (const easing of [
      "--ease-emphasized",
      "--ease-interactive",
      "--ease-ui",
      "--ease-card",
    ]) {
      expect(stylesheet).toContain(`${easing}:`)
    }
  })

  it("documents the material in the design reference", () => {
    expect(designReference).toContain("glass-blur")
    expect(designReference).toContain("glass-saturate")
    expect(designReference).toContain("## Materials")
  })
})
