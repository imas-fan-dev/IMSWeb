import { describe, expect, it } from "vitest"

import { seriesItems } from "~/pages/home/home-content"

describe("home content", () => {
  it("links every series band to its optimized wall image", () => {
    expect(seriesItems.map((item) => item.image)).toEqual([
      "/brand/series/wall/765pro.webp",
      "/brand/series/wall/cinderella-girls.webp",
      "/brand/series/wall/million-live.webp",
      "/brand/series/wall/sidem.webp",
      "/brand/series/wall/shiny-colors.webp",
      "/brand/series/wall/gakuen.webp",
    ])
  })

  it("uses the six optimized series-wall images with work links", () => {
    expect(seriesItems).toHaveLength(6)
    expect(seriesItems.map((item) => item.image)).toEqual([
      "/brand/series/wall/765pro.webp",
      "/brand/series/wall/cinderella-girls.webp",
      "/brand/series/wall/million-live.webp",
      "/brand/series/wall/sidem.webp",
      "/brand/series/wall/shiny-colors.webp",
      "/brand/series/wall/gakuen.webp",
    ])
    expect(seriesItems.map((item) => item.href)).toEqual([
      "/works/765",
      "/works/cg",
      "/works/ml",
      "/works/sidem",
      "/works/sc",
      "/works/gakuen",
    ])
    expect(seriesItems.map((item) => item.icon)).toEqual([
      "/brand/series/wall/765pro.webp",
      "/brand/series/wall/cinderella-girls.webp",
      "/brand/series/wall/million-live.webp",
      "/brand/series/wall/sidem.webp",
      "/brand/series/wall/shiny-colors.webp",
      "/brand/series/wall/gakuen.webp",
    ])
  })
})
