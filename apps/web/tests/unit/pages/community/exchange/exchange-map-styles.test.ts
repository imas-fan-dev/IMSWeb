import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const mapStylesheet = readFileSync(
  resolve(
    process.cwd(),
    "app/pages/community/exchange/exchange-office-map.css"
  ),
  "utf8"
)
const appStylesheet = readFileSync(
  resolve(process.cwd(), "app/app.css"),
  "utf8"
)

/**
 * Slices one balanced `{ ... }` block so an assertion can be scoped to the
 * selector it belongs to. Searching the whole file would match neighbouring
 * rules and pass for the wrong reason.
 */
function blockBody(source: string, opener: string) {
  const start = source.indexOf(opener)
  expect(start, `${opener} is missing`).toBeGreaterThan(-1)

  let depth = 0
  for (let index = source.indexOf("{", start); index < source.length; index++) {
    if (source[index] === "{") depth += 1
    else if (source[index] === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`${opener} is not closed`)
}

describe("exchange map stylesheet", () => {
  it("leaves no MapLibre control styling behind", () => {
    // Zoom, compass and the attribution control are gone, so any surviving
    // `.maplibregl-ctrl*` rule is dead CSS that would silently return with the
    // next control somebody adds.
    expect(mapStylesheet).not.toMatch(/\.maplibregl-ctrl/)
    expect(appStylesheet).not.toMatch(
      /\[data-exchange-office-map\][^{]*\.maplibregl-ctrl/
    )
  })

  it("hides both DOM twins once the native control path is live", () => {
    // `data-native-glass="controls"` is written by the provider only after the
    // plugin answers `supported: true`; this rule is the only thing that keeps
    // the DOM twins out of the layout. Losing it would double every control on
    // iOS 26 with nothing else failing.
    const body = blockBody(
      appStylesheet,
      'html[data-native-glass="controls"] [data-native-glass-control],'
    )

    expect(body).toContain(
      'html[data-native-glass="controls"] [data-native-glass-twin]'
    )
    expect(body).toContain("display: none")
    expect(body).not.toMatch(/opacity:\s*0\b/)
  })

  it("reuses the shared glass tokens on the map surfaces", () => {
    const body = blockBody(
      mapStylesheet,
      ".exchange-map-app-control,\n.exchange-map-app-surface {"
    )

    expect(body).toContain("var(--glass-blur)")
    expect(body).toContain("var(--glass-saturate)")
    // A literal blur or saturation here would be the fourth private copy of
    // the same recipe, which drifts the moment app.css changes.
    expect(body).not.toMatch(/blur\(\s*\d/)
    expect(body).not.toMatch(/saturate\(\s*\d/)
  })

  it("falls back to an opaque map surface when transparency is unwanted", () => {
    const body = blockBody(
      mapStylesheet,
      "@media (prefers-reduced-transparency: reduce) {"
    )

    expect(body).toContain("backdrop-filter: none")
    expect(body).toContain("rgb(255 255 255 / 98%)")
    expect(body).not.toMatch(/backdrop-filter: blur/)
  })
})
