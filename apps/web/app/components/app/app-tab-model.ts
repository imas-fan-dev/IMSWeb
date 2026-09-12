import { normalizeAppPathname } from "~/lib/app-shell-scroll"

export type AppTabId = "home" | "events" | "apps" | "map" | "account"

export const APP_TABS = [
  {
    id: "home",
    to: "/",
    label: "navigation.home",
    lucideIcon: "house",
  },
  {
    id: "events",
    to: "/events",
    label: "navigation.events",
    lucideIcon: "calendar-days",
  },
  {
    id: "apps",
    to: "/apps",
    label: "navigation.apps",
    lucideIcon: "layout-grid",
  },
  {
    id: "map",
    to: "/community/exchange",
    label: "navigation.producerMap",
    lucideIcon: "map-pinned",
  },
  {
    id: "account",
    to: "/account/me",
    label: "platformAccount.title",
    lucideIcon: "circle-user",
  },
] as const

const APP_TAB_PREFIXES = [
  "/about",
  "/chronicle",
  "/community",
  "/live",
  "/packages",
  "/producer-map",
  "/recommendations",
  "/story",
  "/tier-list",
  "/wiki",
  "/works",
] as const

function pathBelongsTo(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

export function appTabIdForPathname(pathname: string): AppTabId | null {
  const normalizedPathname = normalizeAppPathname(pathname)

  if (normalizedPathname === "/") return "home"
  if (pathBelongsTo(normalizedPathname, "/events")) return "events"

  // The personal exchange workspace is account-owned even though its legacy
  // URL sits below the exchange map.
  if (
    pathBelongsTo(normalizedPathname, "/account") ||
    pathBelongsTo(normalizedPathname, "/community/exchange/me")
  ) {
    return "account"
  }

  if (pathBelongsTo(normalizedPathname, "/community/exchange")) return "map"
  if (pathBelongsTo(normalizedPathname, "/apps")) return "apps"

  if (
    APP_TAB_PREFIXES.some((root) => pathBelongsTo(normalizedPathname, root))
  ) {
    return "apps"
  }

  // News and information detail pages are reached from the home feed.
  if (pathBelongsTo(normalizedPathname, "/information")) return "home"

  return null
}

export function appTabIndexForPathname(pathname: string) {
  const activeId = appTabIdForPathname(pathname)
  return APP_TABS.findIndex((tab) => tab.id === activeId)
}

export function appTabRoot(id: AppTabId) {
  return APP_TABS.find((tab) => tab.id === id)?.to ?? "/"
}
