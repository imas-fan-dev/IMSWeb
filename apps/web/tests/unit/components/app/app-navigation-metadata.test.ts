import { describe, expect, it } from "vitest"

import {
  appAncestryForPathname,
  appRouteOwnership,
} from "~/components/app/app-tab-model"
import { routeDescriptorsForTarget } from "~/route-metadata"

describe("App navigation metadata", () => {
  it("builds the smallest legal chain for a directly entered deep page", () => {
    expect(appAncestryForPathname("/works/765")?.hrefs).toEqual([
      "/apps",
      "/works",
      "/works/765",
    ])
    expect(appAncestryForPathname("/chronicle/42")?.hrefs).toEqual([
      "/apps",
      "/chronicle",
      "/chronicle/42",
    ])
    expect(appAncestryForPathname("/account/me/namecards")?.hrefs).toEqual([
      "/account/me",
      "/account/me/namecards",
    ])
  })

  it("keeps a tab root as a single entry, including its alias variants", () => {
    expect(appAncestryForPathname("/")?.hrefs).toEqual(["/"])
    expect(appAncestryForPathname("/community/exchange")?.hrefs).toEqual([
      "/community/exchange",
    ])
    expect(appAncestryForPathname("/wiki/modern")?.hrefs).toEqual([
      "/apps",
      "/wiki/modern",
    ])
  })

  it("marks content details as derived while account and directory pages are global", () => {
    expect(appRouteOwnership("/events/42")?.derived).toBe(true)
    expect(appRouteOwnership("/community/exchange/offices/tokyo")?.derived).toBe(
      true
    )
    expect(appRouteOwnership("/information/42")?.derived).toBe(true)
    expect(appRouteOwnership("/account/me/namecards")?.derived).toBe(false)
    expect(appRouteOwnership("/apps")?.derived).toBe(false)
    expect(appRouteOwnership("/community/cards")?.derived).toBe(false)
  })

  it("keeps every App descriptor's metadata parent in sync with the fallback tree", async () => {
    const { resolveAppBackTarget } = await import(
      "~/components/app/app-tab-model"
    )
    for (const descriptor of routeDescriptorsForTarget("app")) {
      const navigation = descriptor.appNavigation
      if (!navigation || descriptor.path === "*") continue
      const samplePath = descriptor.index ? "/" : `/${descriptor.path}`
      const target = resolveAppBackTarget(samplePath)
      if (!navigation.parent) {
        expect(target.kind, samplePath).toBe("root")
        continue
      }
      expect(target, samplePath).toEqual({
        kind: "parent",
        href: navigation.parent,
      })
    }
  })
})
