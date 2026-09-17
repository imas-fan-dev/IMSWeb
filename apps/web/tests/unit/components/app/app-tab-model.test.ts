import { describe, expect, it } from "vitest"

import {
  APP_TABS,
  appTabIdForPathname,
  appTabIndexForPathname,
  resolveAppBackTarget,
} from "~/components/app/app-tab-model"

describe("app tab route ownership", () => {
  it("keeps the five primary roots in their configured order", () => {
    expect(APP_TABS.map((tab) => tab.to)).toEqual([
      "/",
      "/community",
      "/community/exchange",
      "/apps",
      "/account/me",
    ])
  })

  it.each([
    ["/", "home"],
    ["/information/42", "home"],
    ["/events", "community"],
    ["/events/42", "community"],
    ["/community", "community"],
    ["/producer-map", "community"],
    ["/community/cards", "community"],
    ["/community/cards/submissions/42", "community"],
    ["/community/exchange", "map"],
    ["/community/exchange/offices/tokyo", "map"],
    ["/community/exchange/meal", "map"],
    ["/apps", "resources"],
    ["/wiki/modern", "resources"],
    ["/story/modern/42", "resources"],
    ["/works/sample", "resources"],
    ["/chronicle/42", "resources"],
    ["/recommendations", "resources"],
    ["/live", "resources"],
    ["/tier-list", "resources"],
    ["/packages/sample", "resources"],
    ["/account/login", "account"],
    ["/account/me/profile", "account"],
    ["/community/exchange/me", "account"],
    ["/community/exchange/me/profile", "account"],
    ["/about", "account"],
  ] as const)("assigns %s to %s", (pathname, tab) => {
    expect(appTabIdForPathname(pathname)).toBe(tab)
  })

  it("normalizes trailing slashes and leaves unknown routes unowned", () => {
    expect(appTabIdForPathname("/apps/")).toBe("resources")
    expect(appTabIdForPathname("/community/exchange/")).toBe("map")
    expect(appTabIdForPathname("/community/exchange-other")).toBe("community")
    for (const pathname of ["/missing", "/accounting", "/wiki-other"]) {
      expect(appTabIdForPathname(pathname)).toBeNull()
      expect(appTabIndexForPathname(pathname)).toBe(-1)
    }
  })
})

describe("app back tree", () => {
  it.each([
    ["/", { kind: "root" }],
    ["/community", { kind: "root" }],
    ["/community/", { kind: "root" }],
    ["/community/exchange", { kind: "root" }],
    ["/apps", { kind: "root" }],
    ["/apps/", { kind: "root" }],
    ["/account/me", { kind: "root" }],
    ["/account/me/", { kind: "root" }],
  ] as const)("ends the tree at root %s", (pathname, target) => {
    expect(resolveAppBackTarget(pathname)).toEqual(target)
  })

  it.each([
    ["/account/me/profile", "/account/me"],
    ["/account/me/cards", "/account/me"],
    ["/account/me/favorites/", "/account/me"],
    ["/account/security", "/account/me"],
    ["/account/security/", "/account/me"],
    ["/account/login", "/account/me"],
    ["/account/register", "/account/me"],
    ["/account/password-reset", "/account/me"],
    ["/about", "/account/me"],
    ["/community/exchange/me", "/account/me"],
    ["/community/exchange/me/profile", "/account/me"],
    ["/community/exchange/offices/tokyo", "/community/exchange"],
    ["/community/cards/submissions/42", "/community/cards"],
    ["/community/cards", "/community"],
    ["/community/cards/", "/community"],
    ["/events", "/community"],
    ["/events/42", "/events"],
    ["/producer-map", "/community"],
    ["/community/nested", "/community"],
    ["/wiki/modern", "/apps"],
    ["/wiki", "/apps"],
    ["/wiki?agency=X", "/apps"],
    ["/story/modern", "/wiki"],
    ["/story", "/wiki"],
    ["/works", "/apps"],
    ["/works/765", "/works"],
    ["/packages/sample", "/works"],
    ["/chronicle", "/apps"],
    ["/chronicle/42", "/chronicle"],
    ["/tier-list", "/apps"],
    ["/live", "/apps"],
    ["/recommendations", "/apps"],
    ["/information/42", "/"],
  ] as const)("climbs %s to %s", (pathname, parent) => {
    expect(resolveAppBackTarget(pathname)).toEqual({
      kind: "parent",
      href: parent,
    })
  })

  it("treats query and hash changes as the same tree node", () => {
    expect(resolveAppBackTarget("/wiki?agency=X")).toEqual(
      resolveAppBackTarget("/wiki")
    )
    expect(
      resolveAppBackTarget("/community/exchange/me?section=profile")
    ).toEqual({ kind: "parent", href: "/account/me" })
    expect(resolveAppBackTarget("/account/me/cards#token=abc")).toEqual({
      kind: "parent",
      href: "/account/me",
    })
  })

  it("reports routes outside the App tree as unknown", () => {
    expect(resolveAppBackTarget("/nonsense")).toEqual({ kind: "unknown" })
    expect(resolveAppBackTarget("/admin/login")).toEqual({ kind: "unknown" })
  })
})
