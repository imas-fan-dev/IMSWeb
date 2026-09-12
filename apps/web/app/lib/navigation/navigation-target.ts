import { sitesPath } from "@imsweb/contracts/paths"
import type { To } from "react-router"

export type NavigationAvailability = "all" | "web"

export interface PublicPageNavigationTarget {
  kind: "public-page"
  path: string
}

export interface ExternalNavigationTarget {
  kind: "external"
  url: string
}

export interface WebOnlyNavigationTarget {
  kind: "web-route"
  to: To
}

export type SemanticNavigationTarget =
  | PublicPageNavigationTarget
  | ExternalNavigationTarget
  | WebOnlyNavigationTarget

export type NavigationTarget = To | SemanticNavigationTarget

export function publicPage(path: string): PublicPageNavigationTarget {
  return { kind: "public-page", path }
}

export function publicSite(slug: string): PublicPageNavigationTarget {
  return publicPage(sitesPath(`/${encodeURIComponent(slug)}`))
}

export function externalUrl(url: string): ExternalNavigationTarget {
  return { kind: "external", url }
}

export function webOnly(to: To): WebOnlyNavigationTarget {
  return { kind: "web-route", to }
}

export function isSemanticNavigationTarget(
  value: NavigationTarget
): value is SemanticNavigationTarget {
  return typeof value === "object" && value !== null && "kind" in value
}
