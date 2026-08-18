/** Shared URL prefixes for API routes and public delivery paths. */
export const API_PATH_PREFIX = "/api" as const
export const ADMIN_API_PATH_PREFIX = `${API_PATH_PREFIX}/admin` as const
export const PLATFORM_API_PATH_PREFIX = `${API_PATH_PREFIX}/platform` as const
export const PLATFORM_AUTH_PATH_PREFIX = `${PLATFORM_API_PATH_PREFIX}/auth` as const
export const PLATFORM_AUTH_OAUTH_PATH_PREFIX = `${PLATFORM_AUTH_PATH_PREFIX}/oauth` as const
export const ADMIN_PLATFORM_AUTH_OAUTH_PATH_PREFIX = `${ADMIN_API_PATH_PREFIX}/platform/auth/oauth` as const
export const COMMUNITY_API_PATH_PREFIX = `${API_PATH_PREFIX}/community` as const
export const EXCHANGE_PATH_PREFIX = `${COMMUNITY_API_PATH_PREFIX}/exchange` as const
export const ADMIN_EXCHANGE_PATH_PREFIX = `${ADMIN_API_PATH_PREFIX}/community/exchange` as const
export const WIKI_PATH_PREFIX = `${API_PATH_PREFIX}/wiki` as const
export const ADMIN_WIKI_PATH_PREFIX = `${ADMIN_API_PATH_PREFIX}/wiki` as const
export const EVENT_CHRONICLE_PATH_PREFIX = "/eventchronicle" as const
export const PUBLIC_UPLOADS_PATH_PREFIX = "/uploads" as const
export const PUBLIC_ASSETS_PATH_PREFIX = "/assets" as const
export const MAPS_PATH_PREFIX = "/maps" as const
export const SITE_CONTENT_PATH_PREFIX = "/site-content" as const
export const SITES_PATH_PREFIX = "/sites" as const
export const IMAGE_PATH_PREFIX = "/image" as const
export const ICON_PATH_PREFIX = "/icon" as const
export const CSS_PATH_PREFIX = "/css" as const

function appendPath(prefix: string, suffix = ""): string {
  const normalizedSuffix = suffix.replace(/^\/+/, "")
  return normalizedSuffix ? `${prefix}/${normalizedSuffix}` : prefix
}

export function apiPath(suffix = ""): string {
  return appendPath(API_PATH_PREFIX, suffix)
}

export function adminApiPath(suffix = ""): string {
  return appendPath(ADMIN_API_PATH_PREFIX, suffix)
}

export function platformApiPath(suffix = ""): string {
  return appendPath(PLATFORM_API_PATH_PREFIX, suffix)
}

export function platformAuthPath(suffix = ""): string {
  return appendPath(PLATFORM_AUTH_PATH_PREFIX, suffix)
}

export function platformAuthOAuthPath(suffix = ""): string {
  return appendPath(PLATFORM_AUTH_OAUTH_PATH_PREFIX, suffix)
}

export function adminPlatformAuthOAuthPath(suffix = ""): string {
  return appendPath(ADMIN_PLATFORM_AUTH_OAUTH_PATH_PREFIX, suffix)
}

export function communityApiPath(suffix = ""): string {
  return appendPath(COMMUNITY_API_PATH_PREFIX, suffix)
}

export function exchangePath(suffix = ""): string {
  return appendPath(EXCHANGE_PATH_PREFIX, suffix)
}

export function adminExchangePath(suffix = ""): string {
  return appendPath(ADMIN_EXCHANGE_PATH_PREFIX, suffix)
}

export function wikiPath(suffix = ""): string {
  return appendPath(WIKI_PATH_PREFIX, suffix)
}

export function adminWikiPath(suffix = ""): string {
  return appendPath(ADMIN_WIKI_PATH_PREFIX, suffix)
}

export function eventChroniclePath(suffix = ""): string {
  return appendPath(EVENT_CHRONICLE_PATH_PREFIX, suffix)
}

export function publicUploadsPath(suffix = ""): string {
  return appendPath(PUBLIC_UPLOADS_PATH_PREFIX, suffix)
}

export function publicAssetsPath(suffix = ""): string {
  return appendPath(PUBLIC_ASSETS_PATH_PREFIX, suffix)
}

export function mapsPath(suffix = ""): string {
  return appendPath(MAPS_PATH_PREFIX, suffix)
}

export function siteContentPath(suffix = ""): string {
  return appendPath(SITE_CONTENT_PATH_PREFIX, suffix)
}

export function sitesPath(suffix = ""): string {
  return appendPath(SITES_PATH_PREFIX, suffix)
}

export function imagePath(suffix = ""): string {
  return appendPath(IMAGE_PATH_PREFIX, suffix)
}

export function iconPath(suffix = ""): string {
  return appendPath(ICON_PATH_PREFIX, suffix)
}

export function cssPath(suffix = ""): string {
  return appendPath(CSS_PATH_PREFIX, suffix)
}
