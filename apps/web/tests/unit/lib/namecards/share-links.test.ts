import { describe, expect, it } from "vitest"

import {
  NAMECARD_MANAGE_HREF,
  cardSharePath,
  quickSharePath,
  shareOwnerProfileHref,
} from "~/lib/namecards/share-links"

describe("share page paths", () => {
  it("keeps the two site shapes the API injects OGP for", () => {
    expect(cardSharePath("abcdefghijkl")).toBe("/exchange/card/abcdefghijkl")
    expect(quickSharePath("haruka")).toBe("/exchange/haruka")
    expect(quickSharePath("1")).toBe("/exchange/1")
    expect(NAMECARD_MANAGE_HREF).toBe("/account/me/namecards")
  })

  it("escapes params so odd values cannot break the path", () => {
    expect(cardSharePath("a b")).toBe("/exchange/card/a%20b")
    expect(quickSharePath("a/b")).toBe("/exchange/a%2Fb")
  })
})

describe("shareOwnerProfileHref", () => {
  it("prefers the public page slug over the numeric uid", () => {
    expect(shareOwnerProfileHref({ pageSlug: "haruka", uid: 42 })).toBe(
      "/user/haruka"
    )
    expect(shareOwnerProfileHref({ pageSlug: null, uid: 42 })).toBe("/user/42")
    // 空 / 只有空白的主页地址按「没设置」处理。
    expect(shareOwnerProfileHref({ pageSlug: "  ", uid: 42 })).toBe("/user/42")
  })
})
