import { describe, expect, it } from "vitest"

import {
  activateTabIn,
  canGoBack,
  commitAppEntry,
  createAppNavigationStacks,
  popActiveEntry,
  pushEntry,
  stackTop,
  type AppStackEntry,
} from "~/lib/app-navigation-stacks"
import type { AppTabId } from "~/components/app/app-tab-model"

let sequence = 0
function entry(tabId: AppTabId, href: string): AppStackEntry {
  sequence += 1
  return {
    id: `visit-${sequence}`,
    tabId,
    href,
    pathname: href.split(/[?#]/, 1)[0]!,
  }
}

function tree(...entries: AppStackEntry[]) {
  return entries.reduce(
    (stacks, next) => pushEntry(stacks, next),
    createAppNavigationStacks(entries[0]!)
  )
}

describe("App page stacks", () => {
  it("ends the Community tree at its root instead of replaying older pages", () => {
    const stacks = tree(
      entry("community", "/community"),
      entry("community", "/events"),
      entry("community", "/events/42")
    )
    expect(canGoBack(stacks)).toBe(true)
    const first = popActiveEntry(stacks)!
    expect(first.target.pathname).toBe("/events")
    const second = popActiveEntry(first.stacks)!
    expect(second.target.pathname).toBe("/community")
    expect(popActiveEntry(second.stacks)).toBeNull()
    expect(canGoBack(second.stacks)).toBe(false)
  })

  it("keeps each tab's pages when switching, and never adds the switch to a stack", () => {
    const community = tree(
      entry("community", "/community"),
      entry("community", "/community/cards")
    )
    const switched = activateTabIn(
      community,
      "resources",
      entry("resources", "/apps")
    )
    expect(switched.stacks.activeTab).toBe("resources")
    expect(stackTop(switched.stacks)!.pathname).toBe("/apps")
    expect(canGoBack(switched.stacks)).toBe(false)
    expect(switched.stacks.byTab.community).toHaveLength(2)

    const back = activateTabIn(
      switched.stacks,
      "community",
      entry("community", "/community/cards")
    )
    expect(canGoBack(back.stacks)).toBe(true)
    expect(popActiveEntry(back.stacks)!.target.pathname).toBe("/community")
  })

  it("rejects a native traversal that would leave a root for another tab's stale page", () => {
    const stacks = activateTabIn(
      tree(
        entry("community", "/community"),
        entry("community", "/events"),
        entry("community", "/events/42")
      ),
      "resources",
      entry("resources", "/apps")
    ).stacks
    const result = commitAppEntry(stacks, {
      action: "pop",
      entry: entry("community", "/events/42"),
    })
    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error("expected rejection")
    expect(result.restore.pathname).toBe("/apps")
    expect(result.stacks.activeTab).toBe("resources")
  })

  it("accepts a native traversal that targets an earlier visit of the active stack", () => {
    const stacks = tree(
      entry("resources", "/apps"),
      entry("resources", "/works"),
      entry("resources", "/works/765")
    )
    const target = stacks.byTab.resources[1]!
    const result = commitAppEntry(stacks, { action: "pop", entry: target })
    expect(result.accepted).toBe(true)
    expect(stackTop(result.stacks)!.pathname).toBe("/works")
  })

  it("updates the current page instead of stacking a repeated destination", () => {
    const page = entry("resources", "/works?page=2")
    const stacks = tree(entry("resources", "/apps"), page)
    const updated = pushEntry(stacks, {
      ...page,
      id: `${page.id}-updated`,
    })
    expect(updated.byTab.resources).toHaveLength(2)
    expect(stackTop(updated)!.id).toBe(`${page.id}-updated`)
  })

  it("replaces the visited entry when the same tab is opened again", () => {
    const stacks = activateTabIn(
      tree(entry("account", "/account/me"), entry("account", "/about")),
      "account",
      entry("account", "/about?copy=1")
    )
    const visit = stacks.stacks.byTab.account
    expect(visit).toHaveLength(2)
    expect(visit.at(-1)!.href).toBe("/about?copy=1")
    expect(canGoBack(stacks.stacks)).toBe(true)
  })
})
