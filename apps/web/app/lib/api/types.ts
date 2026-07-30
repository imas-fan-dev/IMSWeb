export type ApiResponseType =
  | "auto"
  | "json"
  | "text"
  | "blob"
  | "arrayBuffer"
  | "raw"

export interface ApiMethodMeta {
  /** Alova token-authentication role for login, logout, and refresh requests. */
  authRole?: "login" | "logout" | "refreshToken" | null
  /** Read the current csrf_token cookie and send it as X-CSRFToken. */
  csrf?: boolean
  /** Override content-type based response parsing for exceptional endpoints. */
  responseType?: ApiResponseType
  /** Use only when an endpoint intentionally returns a failure-shaped payload as data. */
  skipBusinessErrorCheck?: boolean
}

export interface ApiRequestContext {
  method?: string
  url?: string
  meta?: ApiMethodMeta
}

export function withCsrf(
  meta: Omit<ApiMethodMeta, "csrf"> = {}
): ApiMethodMeta {
  return { ...meta, csrf: true }
}
