import { describe, expect, it } from "vitest"

import {
  APP_TABS,
  appTabIdForPathname,
  appTabIndexForPathname,
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
