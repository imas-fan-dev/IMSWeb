import type { z } from "@imsweb/contracts/z"

import { ApiError } from "./api-error.js"
import { hasExactJsonStructure } from "./json-contract.js"
import type { ApiMethodMeta } from "./types.js"

/**
 * Alova method config bag accepted by `parsed`. Keys other than `meta` and
 * `select` are passed through to the client verb untouched (`cacheFor`,
 * `hitSource`, `params`, `headers`, ...).
 */
interface ParsedConfigBase {
  meta?: ApiMethodMeta
  errorSchema?: z.ZodType
  businessErrorSchema?: z.ZodType
  [option: string]: unknown
}

type ParsedResult<C, Out> = Omit<
  C,
  "meta" | "select" | "errorSchema" | "businessErrorSchema"
> & {
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
  const { select, meta, errorSchema, businessErrorSchema, ...rest } = config
  const parsedMeta: ApiMethodMeta = {
    ...(meta as ApiMethodMeta | undefined),
    parsed: true,
  }
  if (errorSchema) parsedMeta.errorSchema = errorSchema
  if (businessErrorSchema) parsedMeta.businessErrorSchema = businessErrorSchema

  return {
    ...rest,
    meta: parsedMeta,
    transform: (payload: unknown) => {
      const result = schema.safeParse(payload)
      if (!result.success || !hasExactJsonStructure(payload, result.data)) {
        throw new ApiError("响应不符合线上契约", {
          kind: "contract",
          code: "CONTRACT_VIOLATION",
          payload,
          cause: result.success ? undefined : result.error,
        })
      }
      return select ? select(result.data) : result.data
    },
  }
}
