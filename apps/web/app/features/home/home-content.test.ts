import { describe, expect, it } from "vitest"

import {
  friendLinks,
  portalItems,
  seriesItems,
  supportLinks,
} from "./home-content"

describe("legacy home content migration", () => {
  it("keeps the series wall free of navigation configuration", () => {
    expect(seriesItems.every((item) => !("href" in item))).toBe(true)
  })

  it("preserves every series wall hover image", () => {
    expect(seriesItems.map((item) => item.image)).toEqual([
      "/assets/images/Production/765intro.png",
      "/assets/images/Production/Cinderellaintro.png",
      "/assets/images/Production/Millionintro.png",
      "/assets/images/Production/Sidemintro.png",
      "/assets/images/Production/Shinyintro.png",
      "/assets/images/Production/Gakuenintro.png",
    ])
  })

  it("preserves the nine navigator destinations", () => {
    expect(portalItems.map((item) => item.href)).toEqual([
      "/producermap.html",
      "/ProducerNameCard.html",
      "/WOWSIntroduction.html",
      "/game.html",
      "/Event.html",
      "/wiki/",
      "/runninggame/index.html",
      "/timeline.html",
      "/live.html",
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
