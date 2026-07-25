import { describe, expect, it } from "vitest"

import { getWorkEntry, workEntries } from "~/pages/works/works-content"

describe("works content", () => {
  it("keeps every migrated legacy destination unique", () => {
    const slugs = workEntries.map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs).toEqual([
      "765",
      "cg",
      "ml",
      "sidem",
      "sc",
      "gakuen",
      "games",
      "wows",
    ])
  })

  it("resolves known works and rejects unknown slugs", () => {
    expect(getWorkEntry("sc")?.title).toBe("SHINY COLORS")
    expect(getWorkEntry("unknown")).toBeUndefined()
  })

  it("keeps Unity outside the React asset bundle", () => {
    const games = getWorkEntry("games")
    expect(games?.links).toEqual([
      { label: "打开板板大冒险", href: "/runninggame/" },
    ])
  })
})
