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

export type AppBackTarget =
  | { kind: "parent"; href: string }
  | { kind: "root" }
  | { kind: "unknown" }

type AppBackRuleTarget = Exclude<AppBackTarget, { kind: "unknown" }>

interface AppBackRule {
  path: string
  exact?: boolean
  target: AppBackRuleTarget
}

/**
 * The App back control climbs a page tree instead of replaying browsing
 * history, so where it lands depends only on the current address. Rules are
 * checked in order and the first match wins, which makes the order
 * load-bearing:
 *
 * - Every tab root matches exactly. `/` must stay exact: as a prefix it would
 *   swallow every other route.
 * - `/account/me` precedes the exchange-map rules, because
 *   `/community/exchange/me` is a My page even though the map owns the rest of
 *   that subtree.
 * - `/community/cards/submissions` precedes `/community/cards`, which precedes
 *   the general Community prefix.
 * - Exact rules precede prefix rules on the same path (`/events`, `/works`,
 *   `/chronicle`), so a parent and its detail pages resolve differently.
 */
const APP_BACK_RULES: readonly AppBackRule[] = [
  { path: "/", exact: true, target: { kind: "root" } },
  { path: "/community", exact: true, target: { kind: "root" } },
  { path: "/community/exchange", exact: true, target: { kind: "root" } },
  { path: "/apps", exact: true, target: { kind: "root" } },
  { path: "/account/me", exact: true, target: { kind: "root" } },

  {
    path: "/account/me",
    target: { kind: "parent", href: "/account/me" },
  },
  {
    path: "/account/security",
    target: { kind: "parent", href: "/account/me" },
  },
  {
    path: "/account/login",
    target: { kind: "parent", href: "/account/me" },
  },
  {
    path: "/account/register",
    target: { kind: "parent", href: "/account/me" },
  },
  {
    path: "/account/password-reset",
    target: { kind: "parent", href: "/account/me" },
  },
  { path: "/about", target: { kind: "parent", href: "/account/me" } },
  {
    path: "/community/exchange/me",
    target: { kind: "parent", href: "/account/me" },
  },

  {
    path: "/community/exchange/offices",
    target: { kind: "parent", href: "/community/exchange" },
  },
  {
    path: "/community/exchange",
    target: { kind: "parent", href: "/community/exchange" },
  },

  {
    path: "/community/cards/submissions",
    target: { kind: "parent", href: "/community/cards" },
  },
  { path: "/community/cards", target: { kind: "parent", href: "/community" } },
  {
    path: "/events",
    exact: true,
    target: { kind: "parent", href: "/community" },
  },
  { path: "/events", target: { kind: "parent", href: "/events" } },
  { path: "/producer-map", target: { kind: "parent", href: "/community" } },
  { path: "/community", target: { kind: "parent", href: "/community" } },

  { path: "/wiki/modern", target: { kind: "parent", href: "/apps" } },
  { path: "/wiki", target: { kind: "parent", href: "/apps" } },
  { path: "/story/modern", target: { kind: "parent", href: "/wiki" } },
  { path: "/story", target: { kind: "parent", href: "/wiki" } },
  { path: "/works", exact: true, target: { kind: "parent", href: "/apps" } },
  { path: "/works", target: { kind: "parent", href: "/works" } },
  { path: "/packages", target: { kind: "parent", href: "/works" } },
  {
    path: "/chronicle",
    exact: true,
    target: { kind: "parent", href: "/apps" },
  },
  { path: "/chronicle", target: { kind: "parent", href: "/chronicle" } },
  { path: "/tier-list", target: { kind: "parent", href: "/apps" } },
  { path: "/live", target: { kind: "parent", href: "/apps" } },
  { path: "/recommendations", target: { kind: "parent", href: "/apps" } },

  { path: "/information", target: { kind: "parent", href: "/" } },
]

/**
 * Resolve the single logical parent of an App route. A tab root ends the tree,
 * a route outside the App target has no parent, and everything else climbs to
 * the path the tree assigns it. The button, the Android back listener, and the
 * iOS swipe correction all read this one function.
 */
export function resolveAppBackTarget(pathname: string): AppBackTarget {
  const normalized = normalizeAppPathname(pathname.split(/[?#]/, 1)[0] ?? "/")
  for (const rule of APP_BACK_RULES) {
    const matched = rule.exact
      ? normalized === rule.path
      : pathBelongsTo(normalized, rule.path)
    if (matched) return rule.target
  }
  return { kind: "unknown" }
}
