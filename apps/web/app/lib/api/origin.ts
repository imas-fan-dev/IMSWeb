/**
 * Origin that serves the Hono API and the public media routes it owns.
 *
 * Browser builds leave this empty. Web assets and the API share a single
 * origin in development (through the Vite proxy) and in production (through
 * the release reverse proxy), so requests stay relative and no CORS exchange
 * happens.
 *
 * Packaged Tauri builds must set `VITE_IMS_API_ORIGIN` at build time. A mobile
 * WebView serves the bundled frontend from a local scheme, so a relative URL
 * resolves against the WebView itself and never reaches the API.
 */
function normalizeOrigin(value: string | undefined): string {
  const trimmed = (value ?? "").trim()
  return trimmed ? trimmed.replace(/\/+$/, "") : ""
}

export const API_ORIGIN = normalizeOrigin(import.meta.env.VITE_IMS_API_ORIGIN)

/** True when the frontend and the API are served from different origins. */
export const isCrossOriginApi = API_ORIGIN !== ""

/**
 * Origin that root-relative URLs resolve against.
 *
 * Returns the document origin for browser builds and the configured API origin
 * for packaged builds. Prefer this over `window.location.origin` whenever the
 * result is used to reach API-owned routes.
 */
export function resolveSiteOrigin(): string {
  if (API_ORIGIN) {
    return API_ORIGIN
  }
  return typeof window === "undefined" ? "" : window.location.origin
}

/**
 * Resolves a URL that the API returned into one the current runtime can load.
 *
 * Absolute URLs, protocol-relative URLs and data URIs pass through untouched,
 * so object-storage and OAuth avatar links keep working. Root-relative URLs
 * gain the configured origin.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  const value = (url ?? "").trim()
  if (!value || !API_ORIGIN) {
    return value
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return value
  }
  return value.startsWith("/") ? `${API_ORIGIN}${value}` : value
}

/**
 * Resolves an API-provided URL for direct use in `src`/`href` and rejects
 * anything that is not a safe `http:`/`https:` link once resolved.
 *
 * Wraps `resolveMediaUrl` so root-relative asset paths gain the configured
 * origin first, then parses the result against the current site origin
 * (falling back to a placeholder origin during SSR, where there is no
 * document to resolve against) and drops unexpected schemes such as
 * `javascript:`. Use this instead of hand-rolled `window.location.origin`
 * resolution for any `*Url` field returned by the API.
 */
export function resolveSafeMediaUrl(
  url: string | null | undefined
): string | null {
  const resolved = resolveMediaUrl(url)
  if (!resolved) {
    return null
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
