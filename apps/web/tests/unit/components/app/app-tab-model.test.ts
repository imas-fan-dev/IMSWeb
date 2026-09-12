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
      "/events",
      "/apps",
      "/community/exchange",
      "/account/me",
    ])
  })

  it.each([
    ["/", "home"],
    ["/information/42", "home"],
    ["/events", "events"],
    ["/apps", "apps"],
    ["/wiki/modern", "apps"],
    ["/works/sample", "apps"],
    ["/community/cards", "apps"],
    ["/community/exchange", "map"],
    ["/community/exchange/offices/tokyo", "map"],
    ["/account/login", "account"],
    ["/account/me/profile", "account"],
    ["/community/exchange/me", "account"],
  ] as const)("assigns %s to %s", (pathname, tab) => {
    expect(appTabIdForPathname(pathname)).toBe(tab)
  })

  it("normalizes trailing slashes and leaves unknown routes unowned", () => {
    expect(appTabIdForPathname("/apps/")).toBe("apps")
    expect(appTabIdForPathname("/missing")).toBeNull()
    expect(appTabIndexForPathname("/missing")).toBe(-1)
  })
})
