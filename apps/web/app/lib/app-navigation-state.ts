import {
  appTabIdForPathname,
  isPersonalAppRoute,
  type AppTabId,
} from "~/components/app/app-tab-model"

export interface AppNavigationLocation {
  pathname: string
  search: string
  hash: string
  key: string
}

export interface AppTabSnapshot {
  href: string
  scrollY: number
  routeKey: string
}

export type AppHistoryAction = "PUSH" | "REPLACE" | "POP"

interface AppHistoryEntry {
  key: string
  href: string
  tabId: AppTabId | null
}

export interface AppNavigationState {
  snapshots: Partial<Record<AppTabId, AppTabSnapshot>>
  history: {
    entries: AppHistoryEntry[]
    index: number
  }
  identity: string | null
}

export function createAppNavigationState(): AppNavigationState {
  return {
    snapshots: {},
    history: { entries: [], index: -1 },
    identity: null,
  }
}

export function appNavigationHref(
  location: Pick<AppNavigationLocation, "pathname" | "search" | "hash">
) {
  return `${location.pathname}${location.search}${location.hash}`
}

function pathnameFromHref(href: string) {
  const boundary = href.search(/[?#]/)
  return boundary === -1 ? href : href.slice(0, boundary)
}

function normalizedScrollY(scrollY: number) {
  return Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0
}

export function rememberAppNavigationLocation(
  state: AppNavigationState,
  location: AppNavigationLocation,
  scrollY: number
) {
  const tabId = appTabIdForPathname(location.pathname)
  if (!tabId) return null

  const snapshot = {
    href: appNavigationHref(location),
    scrollY: normalizedScrollY(scrollY),
    routeKey: location.key,
  }
  state.snapshots[tabId] = snapshot
  return snapshot
}

export function rememberAppTabSnapshot(
  state: AppNavigationState,
  tabId: AppTabId,
  snapshot: AppTabSnapshot
) {
  state.snapshots[tabId] = {
    ...snapshot,
    scrollY: normalizedScrollY(snapshot.scrollY),
  }
}

export function appTabSnapshot(state: AppNavigationState, tabId: AppTabId) {
  const snapshot = state.snapshots[tabId]
  if (!snapshot) return null

  if (appTabIdForPathname(pathnameFromHref(snapshot.href)) !== tabId) {
    delete state.snapshots[tabId]
    return null
  }
  return snapshot
}

export function observeAppHistoryCommit(
  state: AppNavigationState,
  action: AppHistoryAction,
  location: AppNavigationLocation
) {
  const entry = {
    key: location.key,
    href: appNavigationHref(location),
    tabId: appTabIdForPathname(location.pathname),
  }
  const { history } = state
  const current = history.entries[history.index]

  if (current?.key === entry.key && current.href === entry.href) return

  if (history.index < 0) {
    history.entries = [entry]
    history.index = 0
    return
  }

  if (action === "PUSH") {
    history.entries = history.entries.slice(0, history.index + 1)
    history.entries.push(entry)
    history.index = history.entries.length - 1
    return
  }

  if (action === "REPLACE") {
    history.entries[history.index] = entry
    return
  }

  const existingIndex = history.entries.findIndex(
    (candidate) => candidate.key === entry.key
  )
  if (existingIndex >= 0) {
    history.index = existingIndex
    return
  }

  // A POP to an unknown key predates this provider instance. Its predecessor
  // is not safe to use as an App back destination.
  history.entries = [entry]
  history.index = 0
}

export function hasUsableAppHistoryBack(state: AppNavigationState) {
  if (state.history.index <= 0) return false
  return state.history.entries[state.history.index - 1]?.tabId !== null
}

export function updateAppNavigationIdentity(
  state: AppNavigationState,
  identity: string | null
) {
  if (identity === null || state.identity === identity) return false

  const changed = state.identity !== null
  state.identity = identity
  const accountSnapshot = state.snapshots.account
  if (changed && accountSnapshot && isPersonalAppRoute(accountSnapshot.href)) {
    delete state.snapshots.account
  }
  return changed
}
