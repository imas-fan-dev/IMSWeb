import { ApiError } from "./api-error"
import { readCookie } from "./cookies"
import type { ApiMethodMeta } from "./types"

export const CSRF_COOKIE_NAME = "csrf_token"
export const CSRF_HEADER_NAME = "X-CSRFToken"

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
  cookieSource?: string
): void {
  request.config.credentials = "same-origin"

  if (!request.meta?.csrf) {
    return
  }

  const csrfToken = readCookie(CSRF_COOKIE_NAME, cookieSource)
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
