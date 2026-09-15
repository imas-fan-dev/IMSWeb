import { appTabIdForPathname } from "~/components/app/app-tab-model"
import type { HomepageLink } from "~/lib/api"
import {
  currentNavigationRuntime,
  resolveNavigation,
  type NavigationDecision,
  type NavigationRuntime,
} from "~/lib/navigation/resolve-navigation"

export const coreResourceLinks = [
  {
    id: "app-resource-wiki",
    section: "navigation",
    title: "App Wiki",
    description: "查阅偶像大师作品、角色与企划资料。",
    href: "/wiki",
    icon: "book-open",
    accent: "primary",
    displayOrder: 0,
  },
  {
    id: "app-resource-story",
    section: "navigation",
    title: "剧情",
    description: "按企划浏览站内收录的剧情内容。",
    href: "/story",
    icon: "library",
    accent: "info",
    displayOrder: 1,
  },
] satisfies HomepageLink[]

const destinationsOwnedElsewhere = new Set([
  "/community",
  "/events",
  "/community/cards",
  "/community/exchange",
  "/producer-map",
  "/account",
  "/account/me",
  "/about",
])

type ResolvedDirectoryTarget = {
  available: boolean
  key: string | null
  pathname: string | null
  hasPreset: boolean
}

export type AppsDirectoryGroups = {
  resources: HomepageLink[]
  extensions: HomepageLink[]
}

function normalizedLocalPathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed || "/"
}

function resolvedDecisionKey(
  decision: NavigationDecision,
  runtime: NavigationRuntime
): string | null {
  if (decision.kind === "unavailable") return null

  if (decision.kind === "router") {
    if (typeof decision.to !== "string") {
      return `router:${JSON.stringify(decision.to)}`
    }

    const candidate = decision.to.trim()
    if (!candidate.startsWith("/") || candidate.startsWith("//")) {
      return `router:${candidate}`
    }

    const url = new URL(candidate, "https://imsweb.invalid")
    return `router:${normalizedLocalPathname(url.pathname)}${url.search}${url.hash}`
  }

  try {
    const base = runtime.documentOrigin || "https://imsweb.invalid"
    return `${decision.kind}:${new URL(decision.href, base).href}`
  } catch {
    return `${decision.kind}:${decision.href}`
  }
}

function resolveDirectoryTarget(
  href: string,
  runtime: NavigationRuntime
): ResolvedDirectoryTarget {
  const decision = resolveNavigation(href, runtime)
  const key = resolvedDecisionKey(decision, runtime)

  if (
    decision.kind !== "router" ||
    typeof decision.to !== "string" ||
    !decision.to.startsWith("/") ||
    decision.to.startsWith("//")
  ) {
    return {
      available: decision.kind !== "unavailable",
      key,
      pathname: null,
      hasPreset: false,
    }
  }

  const url = new URL(decision.to, "https://imsweb.invalid")
  return {
    available: true,
    key,
    pathname: normalizedLocalPathname(url.pathname),
    hasPreset: Boolean(url.search || url.hash),
  }
}

export function groupAppsDirectoryLinks(
  links: HomepageLink[],
  runtime: NavigationRuntime = currentNavigationRuntime()
): AppsDirectoryGroups {
  const resources: HomepageLink[] = []
  const extensions: HomepageLink[] = []
  const seen = new Set(
    coreResourceLinks
      .map((link) => resolveDirectoryTarget(link.href, runtime).key)
      .filter((key): key is string => key !== null)
  )

  for (const link of links) {
    const target = resolveDirectoryTarget(link.href, runtime)
    if (!target.available) continue
    if (target.key && seen.has(target.key)) continue
    if (target.key) seen.add(target.key)

    if (target.pathname && target.hasPreset) {
      extensions.push(link)
      continue
    }

    if (target.pathname && destinationsOwnedElsewhere.has(target.pathname)) {
      continue
    }

    if (
      target.pathname &&
      appTabIdForPathname(target.pathname) === "resources"
    ) {
      resources.push(link)
      continue
    }

    extensions.push(link)
  }

  return { resources, extensions }
}
