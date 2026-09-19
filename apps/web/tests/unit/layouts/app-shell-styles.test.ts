import { describe, expect, it } from "vitest"

import { readAppStylesheet } from "@/tests/unit/support/stylesheet-source"

const appStylesheet = readAppStylesheet()

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

describe("App shell stylesheet", () => {
  it("paints the App document canvas through Android edge-to-edge gesture navigation", () => {
    const body = blockBody(appStylesheet, `html[data-app-target="app"] {`)

    expect(body).toContain("background-color: var(--background)")
    expect(body).toContain("touch-action: pan-x pan-y")
  })
})
