import type { ApiRequestContext } from "./types"

export type ApiErrorKind =
  | "http"
  | "business"
  | "parse"
  | "network"
  | "aborted"
  | "csrf"

export interface ApiErrorOptions extends ApiRequestContext {
  kind: ApiErrorKind
  status?: number
  code?: string | number
  payload?: unknown
  cause?: unknown
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly code?: string | number
  readonly payload?: unknown
  readonly method?: string
  readonly url?: string

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause })
    this.name = "ApiError"
    this.kind = options.kind
    this.status = options.status
    this.code = options.code
    this.payload = options.payload
    this.method = options.method
    this.url = options.url
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function normalizeRequestError(
  error: unknown,
  context: ApiRequestContext = {}
): ApiError {
  if (isApiError(error)) {
    return error
  }

  const errorName =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : undefined
  const aborted = errorName === "AbortError"

  return new ApiError(aborted ? "请求已取消" : "网络请求失败", {
    ...context,
    kind: aborted ? "aborted" : "network",
    code: aborted ? "REQUEST_ABORTED" : "NETWORK_ERROR",
    cause: error,
  })
}
