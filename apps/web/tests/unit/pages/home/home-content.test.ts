import { describe, expect, it } from "vitest"

import {
  friendLinks,
  portalItems,
  seriesItems,
  supportLinks,
} from "~/pages/home/home-content"

describe("home content", () => {
  it("links every series band to its restored wall image", () => {
    expect(seriesItems.map((item) => item.image)).toEqual([
      "/brand/series/wall/765pro.png",
      "/brand/series/wall/cinderella-girls.png",
      "/brand/series/wall/million-live.png",
      "/brand/series/wall/sidem.png",
      "/brand/series/wall/shiny-colors.png",
      "/brand/series/wall/gakuen.png",
    ])
  })

  it("uses the six restored series-wall images", () => {
    expect(seriesItems).toHaveLength(6)
    expect(seriesItems.map((item) => item.image)).toEqual([
      "/brand/series/wall/765pro.png",
      "/brand/series/wall/cinderella-girls.png",
      "/brand/series/wall/million-live.png",
      "/brand/series/wall/sidem.png",
      "/brand/series/wall/shiny-colors.png",
      "/brand/series/wall/gakuen.png",
    ])
  })

  it("uses only current React destinations", () => {
    expect(portalItems.map((item) => item.href)).toEqual([
      "/events",
      "/recommendations",
      "/community",
      "/works",
      "/live",
      "/about",
      "/chronicle",
    ])
  })

  it("imports all friend links", () => {
    expect(friendLinks).toHaveLength(6)
    expect(friendLinks[0]?.href).toBe("https://sp.idolmaster.top/")
    expect(friendLinks[5]?.href).toContain("space.bilibili.com/41356186")
  })

  it("keeps site-support entries as static site configuration", () => {
    expect(supportLinks).toHaveLength(3)
  })
})
