import type { AppTabId } from "~/components/app/app-tab-model"

/**
 * App navigation owns one page stack per primary tab. The browser entry is a
 * projection of the active stack top, never the page stack itself: tab switches
 * replace that entry so old pages cannot be replayed by native history.
 */
export interface AppStackEntry {
  /** Stable identity for this visit; it outlives URL-only changes. */
  readonly id: string
  readonly tabId: AppTabId
  readonly href: string
  readonly pathname: string
}

export interface AppNavigationStacks {
  readonly activeTab: AppTabId
  readonly byTab: Readonly<Record<AppTabId, readonly AppStackEntry[]>>
}

export const APP_STACK_TABS: readonly AppTabId[] = [
  "home",
  "community",
  "map",
  "resources",
  "account",
]

function emptyStacks(): Record<AppTabId, readonly AppStackEntry[]> {
  return {
    home: [],
    community: [],
    map: [],
    resources: [],
    account: [],
  }
}

function withStack(
  stacks: AppNavigationStacks,
  tabId: AppTabId,
  stack: readonly AppStackEntry[]
): AppNavigationStacks {
  return {
    activeTab: stacks.activeTab,
    byTab: { ...stacks.byTab, [tabId]: stack },
  }
}

export function createAppNavigationStacks(
  entry: AppStackEntry
): AppNavigationStacks {
  return {
    activeTab: entry.tabId,
    byTab: { ...emptyStacks(), [entry.tabId]: [entry] },
  }
}

export function activeStack(
  stacks: AppNavigationStacks
): readonly AppStackEntry[] {
  return stacks.byTab[stacks.activeTab]
}

export function stackTop(
  stacks: AppNavigationStacks
): AppStackEntry | undefined {
  return activeStack(stacks).at(-1)
}

export function canGoBack(stacks: AppNavigationStacks) {
  return activeStack(stacks).length > 1
}

export function previousEntry(
  stacks: AppNavigationStacks
): AppStackEntry | undefined {
  const stack = activeStack(stacks)
  return stack.length > 1 ? stack[stack.length - 2] : undefined
}

/**
 * Switching tabs activates the destination stack and makes its top the single
 * browser entry. A tab switch never appends to the source or destination stack.
 */
export function activateTabIn(
  stacks: AppNavigationStacks,
  tabId: AppTabId,
  entry: AppStackEntry
): { stacks: AppNavigationStacks; target: AppStackEntry } {
  const existing = stacks.byTab[tabId]
  const stack = existing.length ? [...existing] : [entry]
  if (existing.length) stack[stack.length - 1] = entry
  return {
    stacks: {
      activeTab: tabId,
      byTab: { ...stacks.byTab, [tabId]: stack },
    },
    target: stack[stack.length - 1],
  }
}

/**
 * Ordinary links derive a new page from the current one. Reopening the page
 * that is already on top updates it instead of adding a duplicate layer.
 */
export function pushEntry(
  stacks: AppNavigationStacks,
  entry: AppStackEntry
): AppNavigationStacks {
  const stack = stacks.byTab[entry.tabId]
  // Reopening the current page or an ancestor returns to that visit instead of
  // growing a loop, so A → B → A can still end at the root in one step.
  const existing = stack.findIndex((candidate) => candidate.href === entry.href)
  if (existing >= 0)
    return withStack(stacks, entry.tabId, [...stack.slice(0, existing), entry])
  return withStack(stacks, entry.tabId, [...stack, entry])
}

/** Reselecting the active tab keeps one root entry and drops the pages above. */
export function resetTabToRoot(
  stacks: AppNavigationStacks,
  tabId: AppTabId,
  entry: AppStackEntry
): AppNavigationStacks {
  return { activeTab: tabId, byTab: { ...stacks.byTab, [tabId]: [entry] } }
}

export function replaceTop(
  stacks: AppNavigationStacks,
  entry: AppStackEntry
): AppNavigationStacks {
  const stack = stacks.byTab[entry.tabId]
  if (!stack.length) return pushEntry(stacks, entry)
  return withStack(stacks, entry.tabId, [...stack.slice(0, -1), entry])
}

/**
 * Returns to an earlier visit that is still present in the active stack and
 * drops everything above it. The root entry is never removed.
 */
export function returnToEntry(
  stacks: AppNavigationStacks,
  entryId: string
): AppNavigationStacks {
  const stack = activeStack(stacks)
  const index = stack.findIndex((candidate) => candidate.id === entryId)
  if (index < 0 || index === stack.length - 1) return stacks
  return withStack(stacks, stacks.activeTab, stack.slice(0, index + 1))
}

/**
 * A return consumes the top entry only when it is not the root. The committed
 * destination is written by `replaceTop`, so the browser never keeps the page
 * that was left.
 */
export function popActiveEntry(stacks: AppNavigationStacks): {
  stacks: AppNavigationStacks
  target: AppStackEntry
} | null {
  if (!canGoBack(stacks)) return null
  const stack = activeStack(stacks)
  const target = stack[stack.length - 2]
  return {
    stacks: withStack(stacks, stacks.activeTab, stack.slice(0, -1)),
    target,
  }
}

export type AppStackCommit =
  | { action: "push"; entry: AppStackEntry }
  | { action: "replace"; entry: AppStackEntry }
  | { action: "pop"; entry: AppStackEntry }

/**
 * Reconciles a location commit with the stack. A POP is only accepted when it
 * lands on an earlier visit of the active stack, so a native history traversal
 * can never reach another tab or a stale page. When it does, the caller must
 * project the current top back into the browser entry.
 */
export function commitAppEntry(
  stacks: AppNavigationStacks,
  commit: AppStackCommit
):
  | { accepted: true; stacks: AppNavigationStacks }
  | { accepted: false; stacks: AppNavigationStacks; restore: AppStackEntry } {
  if (commit.action === "push")
    return { accepted: true, stacks: pushEntry(stacks, commit.entry) }
  if (commit.action === "replace")
    return { accepted: true, stacks: replaceTop(stacks, commit.entry) }

  const stack = activeStack(stacks)
  const index = stack.findIndex(
    (candidate) =>
      candidate.href === commit.entry.href || candidate.id === commit.entry.id
  )
  const top = stack.at(-1)
  if (index >= 0 && index < stack.length - 1 && top) {
    return {
      accepted: true,
      stacks: withStack(stacks, stacks.activeTab, stack.slice(0, index + 1)),
    }
  }
  // Landing on the top is the same visit; anything else is outside this stack.
  if (index === stack.length - 1 && top) return { accepted: true, stacks }
  return {
    accepted: false,
    stacks,
    restore: stack.at(-1) ?? commit.entry,
  }
}
