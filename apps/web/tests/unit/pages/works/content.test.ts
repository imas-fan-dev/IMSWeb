import { describe, expect, it } from "vitest"

import {
  IDOL_FONT_URL,
  WORK_CHARACTER_IMAGE_URLS,
} from "~/pages/works/brand-assets"
import {
  getWorkDestination,
  getWorkEntry,
  workEntries,
} from "~/pages/works/works-content"

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

  it("routes franchises to their Wiki project pages", () => {
    expect(
      workEntries.map((entry) => [entry.slug, getWorkDestination(entry)])
    ).toEqual([
      ["765", "/wiki/modern?agency=765PRO"],
      [
        "cg",
        "/wiki/modern?agency=%E7%81%B0%E5%A7%91%E5%A8%98%E5%A5%B3%E5%AD%A9",
      ],
      ["ml", "/wiki/modern?agency=%E7%99%BE%E4%B8%87%E7%8E%B0%E5%9C%BA"],
      ["sidem", "/wiki/modern?agency=SideM"],
      ["sc", "/wiki/modern?agency=%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9"],
      [
        "gakuen",
        "/wiki/modern?agency=%E5%AD%A6%E5%9B%AD%E5%81%B6%E5%83%8F%E5%A4%A7%E5%B8%88",
      ],
      ["games", "/works/games"],
      ["wows", "/works/wows"],
    ])
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
