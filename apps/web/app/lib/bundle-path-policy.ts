import {
  API_PATH_PREFIX,
  CSS_PATH_PREFIX,
  EVENT_CHRONICLE_PATH_PREFIX,
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  MAPS_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
  SITE_CONTENT_PATH_PREFIX,
  SITES_PATH_PREFIX,
} from "@imsweb/contracts/paths"

/** Root-relative routes served by the Hono API during local development. */
export const API_PROXY_PATH_PREFIXES = [
  API_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  CSS_PATH_PREFIX,
  "/Data",
  EVENT_CHRONICLE_PATH_PREFIX,
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  "/runninggame",
  SITE_CONTENT_PATH_PREFIX,
  SITES_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
] as const

const WEB_BUNDLE_ROOTS = new Set([
  "brand",
  MAPS_PATH_PREFIX.slice(1),
  "favicon.ico",
])

/** Root-relative routes forwarded to the hosted public website in development. */
export const PUBLIC_SITE_PROXY_PATH_PREFIXES = ["/brand/about"] as const

/** True when a root-relative media path is hosted by the public website. */
export function isPublicSiteOwnedPath(url: string): boolean {
  return PUBLIC_SITE_PROXY_PATH_PREFIXES.some((prefix) =>
    url.startsWith(`${prefix}/`)
  )
}

/**
 * True when a root-relative path is served by the web bundle rather than the
 * API or public website.
 */
export function isWebBundleOwnedPath(url: string): boolean {
  if (!url.startsWith("/") || url.startsWith("//")) return false
  if (isPublicSiteOwnedPath(url)) return false
  const [, firstSegment = ""] = url.split("/")
  return WEB_BUNDLE_ROOTS.has(firstSegment)
}
