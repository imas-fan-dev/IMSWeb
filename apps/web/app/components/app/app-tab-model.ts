import { normalizeAppPathname } from "~/lib/app-shell-scroll"

export type AppTabId = "home" | "community" | "map" | "resources" | "account"

export const APP_TABS = [
  {
    id: "home",
    to: "/",
    label: "appNavigation.home",
    lucideIcon: "house",
  },
  {
    id: "community",
    to: "/community",
    label: "appNavigation.community",
    lucideIcon: "users",
  },
  {
    id: "map",
    to: "/community/exchange",
    label: "appNavigation.exchangeMap",
    lucideIcon: "map-pinned",
  },
  {
    id: "resources",
    to: "/apps",
    label: "appNavigation.resources",
    lucideIcon: "book-open-text",
  },
  {
    id: "account",
    to: "/account/me",
    label: "appNavigation.account",
    lucideIcon: "circle-user",
  },
] as const

const PERSONAL_PREFIXES = ["/account", "/community/exchange/me"] as const
const ACCOUNT_PREFIXES = [...PERSONAL_PREFIXES, "/about"] as const

const COMMUNITY_PREFIXES = ["/community", "/events", "/producer-map"] as const

const RESOURCE_PREFIXES = [
  "/apps",
  "/wiki",
  "/story",
  "/works",
  "/chronicle",
  "/recommendations",
  "/live",
  "/tier-list",
  "/packages",
] as const

function pathBelongsTo(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`)
}

function belongsToAny(pathname: string, roots: readonly string[]) {
  return roots.some((root) => pathBelongsTo(pathname, root))
}

export function isPersonalAppRoute(href: string) {
  const pathname = normalizeAppPathname(href.split(/[?#]/, 1)[0] ?? "/")
  return belongsToAny(pathname, PERSONAL_PREFIXES)
}

export function appTabIdForPathname(pathname: string): AppTabId | null {
  const normalizedPathname = normalizeAppPathname(pathname)

  if (belongsToAny(normalizedPathname, ACCOUNT_PREFIXES)) return "account"
  if (pathBelongsTo(normalizedPathname, "/community/exchange")) return "map"
  if (belongsToAny(normalizedPathname, COMMUNITY_PREFIXES)) return "community"
  if (belongsToAny(normalizedPathname, RESOURCE_PREFIXES)) return "resources"
  if (
    normalizedPathname === "/" ||
    pathBelongsTo(normalizedPathname, "/information")
  ) {
    return "home"
  }

  return null
}

export function appTabIndexForPathname(pathname: string) {
  const activeId = appTabIdForPathname(pathname)
  return APP_TABS.findIndex((tab) => tab.id === activeId)
}

export function appTabRoot(id: AppTabId) {
  return APP_TABS.find((tab) => tab.id === id)?.to ?? "/"
}
