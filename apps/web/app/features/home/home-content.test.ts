import { describe, expect, it } from "vitest"

import {
  friendLinks,
  portalItems,
  seriesItems,
  supportLinks,
} from "./home-content"

describe("home content", () => {
  it("keeps the series wall free of navigation configuration", () => {
    expect(seriesItems.every((item) => !("href" in item))).toBe(true)
  })

  it("keeps the series wall independent of external media", () => {
    expect(seriesItems).toHaveLength(6)
    expect(seriesItems.every((item) => !("image" in item))).toBe(true)
  })

  it("uses only current React destinations", () => {
    expect(portalItems.map((item) => item.href)).toEqual([
      "/events",
      "/recommendations",
      "/community",
      "/works",
      "/live",
      "/about",
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
