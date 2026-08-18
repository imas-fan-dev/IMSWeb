import type { z } from "@imsweb/contracts/z"

import { ApiError } from "./api-error"
import type { ApiMethodMeta } from "./types"

/**
 * Alova method config bag accepted by `parsed`. Keys other than `meta` and
 * `select` are passed through to the client verb untouched (`cacheFor`,
 * `hitSource`, `params`, `headers`, ...).
 */
interface ParsedConfigBase {
  meta?: ApiMethodMeta
  [option: string]: unknown
}

type ParsedResult<C, Out> = Omit<C, "meta" | "select"> & {
  meta: ApiMethodMeta
  transform: (payload: unknown) => Out
}

/**
 * Build an alova method config that validates the JSON payload against a
 * shared wire-contract schema. The method's response type is inferred from
 * the schema (or `select` projection), so call sites write neither manual
 * generics nor hand-rolled `transform` closures:
 *
 *   apiClient.Get(url, parsed(schema, { cacheFor }))
 *
 * Contract violations surface as `ApiError` kind "contract" instead of a
 * bare ZodError. Sets `meta.parsed` so the response interceptor can flag
 * endpoints that skip wire-contract validation.
 */
export function parsed<S extends z.ZodType, C extends ParsedConfigBase>(
  schema: S,
  config?: C & { select?: undefined }
): ParsedResult<C, z.output<S>>
export function parsed<S extends z.ZodType, T, C extends ParsedConfigBase>(
  schema: S,
  config: C & { select: (data: z.output<S>) => T }
): ParsedResult<C, T>
export function parsed(
  schema: z.ZodType,
  config: ParsedConfigBase & { select?: (data: unknown) => unknown } = {}
): ParsedResult<ParsedConfigBase, unknown> {
  const { select, meta, ...rest } = config
  return {
    ...rest,
    meta: { ...(meta as ApiMethodMeta | undefined), parsed: true },
    transform: (payload: unknown) => {
      const result = schema.safeParse(payload)
      if (!result.success) {
        throw new ApiError("响应不符合线上契约", {
          kind: "contract",
          code: "CONTRACT_VIOLATION",
          payload,
          cause: result.error,
        })
      }
      return select ? select(result.data) : result.data
    },
  }
}
