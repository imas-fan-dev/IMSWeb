import { z } from "zod"
import { hasAsciiControl } from "./runtime-primitives.js"

// 跨域公共响应结构：各业务模块通过组合（extend/引用）复用，
// 不直接对外承诺独立端点契约。

/** ASCII 控制字符检测：跨域字符串净化的共用原子。 */
export { hasAsciiControl }

/** Creates an exact object for a JSON response or nested response value. */
export function exactJsonResponse<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict()
}

/** Creates an exact object for a JSON error response. */
export function exactJsonError<T extends z.ZodRawShape>(shape: T) {
  return exactJsonResponse(shape)
}

/** Shared HTTP validation and not-found response: { error: string }. */
export const errorResponseSchema = exactJsonError({ error: z.string() })

/** Shared message-only HTTP authorization response: { message: string }. */
export const messageErrorResponseSchema = exactJsonError({ message: z.string() })

/** Shared failure envelope for HTTP errors: { success: false, message: string }. */
export const failureMessageResponseSchema = exactJsonError({
  success: z.literal(false),
  message: z.string(),
})

/** Shared errors emitted before a Backoffice-protected handler runs. */
export const backofficeProtectedHttpErrorSchema = z.union([
  errorResponseSchema,
  messageErrorResponseSchema,
  failureMessageResponseSchema,
])

/** Shared failure envelope for stable machine-readable errors. */
export const failureCodeResponseSchema = exactJsonError({
  success: z.literal(false),
  code: z.string(),
})

/** Shared 2xx business-error envelope used by compatibility routes. */
export const businessErrorResponseSchema = exactJsonError({
  status: z.literal("error"),
  msg: z.string(),
})

/** Explicit unknown-key policy for new JSON, query, and params contracts. */
export function strictRequestObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict()
}

/** Preserves a legacy boundary that accepts and projects unknown object keys. */
export function legacyStripRequestObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strip()
}

/** Preserves a legacy boundary that passes unknown object keys downstream. */
export function legacyPassthroughRequestObject<T extends z.ZodRawShape>(
  shape: T
) {
  return z.object(shape).passthrough()
}

/** 成功信封原子：{ success: true } */
export const successFlagSchema = exactJsonResponse({ success: z.literal(true) })

/** 组合成功信封：successEnvelope({ card }) => { success: true, card } */
export function successEnvelope<T extends z.ZodRawShape>(shape: T) {
  return successFlagSchema.extend(shape).strict()
}

/** 游标分页页信息（hasNextPage + 可空 nextCursor）。 */
export const cursorPageInfoSchema = exactJsonResponse({
  hasNextPage: z.boolean(),
  nextCursor: z.string().min(1).nullable(),
})

/** 快照游标分页页信息（含 snapshotAt 毫秒时间戳字符串）。 */
export const snapshotPageInfoSchema = exactJsonResponse({
  nextCursor: z.string().min(1).nullable(),
  hasNextPage: z.boolean(),
  snapshotAt: z.string().regex(/^\d+$/).nullable(),
})

/** 页码分页页信息。 */
export const numberedPageInfoSchema = exactJsonResponse({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
})

export type CursorPageInfo = z.infer<typeof cursorPageInfoSchema>
export type SnapshotPageInfo = z.infer<typeof snapshotPageInfoSchema>
export type NumberedPageInfo = z.infer<typeof numberedPageInfoSchema>

export type SuccessFlag = z.infer<typeof successFlagSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type MessageErrorResponse = z.infer<typeof messageErrorResponseSchema>
export type FailureMessageResponse = z.infer<typeof failureMessageResponseSchema>
export type BackofficeProtectedHttpError = z.infer<
  typeof backofficeProtectedHttpErrorSchema
>
export type FailureCodeResponse = z.infer<typeof failureCodeResponseSchema>
export type BusinessErrorResponse = z.infer<typeof businessErrorResponseSchema>
