/** Shared URL prefixes for API routes and public delivery paths. */
export const API_PATH_PREFIX = "/api" as const
export const ADMIN_API_PATH_PREFIX = `${API_PATH_PREFIX}/admin` as const
export const PLATFORM_API_PATH_PREFIX = `${API_PATH_PREFIX}/platform` as const
export const PLATFORM_AUTH_PATH_PREFIX = `${PLATFORM_API_PATH_PREFIX}/auth` as const
export const PLATFORM_AUTH_OAUTH_PATH_PREFIX = `${PLATFORM_AUTH_PATH_PREFIX}/oauth` as const
export const ADMIN_PLATFORM_AUTH_OAUTH_PATH_PREFIX = `${ADMIN_API_PATH_PREFIX}/platform/auth/oauth` as const

// App-only OAuth return channel. API targets it with a 303 after the HTTPS
// provider callback, and Web matches it when the deep link reopens the app.
// Providers never see it, so the single HTTPS redirect_uri stays unchanged.
export const APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback" as const
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

export const sitesPath = (suffix = ""): string =>
  appendPath(SITES_PATH_PREFIX, suffix)

export const imagePath = (suffix = ""): string =>
  appendPath(IMAGE_PATH_PREFIX, suffix)

export const iconPath = (suffix = ""): string =>
  appendPath(ICON_PATH_PREFIX, suffix)

export const cssPath = (suffix = ""): string =>
  appendPath(CSS_PATH_PREFIX, suffix)

/** One public card by its wall number; used by deep links and the random picker. */
export function namecardPath(cardNumber: string | number): string {
  return apiPath(`cards/${cardNumber}`)
}

/** 统一页面布局：公开墙、交换区、后台与属主各有一条页面媒体路由。 */
export function cardPageMediaPath(
  cardNumber: string | number,
  pageId: string,
): string {
  return apiPath(`cards/${cardNumber}/media/${pageId}`)
}

export function exchangeCardPageMediaPath(
  cardId: string,
  pageId: string,
): string {
  return apiPath(`community/exchange/cards/${encodeURIComponent(cardId)}/media/${pageId}`)
}

export function adminCardPageMediaPath(
  cardNumber: string | number,
  variant: "live" | "draft",
  pageId: string,
): string {
  return adminApiPath(`cards/${cardNumber}/media/${variant}/${pageId}`)
}

export function ownerCardPageMediaPath(
  cardId: string,
  pageId: string,
): string {
  return communityApiPath(`exchange/me/cards/${encodeURIComponent(cardId)}/media/${pageId}`)
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

/** 单张名片的固定分享短链；短链由卡片决定，不随分享次数变化。 */
export function exchangeCardSharePath(slug: string): string {
  return exchangePath(`card/${encodeURIComponent(slug)}`)
}

export function exchangeCardShareCommitPath(slug: string): string {
  return exchangePath(`card/${encodeURIComponent(slug)}/commit`)
}

/** 从名片墙或详情窗直接向某张名片发起交换。 */
export function exchangeCardRequestPath(cardNumber: string | number): string {
  return exchangePath(`cards/${encodeURIComponent(String(cardNumber))}/request`)
}

/** 快速交换页：uid 或自定义主页路径都能落到同一个页面。 */
export function exchangeQuickPath(handle: string): string {
  return exchangePath(`quick/${encodeURIComponent(handle)}`)
}

export function exchangeQuickCommitPath(handle: string): string {
  return exchangePath(`quick/${encodeURIComponent(handle)}/commit`)
}

export function exchangeMyQuickPath(): string {
  return exchangePath("me/quick")
}

export function exchangeMyCollectionPath(): string {
  return exchangePath("me/collection")
}

export function exchangeMyCollectionEntryPath(
  cardNumber: string | number
): string {
  return exchangePath(`me/collection/${encodeURIComponent(String(cardNumber))}`)
}

export function exchangeMyHistoryPath(): string {
  return exchangePath("me/exchanges")
}

export function exchangeDecisionPath(
  exchangeId: string,
  decision: "accept" | "decline"
): string {
  return exchangePath(
    `exchanges/${encodeURIComponent(exchangeId)}/${decision}`
  )
}

export function exchangeScanSessionPath(): string {
  return exchangePath("scan/sessions")
}

export function exchangeScanCommitPath(token: string): string {
  return exchangePath(`scan/sessions/${encodeURIComponent(token)}/commit`)
}

/** 平台图标只有站内一条读取路径，对象存储的公开地址不参与。 */
export function platformAccountIconPath(kindId: string | number): string {
  return apiPath(`platform/account-kinds/${encodeURIComponent(String(kindId))}/icon`)
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
