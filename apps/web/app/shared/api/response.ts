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
  return body.trim() ? JSON.parse(body) : null
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

  return payload
}
