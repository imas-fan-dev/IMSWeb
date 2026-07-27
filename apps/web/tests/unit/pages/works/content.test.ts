import { describe, expect, it } from "vitest"

import {
  IDOL_FONT_URL,
  WORK_CHARACTER_IMAGE_URLS,
} from "~/pages/works/brand-assets"
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

  it("loads series artwork and the display font directly from public R2 URLs", () => {
    const expectedOrigin = "https://imas-assets.texasoct.tech/"
    const characterImages = workEntries
      .map((entry) => entry.characterImage)
      .filter((url): url is string => Boolean(url))

    expect(characterImages).toHaveLength(6)
    expect(characterImages).toEqual(Object.values(WORK_CHARACTER_IMAGE_URLS))
    expect(
      [...characterImages, IDOL_FONT_URL].every((url) =>
        url.startsWith(expectedOrigin)
      )
    ).toBe(true)
    expect(
      [...characterImages, IDOL_FONT_URL].some((url) =>
        url.includes("/assets/")
      )
    ).toBe(false)
  })
})
