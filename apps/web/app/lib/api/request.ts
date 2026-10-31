import { ApiError } from "./api-error"
import { readCookie } from "./cookies"
import { isCrossOriginApi } from "./origin"
import {
  PLATFORM_AUTH_MODE_BEARER,
  PLATFORM_AUTH_MODE_HEADER,
  readPlatformAccessToken,
  usesPlatformBearerAuth,
} from "./platform-token-store"
import type { ApiAuthRealm, ApiMethodMeta } from "./types"

export const BACKOFFICE_CSRF_COOKIE_NAME = "ims_admin_csrf"
export const LEGACY_BACKOFFICE_CSRF_COOKIE_NAME = "csrf_token"
export const PLATFORM_CSRF_COOKIE_NAME = "ims_platform_csrf"
export const CSRF_HEADER_NAME = "X-CSRFToken"

interface ApiRequestPolicyOptions {
  authRealm?: ApiAuthRealm
  csrfCookieName?: string
  csrfFallbackCookieNames?: readonly string[]
  cookieSource?: string
}

interface ApiRequestPolicyTarget {
  config: {
    credentials?: RequestCredentials
    headers: Record<string, unknown>
  }
  meta?: ApiMethodMeta
  type?: string
  url?: string
}

function setHeader(
  headers: Record<string, unknown>,
  name: string,
  value: string
): void {
  const normalizedName = name.toLowerCase()
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === normalizedName) {
      delete headers[headerName]
    }
  }
  headers[name] = value
}

export function applyApiRequestPolicy(
  request: ApiRequestPolicyTarget,
  options: ApiRequestPolicyOptions = {}
): void {
  // Packaged builds reach the API cross-origin and authenticate with a bearer
  // token, so no cookie should ride along: the API grants those origins no
  // credentials, and "include" would make the browser reject every response.
  request.config.credentials = isCrossOriginApi ? "omit" : "same-origin"

  if (request.meta?.authRealm && request.meta.authRealm !== options.authRealm) {
    throw new Error(
      `${request.meta.authRealm} request cannot use the ${options.authRealm ?? "public"} API client`
    )
  }

  if (usesPlatformBearerAuth && options.authRealm === "platform") {
    // Opting in tells the API to return the tokens in the response body. The
    // server treats an Authorization-authenticated request as CSRF-exempt,
    // because nothing attaches that header on the caller's behalf.
    setHeader(
      request.config.headers,
      PLATFORM_AUTH_MODE_HEADER,
      PLATFORM_AUTH_MODE_BEARER
    )
    const accessToken = readPlatformAccessToken()
    if (accessToken) {
      setHeader(
        request.config.headers,
        "Authorization",
        `Bearer ${accessToken}`
      )
    }
    return
  }

  if (!request.meta?.csrf) {
    return
  }

  if (!options.csrfCookieName) {
    throw new Error("CSRF request requires an authentication realm")
  }

  const csrfToken = [
    options.csrfCookieName,
    ...(options.csrfFallbackCookieNames ?? []),
  ].reduce<string | undefined>(
    (token, cookieName) =>
      token ?? readCookie(cookieName, options.cookieSource),
    undefined
  )
  if (!csrfToken) {
    throw new ApiError("登录会话缺少 CSRF 令牌，请刷新页面后重试", {
      kind: "csrf",
      code: "CSRF_TOKEN_MISSING",
      method: request.type,
      url: request.url,
    })
  }

  setHeader(request.config.headers, CSRF_HEADER_NAME, csrfToken)
}
