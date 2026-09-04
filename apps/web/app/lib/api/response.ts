import { ApiError } from "./api-error"
import type { ApiRequestContext, ApiResponseType } from "./types"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function extractApiErrorMessage(
  payload: unknown,
  fallback: string
): string {
  if (typeof payload === "string") {
    return stringValue(payload) ?? fallback
  }
  if (!isRecord(payload)) {
    return fallback
  }

  return (
    stringValue(payload.message) ??
    stringValue(payload.error) ??
    stringValue(payload.msg) ??
    fallback
  )
}

function extractApiErrorCode(payload: unknown): string | number | undefined {
  if (!isRecord(payload)) {
    return undefined
  }
  return typeof payload.code === "string" || typeof payload.code === "number"
    ? payload.code
    : undefined
}

export function isBusinessErrorPayload(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    (payload.success === false || payload.status === "error")
  )
}

function hasNoBody(response: Response): boolean {
  return (
    response.status === 204 || response.status === 205 || response.body === null
  )
}

async function parseJson(response: Response): Promise<unknown> {
  const body = await response.text()
  if (!body.trim()) return null
  try {
    return JSON.parse(body)
  } catch (cause) {
    throw new ApiError("服务器返回了无效的 JSON", {
      kind: "parse",
      code: "RESPONSE_JSON_INVALID",
      cause,
    })
  }
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  return mediaType === "application/json" || mediaType.endsWith("+json")
}

function isTextContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  return (
    mediaType.startsWith("text/") ||
    mediaType === "application/xml" ||
    mediaType.endsWith("+xml") ||
    mediaType === "application/x-www-form-urlencoded"
  )
}

export async function parseApiResponse(
  response: Response,
  responseType: ApiResponseType = "auto"
): Promise<unknown> {
  if (responseType === "raw") {
    return response
  }
  if (hasNoBody(response)) {
    return null
  }

  if (responseType === "json") {
    return parseJson(response)
  }
  if (responseType === "text") {
    return response.text()
  }
  if (responseType === "blob") {
    return response.blob()
  }
  if (responseType === "arrayBuffer") {
    return response.arrayBuffer()
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (isJsonContentType(contentType)) {
    return parseJson(response)
  }
  if (!contentType || isTextContentType(contentType)) {
    return response.text()
  }
  return response.blob()
}

async function parseHttpErrorPayload(response: Response): Promise<unknown> {
  try {
    return await parseApiResponse(response.clone())
  } catch {
    return undefined
  }
}

export async function handleApiResponse(
  response: Response,
  context: ApiRequestContext = {}
): Promise<unknown> {
  const responseType = context.meta?.responseType ?? "auto"

  if (!response.ok) {
    const payload = await parseHttpErrorPayload(response)
    throw new ApiError(
      extractApiErrorMessage(payload, `请求失败（HTTP ${response.status}）`),
      {
        ...context,
        kind: "http",
        status: response.status,
        code: extractApiErrorCode(payload) ?? `HTTP_${response.status}`,
        payload,
      }
    )
  }

  let payload: unknown
  try {
    payload = await parseApiResponse(response, responseType)
  } catch (cause) {
    throw new ApiError("服务器返回了无法解析的响应", {
      ...context,
      kind: "parse",
      status: response.status,
      code: "RESPONSE_PARSE_ERROR",
      cause,
    })
  }

  if (
    !context.meta?.skipBusinessErrorCheck &&
    isBusinessErrorPayload(payload)
  ) {
    throw new ApiError(extractApiErrorMessage(payload, "请求未成功"), {
      ...context,
      kind: "business",
      status: response.status,
      code: extractApiErrorCode(payload) ?? "BUSINESS_ERROR",
      payload,
    })
  }

  if (
    (responseType === "auto" || responseType === "json") &&
    (isRecord(payload) || Array.isArray(payload)) &&
    !context.meta?.parsed &&
    !context.meta?.skipContractCheck
  ) {
    reportUnparsedResponse(context)
  }

  return payload
}

const unparsedResponseReports = new Set<string>()

/**
 * Wire-contract enforcement: every JSON endpoint must either validate its
 * payload via `parsed()` or opt out explicitly with `meta.skipContractCheck`.
 * Warns once per endpoint during development and fails fast under vitest.
 */
function reportUnparsedResponse(context: ApiRequestContext): void {
  const key = `${context.method ?? "GET"} ${context.url ?? "<unknown>"}`
  if (unparsedResponseReports.has(key)) {
    return
  }
  unparsedResponseReports.add(key)
  const message = `JSON 响应未经线上契约校验: ${key}（请使用 parsed() 或 meta.skipContractCheck）`
  if (import.meta.env.MODE === "test") {
    throw new ApiError(message, {
      ...context,
      kind: "contract",
      code: "UNVALIDATED_RESPONSE",
    })
  }
  if (import.meta.env.DEV) {
    console.warn(`[api] ${message}`)
  }
}
