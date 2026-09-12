import { IS_APP_TARGET } from "../app-target"

/**
 * Origins only compose hostnames with root-relative paths. `IS_APP_TARGET`
 * decides whether the current runtime needs that composition: the website
 * keeps resources same-origin, while a packaged App may need an HTTP(S) host.
 * App development intentionally leaves the API origin empty so Tauri sends
 * root-relative requests through the Vite proxy.
 */
function normalizeOrigin(value: string | undefined): string {
  const trimmed = (value ?? "").trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : ""
}

function normalizePathPrefix(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "")
  return trimmed ? `/${trimmed}` : ""
}

export const API_ORIGIN = normalizeOrigin(import.meta.env.VITE_IMS_API_ORIGIN)

// The variable names remain compatible with the local RustFS service, but the
// resolver treats the target as generic S3-compatible object storage.
const LOCAL_OBJECT_STORAGE_PROXY_PATH_PREFIX = normalizePathPrefix(
  import.meta.env.VITE_IMS_LOCAL_MEDIA_PATH_PREFIX
)

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

function isAppObjectStorageProxyPath(value: string): boolean {
  return Boolean(
    LOCAL_OBJECT_STORAGE_PROXY_PATH_PREFIX &&
    (value === LOCAL_OBJECT_STORAGE_PROXY_PATH_PREFIX ||
      value.startsWith(`${LOCAL_OBJECT_STORAGE_PROXY_PATH_PREFIX}/`))
  )
}

/**
 * Routes a local S3-compatible object-store URL through the App development
 * proxy. Public R2 and other external object-store URLs remain unchanged.
 */
function appObjectStorageProxyPath(url: string | null | undefined): string {
  const value = (url ?? "").trim()
  if (!IS_APP_TARGET || !value || !LOCAL_OBJECT_STORAGE_PROXY_PATH_PREFIX) {
    return value
  }
  try {
    const parsed = new URL(value)
    const localHost =
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]" ||
      isPrivateIpv4(parsed.hostname)
    if (
      parsed.protocol === "http:" &&
      localHost &&
      isAppObjectStorageProxyPath(parsed.pathname)
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    // Root-relative paths already reach the App development proxy.
  }
  return value
}

/** True when the frontend and the API are served from different origins. */
export const isCrossOriginApi = API_ORIGIN !== ""

/**
 * Public address of the website itself — the one a person can paste into any
 * browser.
 *
 * Browser builds leave this empty, exactly like `VITE_IMS_API_ORIGIN`: the
 * document already sits on the public address, so resolving against it is both
 * correct and free of configuration.
 *
 * Packaged Tauri builds should set `VITE_IMS_PUBLIC_SITE_ORIGIN` at build time.
 * Neither constant the packaged client already has can stand in for it: the API
 * origin names the host that answers API calls, not the host that serves pages,
 * and the document origin is a local WebView scheme that means nothing once the
 * URL leaves the device.
 *
 * Vite inlines this into browser code, so it is public and must never hold a
 * secret.
 */
export const PUBLIC_SITE_ORIGIN = normalizeOrigin(
  import.meta.env.VITE_IMS_PUBLIC_SITE_ORIGIN
)

/** Explicit HTTP(S) host for MapLibre styles, tiles, fonts, and sprites. */
export const MAP_TRANSPORT_ORIGIN = normalizeOrigin(
  import.meta.env.VITE_IMS_MAP_TRANSPORT_ORIGIN
)

/**
 * Origin that root-relative URLs resolve against **for this runtime to load**.
 *
 * Returns the document origin for browser builds and the configured API origin
 * for packaged builds. Prefer this over `window.location.origin` whenever the
 * result is used to reach API-owned routes.
 *
 * This is the wrong base for a URL that leaves the device — inside the packaged
 * client it names the API host, which does not serve pages. Use
 * `resolveShareableOrigin()` for anything a person will open in a browser.
 */
export function resolveSiteOrigin(): string {
  if (IS_APP_TARGET && API_ORIGIN) {
    return API_ORIGIN
  }
  return typeof window === "undefined" ? "" : window.location.origin
}

/**
 * HTTP(S) base used exclusively by MapLibre for styles, sprites, tiles, and
 * PMTiles. A packaged App must never use the `tauri://` document origin here.
 */
export function resolveMapTransportOrigin(): string {
  if (IS_APP_TARGET) {
    return MAP_TRANSPORT_ORIGIN || PUBLIC_SITE_ORIGIN || API_ORIGIN
  }
  return typeof window === "undefined" ? "" : window.location.origin
}

let warnedAboutMissingPublicOrigin = false

/**
 * Origin to build links that leave this runtime: copied to a clipboard, shared,
 * or otherwise opened in a real browser later.
 *
 * Returns `PUBLIC_SITE_ORIGIN` when configured. Otherwise it falls back to
 * `resolveSiteOrigin()`, which yields the document origin on the website (the
 * public address, unchanged) and the API origin in a packaged build — today a
 * single host serves both, so the fallback is right for the current deployment
 * and is in every case a real `http(s)` address rather than a `tauri://` one
 * that would be useless off the device.
 *
 * A packaged build that omits the variable gets a development-time warning
 * instead of a thrown error, because this link is often the only way a user can
 * return to their own submission; breaking it on the user's phone is a worse
 * outcome than a loud complaint where the packaging mistake can be fixed.
 */
export function resolveShareableOrigin(): string {
  if (PUBLIC_SITE_ORIGIN) {
    return PUBLIC_SITE_ORIGIN
  }
  if (
    isCrossOriginApi &&
    import.meta.env.DEV &&
    !warnedAboutMissingPublicOrigin
  ) {
    warnedAboutMissingPublicOrigin = true
    console.warn(
      "[origin] VITE_IMS_PUBLIC_SITE_ORIGIN is unset in a cross-origin build; " +
        "shareable links fall back to VITE_IMS_API_ORIGIN and will be wrong " +
        "once the API and the website stop sharing a host."
    )
  }
  return resolveSiteOrigin()
}

/**
 * Resolves a URL that the API returned into one the current runtime can load.
 *
 * Absolute URLs, protocol-relative URLs and data URIs pass through untouched,
 * so object-storage and OAuth avatar links keep working. Only the App target
 * composes root-relative API paths with its configured origin.
 */
function resolveRootRelativeUrl(
  url: string | null | undefined,
  origin: string
): string {
  const value = (url ?? "").trim()
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    !IS_APP_TARGET
  ) {
    return value
  }
  return origin ? `${origin}${value}` : value
}

export function resolveMediaUrl(url: string | null | undefined): string {
  return resolveRootRelativeUrl(appObjectStorageProxyPath(url), API_ORIGIN)
}

/**
 * Resolves media hosted by the public website instead of the API or app bundle.
 *
 * Browser builds keep root-relative paths unchanged. Packaged builds use the
 * configured public site origin, falling back to the API origin while both are
 * served by the same host.
 */
export function resolvePublicSiteMediaUrl(
  url: string | null | undefined
): string {
  return resolveRootRelativeUrl(url, PUBLIC_SITE_ORIGIN || API_ORIGIN)
}

/**
 * Resolves an API-provided URL for direct use in `src`/`href` and rejects
 * anything that is not a safe `http:`/`https:` link once resolved.
 *
 * Wraps `resolveMediaUrl` so root-relative asset paths gain the configured
 * origin first. App development proxy paths stay root-relative, which lets
 * Tauri's custom development protocol forward them to Vite. Other results are parsed
 * against the current site origin (falling back to a placeholder origin during
 * SSR, where there is no document) and unexpected schemes such as
 * `javascript:` are dropped. Use this instead of hand-rolled
 * `window.location.origin` resolution for any `*Url` field returned by the API.
 */
export function resolveSafeMediaUrl(
  url: string | null | undefined
): string | null {
  const resolved = resolveMediaUrl(url)
  if (!resolved) {
    return null
  }
  if (
    IS_APP_TARGET &&
    !API_ORIGIN &&
    resolved.startsWith("/") &&
    !resolved.startsWith("//")
  ) {
    return resolved
  }
  const base = resolveSiteOrigin() || "https://imsweb.invalid"
  try {
    const parsed = new URL(resolved, base)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null
  } catch {
    return null
  }
}
