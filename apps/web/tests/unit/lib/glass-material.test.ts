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

function keyframesBody(name: string) {
  const start = stylesheet.indexOf(`@keyframes ${name} {`)
  expect(start, `@keyframes ${name} is missing from app.css`).toBeGreaterThan(
    -1
  )
  return stylesheet.slice(start, stylesheet.indexOf("\n}", start))
}

/** Longhand properties declared inside a block, ignoring custom properties. */
function declaredProperties(body: string) {
  return [...body.matchAll(/^\s*([a-z][a-z-]*):/gm)].map((match) => match[1])
}

/*
 * Animating any of these re-blurs a translucent surface or forces layout on
 * every frame, which is what drops frames on low-end Android WebViews.
 */
const expensiveToAnimate = [
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "filter",
  "width",
  "height",
  "left",
  "top",
]

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

describe("navigation lens motion", () => {
  it("travels on translate rather than transform", () => {
    // Tailwind v4 emits translate-x-* as the independent `translate` property.
    // A transition naming `transform` here compiles fine and silently never
    // fires, which is exactly how the lens used to snap between slots.
    const lens = ruleBody("  .glass-lens")
    expect(lens).toContain(
      "translate var(--duration-ui) var(--ease-emphasized)"
    )
    expect(lens).toContain("opacity var(--duration-fast) var(--ease-ui)")
    expect(declaredProperties(lens)).not.toContain("transform")
  })

  it("scales the deformation with the distance travelled", () => {
    const skin = ruleBody("  .glass-lens-skin")
    // Zero travel has to collapse the keyframes to identity, or the lens pops
    // on first paint when there is no previous slot to come from.
    expect(skin).toContain("var(--glass-lens-travel, 0)")
    expect(skin).toContain("animation: glass-lens-travel")
    expect(skin).toContain("var(--duration-ui) var(--ease-emphasized)")
  })

  it("gives every navigation entry press feedback on a shared token", () => {
    const tab = ruleBody("  .glass-tab")
    expect(tab).toContain("--glass-tab-press")
    expect(tab).toContain(
      "transform var(--duration-fast) var(--ease-interactive)"
    )
    expect(ruleBody("  .glass-tab:active")).toContain(
      "transform: scale(var(--glass-tab-press))"
    )
  })

  it("keeps every navigation keyframe on transform alone", () => {
    for (const name of ["glass-lens-travel", "glass-tab-settle"]) {
      expect(new Set(declaredProperties(keyframesBody(name)))).toEqual(
        new Set(["transform"])
      )
    }
  })

  it("scopes contact feedback to explicitly interactive glass", () => {
    const passiveSheen = ruleBody("  .glass-control::after")
    expect(passiveSheen).toContain("transparent 42%")
    expect(declaredProperties(passiveSheen)).not.toContain("transform")
    expect(declaredProperties(passiveSheen)).not.toContain("animation")

    expect(stylesheet).toContain(
      ".glass-sheen[data-glass-interactive][data-glass-pressed]::after"
    )
    expect(stylesheet).not.toContain(
      "\n  .glass-sheen[data-glass-pressed]::after"
    )
    expect(stylesheet).not.toContain(".glass-sheen:focus-within::after")
    expect(stylesheet).toContain("@media (hover: hover) and (pointer: fine)")
    expect(stylesheet).toContain(
      ".glass-sheen[data-glass-interactive][data-glass-exiting]::after"
    )
    expect(
      new Set(declaredProperties(keyframesBody("glass-touch-glow")))
    ).toEqual(new Set(["opacity", "transform"]))
    expect(
      new Set(declaredProperties(keyframesBody("glass-touch-exit")))
    ).toEqual(new Set(["opacity", "transform"]))
    expect(
      new Set(declaredProperties(keyframesBody("glass-control-release")))
    ).toEqual(new Set(["transform"]))
    expect(ruleBody("  .glass-tab")).toContain("touch-action: none")
  })

  it("never animates a property that re-blurs or relayouts", () => {
    const animated = [
      ruleBody("  .glass-lens"),
      ruleBody("  .glass-lens-skin"),
      ruleBody("  .glass-tab"),
      ruleBody("  .glass-tab [data-glass-tab-icon]"),
      keyframesBody("glass-lens-travel"),
      keyframesBody("glass-tab-settle"),
      keyframesBody("glass-touch-glow"),
      keyframesBody("glass-touch-exit"),
      keyframesBody("glass-control-release"),
    ].join("\n")

    for (const property of expensiveToAnimate) {
      expect(
        animated,
        `${property} must stay out of navigation motion`
      ).not.toContain(property)
    }
  })

  it("collapses to an instant state change under reduced motion", () => {
    const reduced = stylesheet.slice(
      stylesheet.indexOf("@media (prefers-reduced-motion: reduce)")
    )
    // Both halves have to go: killing the travel transition while leaving the
    // deformation running would still animate the lens.
    expect(reduced).toContain(".glass-lens,")
    expect(reduced).toContain(".glass-lens-skin,")
    expect(reduced).toContain(
      '.glass-tab[aria-current="page"] [data-glass-tab-icon]'
    )
    expect(reduced).toContain(".glass-tab:active")
    expect(reduced).toContain(".glass-control[data-glass-pressed]")
    expect(reduced).toContain(".glass-tab[data-glass-releasing]")
    expect(reduced).toContain(".glass-control[data-glass-exiting]")
  })

  it("registers the lens components in the design reference", () => {
    for (const component of ["glass-lens:", "glass-lens-skin:", "glass-tab:"]) {
      expect(designReference).toContain(component)
    }
    expect(designReference).toContain("--glass-lens-travel")
  })
})
