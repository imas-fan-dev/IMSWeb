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
  if (API_ORIGIN) {
    return API_ORIGIN
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
