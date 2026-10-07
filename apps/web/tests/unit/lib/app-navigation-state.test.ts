import { describe, expect, it } from "vitest"

import {
  appTabSnapshot,
  createAppNavigationState,
  hasUsableAppHistoryBack,
  observeAppHistoryCommit,
  rememberAppNavigationLocation,
  rememberAppTabSnapshot,
  updateAppNavigationIdentity,
} from "~/lib/app-navigation-state"

const location = (pathname: string, key: string, search = "", hash = "") => ({
  pathname,
  key,
  search,
  hash,
})

describe("App navigation memory", () => {
  it("keeps each section URL, pagination, hash and position independently", () => {
    const state = createAppNavigationState()
    rememberAppNavigationLocation(
      state,
      location("/community/cards", "cards", "?page=2&size=12", "#card-13"),
      812
    )
    rememberAppNavigationLocation(
      state,
      location("/wiki", "wiki", "?agency=765"),
      400
    )
    rememberAppNavigationLocation(state, location("/account/me", "me"), -1)
    expect(appTabSnapshot(state, "community")).toEqual({
      href: "/community/cards?page=2&size=12#card-13",
      scrollY: 812,
      routeKey: "cards",
    })
    expect(appTabSnapshot(state, "resources")?.scrollY).toBe(400)
    expect(appTabSnapshot(state, "account")?.scrollY).toBe(0)
    expect(appTabSnapshot(createAppNavigationState(), "community")).toBeNull()
  })

  it("rejects snapshots with another owner and normalizes non-finite positions", () => {
    const state = createAppNavigationState()
    rememberAppTabSnapshot(state, "community", {
      href: "/account/me",
      scrollY: NaN,
      routeKey: "old",
    })
    expect(appTabSnapshot(state, "community")).toBeNull()
    rememberAppNavigationLocation(state, location("/apps", "root"), Infinity)
    expect(appTabSnapshot(state, "resources")?.scrollY).toBe(0)
    expect(
      rememberAppNavigationLocation(state, location("/missing", "missing"), 42)
    ).toBeNull()
  })

  it("tracks actual history, including POP, replacement and truncated forward entries", () => {
    const state = createAppNavigationState()
    const cards = location("/community/cards", "cards")
    const me = location("/account/me", "me")
    const resumed = location("/community/cards", "resumed")
    observeAppHistoryCommit(state, "POP", cards)
    expect(hasUsableAppHistoryBack(state)).toBe(false)
    observeAppHistoryCommit(state, "PUSH", me)
    observeAppHistoryCommit(state, "PUSH", resumed)
    observeAppHistoryCommit(state, "PUSH", resumed)
    expect(state.history.entries).toHaveLength(3)
    expect(state.history.entries[state.history.index - 1]?.href).toBe(
      "/account/me"
    )
    observeAppHistoryCommit(state, "POP", me)
    observeAppHistoryCommit(state, "REPLACE", location("/about", "about"))
    observeAppHistoryCommit(state, "PUSH", location("/apps", "apps"))
    expect(state.history.entries.map((entry) => entry.href)).toEqual([
      "/community/cards",
      "/about",
      "/apps",
    ])
    observeAppHistoryCommit(state, "POP", location("/wiki", "unobserved"))
    expect(hasUsableAppHistoryBack(state)).toBe(false)
  })

  it("does not use an unknown previous route as a safe back destination", () => {
    const state = createAppNavigationState()
    observeAppHistoryCommit(state, "POP", location("/missing", "unknown"))
    observeAppHistoryCommit(state, "PUSH", location("/wiki", "wiki"))
    expect(hasUsableAppHistoryBack(state)).toBe(false)
  })

  it.each(["/account/me/favorites", "/community/exchange/me/profile"])(
    "clears personal %s only after a settled identity change",
    (href) => {
      const state = createAppNavigationState()
      updateAppNavigationIdentity(state, "account:1")
      rememberAppNavigationLocation(state, location(href, "favorites"), 100)
      rememberAppNavigationLocation(state, location("/wiki", "wiki"), 200)
      expect(updateAppNavigationIdentity(state, null)).toBe(false)
      expect(updateAppNavigationIdentity(state, "account:1")).toBe(false)
      expect(appTabSnapshot(state, "account")).not.toBeNull()
      expect(updateAppNavigationIdentity(state, "anonymous")).toBe(true)
      expect(appTabSnapshot(state, "account")).toBeNull()
      expect(appTabSnapshot(state, "resources")?.scrollY).toBe(200)
    }
  )

  it("keeps public Account-section snapshots across identity changes", () => {
    const state = createAppNavigationState()
    updateAppNavigationIdentity(state, "account:1")
    rememberAppNavigationLocation(
      state,
      location("/about", "about", "?from=/account/me", "#help"),
      812
    )
    expect(updateAppNavigationIdentity(state, "anonymous")).toBe(true)
    expect(appTabSnapshot(state, "account")).toEqual({
      href: "/about?from=/account/me#help",
      scrollY: 812,
      routeKey: "about",
    })
  })
})
