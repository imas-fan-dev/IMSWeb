import type { BrowserContext, Request, Route } from "@playwright/test"
import type { z } from "@imsweb/contracts/z"

import { hasExactJsonStructure } from "../../../app/lib/api/json-contract"
import { resolveApiContract } from "./api-contract-catalog"

type Schema = z.ZodTypeAny
type ResponseSchema = Schema | readonly Schema[]
type HttpMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"

export type ApiTimes = number | { min: number; max: number }

const HTTP_METHODS: readonly HttpMethod[] = [
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]

type RequestProjection = {
  name: string
  reason: string
}

type SchemaInput<TSchema extends Schema> = {
  schema: TSchema
  projection?: RequestProjection
}

export type ApiResponse = {
  status?: number
  json: unknown
  headers?: Record<string, string>
}

export type ApiRequestRecord = {
  method: string
  url: string
  path: string
  headers: Record<string, string>
  rawQuery: Record<string, string | string[]>
  query: unknown
  rawBody: string | null
  jsonBody: unknown
  body: unknown
}

type ApiHandlerContext<TQuery extends Schema, TBody extends Schema> = {
  request: Request
  record: ApiRequestRecord
  query: z.output<TQuery>
  body: z.output<TBody>
}

export type ApiExpectation<
  TQuery extends Schema = Schema,
  TBody extends Schema = Schema,
> = {
  name?: string
  method: HttpMethod
  path: string
  query?: TQuery | SchemaInput<TQuery>
  body?: TBody | SchemaInput<TBody>
  rawBody?: {
    name: string
    reason: string
    schema: Schema
    contentType?: Schema
  }
  responses: Record<number, ResponseSchema>
  times?: ApiTimes
  handle: (
    context: ApiHandlerContext<TQuery, TBody>
  ) => ApiResponse | Promise<ApiResponse>
}

export type ApiPassThrough = {
  name: string
  reason: string
  method: HttpMethod
  path: string
  query?: Schema | SchemaInput<Schema>
  body?: Schema | SchemaInput<Schema>
  times?: ApiTimes
}

type RegisteredExpectation = Omit<
  ApiExpectation,
  "body" | "handle" | "query"
> & {
  body?: Schema | SchemaInput<Schema>
  query?: Schema | SchemaInput<Schema>
  handle: (context: {
    request: Request
    record: ApiRequestRecord
    query: unknown
    body: unknown
  }) => ApiResponse | Promise<ApiResponse>
  count: number
  range: { min: number; max: number }
}

type RegisteredPassThrough = ApiPassThrough & {
  count: number
  range: { min: number; max: number }
}

type Registration = RegisteredExpectation | RegisteredPassThrough
type ParseResult = { ok: true; value: unknown } | { ok: false; error: string }

const isPassThrough = (
  registration: Registration
): registration is RegisteredPassThrough => "reason" in registration

function asSchemaInput(input: Schema | SchemaInput<Schema>) {
  return "schema" in input ? input : { schema: input }
}

function normalizeTimes(times: ApiTimes | undefined) {
  if (times === undefined) return { min: 1, max: 1 }
  if (typeof times === "number") {
    if (!Number.isInteger(times) || times < 0) {
      throw new Error("API expectation times must be a non-negative integer")
    }
    return { min: times, max: times }
  }
  if (
    !Number.isInteger(times.min) ||
    !Number.isInteger(times.max) ||
    times.min < 0 ||
    times.max < times.min
  ) {
    throw new Error(
      "API expectation times range must use non-negative integers with max >= min"
    )
  }
  return times
}

function queryRecord(url: URL): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    result[key] = values.length === 1 ? values[0]! : values
  }
  return result
}

function hasSameJsonKeys(raw: unknown, parsed: unknown): boolean {
  if (Array.isArray(raw)) {
    return (
      Array.isArray(parsed) &&
      raw.length === parsed.length &&
      raw.every((value, index) => hasSameJsonKeys(value, parsed[index]))
    )
  }
  if (isPlainObject(raw)) {
    if (!isPlainObject(parsed)) return false
    const rawKeys = Object.keys(raw)
    const parsedKeys = Object.keys(parsed)
    return (
      rawKeys.length === parsedKeys.length &&
      rawKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(parsed, key) &&
          hasSameJsonKeys(raw[key], parsed[key])
      )
    )
  }
  return !Array.isArray(parsed) && !isPlainObject(parsed)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function schemaError(result: z.SafeParseError<unknown>) {
  return result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ")
}

function registrationLabel(registration: Registration) {
  return registration.name ?? `${registration.method} ${registration.path}`
}

export class ApiDispatcher {
  readonly #origin: string
  readonly #registrations: Registration[] = []
  readonly #records: ApiRequestRecord[] = []
  readonly #violations: string[] = []
  #context: BrowserContext | undefined
  #routeMatcher: ((url: URL) => boolean) | undefined
  #routeHandler: ((route: Route) => Promise<void>) | undefined

  constructor(baseURL: string) {
    this.#origin = new URL(baseURL).origin
  }

  async install(context: BrowserContext) {
    if (this.#context) throw new Error("API dispatcher is already installed")
    this.#context = context
    this.#routeMatcher = (url) =>
      url.origin === this.#origin &&
      (url.pathname === "/api" || url.pathname.startsWith("/api/"))
    this.#routeHandler = (route) => this.#dispatch(route)
    try {
      await context.route(this.#routeMatcher, this.#routeHandler)
    } catch (error) {
      this.#context = undefined
      this.#routeMatcher = undefined
      this.#routeHandler = undefined
      throw error
    }
  }

  async dispose() {
    if (this.#context && this.#routeMatcher && this.#routeHandler) {
      try {
        await this.#context.unroute(this.#routeMatcher, this.#routeHandler)
      } finally {
        this.#context = undefined
        this.#routeMatcher = undefined
        this.#routeHandler = undefined
      }
      return
    }
    this.#context = undefined
    this.#routeMatcher = undefined
    this.#routeHandler = undefined
  }

  expect<TQuery extends Schema = Schema, TBody extends Schema = Schema>(
    expectation: ApiExpectation<TQuery, TBody>
  ) {
    this.#validateEndpoint(expectation.method, expectation.path)
    if (expectation.body && expectation.rawBody) {
      throw new Error(
        `${expectation.method} ${expectation.path} cannot declare both body and rawBody`
      )
    }
    if (Object.keys(expectation.responses).length === 0) {
      throw new Error(
        `${expectation.method} ${expectation.path} must declare at least one response status`
      )
    }
    for (const [status, schemas] of Object.entries(expectation.responses)) {
      const parsedStatus = Number(status)
      if (
        !Number.isInteger(parsedStatus) ||
        parsedStatus < 100 ||
        parsedStatus > 599
      ) {
        throw new Error(
          `${expectation.method} ${expectation.path} declares invalid response status ${status}`
        )
      }
      if (Array.isArray(schemas) && schemas.length === 0) {
        throw new Error(
          `${expectation.method} ${expectation.path} status ${status} must declare at least one response schema`
        )
      }
    }
    const existing = this.#registrations.find(
      (item) =>
        item.method === expectation.method && item.path === expectation.path
    )
    if (existing) {
      const kind = isPassThrough(existing) ? "ambiguous" : "duplicate"
      throw new Error(
        `${kind} API registration for ${expectation.method} ${expectation.path}; already registered as ${registrationLabel(existing)}`
      )
    }
    this.#registrations.push({
      ...expectation,
      handle: (context) =>
        expectation.handle(context as ApiHandlerContext<TQuery, TBody>),
      count: 0,
      range: normalizeTimes(expectation.times),
    })
  }

  mockRoute(
    matcher: string,
    handler: (route: Route) => unknown | Promise<unknown>,
    method: HttpMethod,
    times?: ApiTimes
  ) {
    const path = matcher
      .replace(/^\*\*/, "")
      .replace(/[?]\*+$/, "")
      .replace(/\*+$/, "")
    this.mock({ method, path, times }, handler)
  }

  mock(
    options: {
      method: HttpMethod
      path: string
      times?: ApiTimes
      name?: string
    },
    handler: (route: Route) => unknown | Promise<unknown>
  ) {
    this.#validateEndpoint(options.method, options.path)
    const contract = resolveApiContract(options.method, options.path)
    this.expect({
      ...contract,
      name: options.name,
      method: options.method,
      path: options.path,
      times: options.times,
      handle: async ({ request }) => {
        let response: ApiResponse | undefined
        const legacyRoute = {
          request: () => request,
          fulfill: async (fulfill: Parameters<Route["fulfill"]>[0] = {}) => {
            let json = fulfill.json
            if (json === undefined && fulfill.body !== undefined) {
              const text = Buffer.isBuffer(fulfill.body)
                ? fulfill.body.toString("utf8")
                : fulfill.body
              json = JSON.parse(text)
            }
            response = {
              status: fulfill.status,
              json,
              headers: {
                ...(fulfill.headers ?? {}),
                ...(fulfill.contentType
                  ? { "content-type": fulfill.contentType }
                  : {}),
              },
            }
          },
          abort: async () => {
            throw new Error("mock handler aborted a contract-matched request")
          },
          continue: async () => {
            throw new Error(
              "mock handler attempted pass-through without a named registration"
            )
          },
        }
        await handler(legacyRoute as unknown as Route)
        if (!response) {
          throw new Error("mock handler did not fulfill the request")
        }
        return response
      },
    })
  }

  passThrough(passThrough: ApiPassThrough) {
    this.#validateEndpoint(passThrough.method, passThrough.path)
    if (!passThrough.name.trim() || !passThrough.reason.trim()) {
      throw new Error("API pass-throughs require a non-empty name and reason")
    }
    const existing = this.#registrations.find(
      (item) =>
        item.method === passThrough.method && item.path === passThrough.path
    )
    if (existing) {
      throw new Error(
        `ambiguous API registration for ${passThrough.method} ${passThrough.path}; already registered as ${registrationLabel(existing)}`
      )
    }
    const contract = resolveApiContract(passThrough.method, passThrough.path)
    this.#registrations.push({
      ...passThrough,
      query: passThrough.query ?? contract.query,
      body: passThrough.body ?? contract.body,
      count: 0,
      range: normalizeTimes(passThrough.times),
    })
  }

  requests(filter: { method?: string; path?: string } = {}) {
    return this.#records.filter(
      (record) =>
        (!filter.method || record.method === filter.method.toUpperCase()) &&
        (!filter.path || record.path === filter.path)
    )
  }

  assertSatisfied() {
    const unmet = this.#registrations
      .filter((item) => item.count < item.range.min)
      .map(
        (item) =>
          `${registrationLabel(item)} received ${item.count}, expected ${formatRange(item.range)}`
      )
    const failures = [...this.#violations, ...unmet]
    if (failures.length > 0) {
      throw new Error(
        `Playwright API dispatcher failed:\n- ${failures.join("\n- ")}`
      )
    }
  }

  #validateEndpoint(method: unknown, path: string) {
    if (
      typeof method !== "string" ||
      !HTTP_METHODS.includes(method as HttpMethod)
    ) {
      throw new Error(
        `API registration requires exactly one uppercase HTTP method: ${String(method)}`
      )
    }
    if (!path.startsWith("/api/") && path !== "/api") {
      throw new Error(
        `API path must be an exact same-origin /api path: ${path}`
      )
    }
    if (path.includes("?") || path.includes("*") || path.includes(":")) {
      throw new Error(
        `API path must not contain query strings or patterns: ${path}`
      )
    }
  }

  async #dispatch(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method().toUpperCase()
    const rawQuery = queryRecord(url)
    const rawBody = request.postData()
    const record: ApiRequestRecord = {
      method,
      url: request.url(),
      path: url.pathname,
      headers: request.headers(),
      rawQuery,
      query: undefined,
      rawBody,
      jsonBody: undefined,
      body: undefined,
    }
    this.#records.push(record)

    const registration = this.#registrations.find(
      (item) => item.method === method && item.path === url.pathname
    )
    if (!registration) {
      const knownMethods = this.#registrations
        .filter((item) => item.path === url.pathname)
        .map((item) => item.method)
      const detail = knownMethods.length
        ? `wrong method ${method}; expected ${knownMethods.join(", ")}`
        : "unregistered request"
      await this.#fail(
        route,
        `${detail}: ${method} ${url.pathname}${url.search}`
      )
      return
    }

    if (registration.count >= registration.range.max) {
      await this.#fail(
        route,
        `${registrationLabel(registration)} exceeded times ${formatRange(registration.range)}`
      )
      return
    }
    registration.count += 1

    const query = this.#parseInput(
      "query",
      rawQuery,
      registration.query,
      registration
    )
    if (!query.ok) {
      await this.#fail(route, query.error)
      return
    }
    record.query = query.value

    let jsonBody: unknown
    let body: ParseResult
    if (!isPassThrough(registration) && registration.rawBody) {
      const boundary = registration.rawBody
      if (!boundary.name.trim() || !boundary.reason.trim()) {
        await this.#fail(
          route,
          `${registrationLabel(registration)} raw body boundary requires a non-empty name and reason`
        )
        return
      }
      if (boundary.contentType) {
        const contentType = record.headers["content-type"]
        const parsedContentType = boundary.contentType.safeParse(contentType)
        if (!parsedContentType.success) {
          await this.#fail(
            route,
            `${registrationLabel(registration)} received invalid content-type: ${schemaError(parsedContentType)}`
          )
          return
        }
      }
      body = this.#parseInput(
        "body",
        rawBody,
        boundary.schema,
        registration,
        rawBody !== null
      )
    } else {
      if (rawBody !== null) {
        try {
          jsonBody = JSON.parse(rawBody)
        } catch {
          await this.#fail(
            route,
            `${registrationLabel(registration)} sent a non-JSON request body`
          )
          return
        }
      }
      body = this.#parseInput(
        "body",
        jsonBody,
        registration.body,
        registration,
        rawBody !== null
      )
    }
    record.jsonBody = jsonBody
    if (!body.ok) {
      await this.#fail(route, body.error)
      return
    }
    record.body = body.value

    if (isPassThrough(registration)) {
      await route.continue()
      return
    }

    let response: ApiResponse
    try {
      response = await registration.handle({
        request,
        record,
        query: query.value,
        body: body.value,
      })
    } catch (error) {
      await this.#fail(
        route,
        `${registrationLabel(registration)} handler failed: ${errorMessage(error)}`
      )
      return
    }
    const status = response.status ?? 200
    const configuredResponse = registration.responses[status]
    if (!configuredResponse) {
      await this.#fail(
        route,
        `${registrationLabel(registration)} returned undeclared status ${status}`
      )
      return
    }
    const responseSchemas: readonly Schema[] = Array.isArray(configuredResponse)
      ? configuredResponse
      : [configuredResponse as Schema]
    const results = responseSchemas.map((schema) =>
      schema.safeParse(response.json)
    )
    const exact = results.find(
      (result) =>
        result.success && hasExactJsonStructure(response.json, result.data)
    )
    if (!exact && results.some((result) => result.success)) {
      await this.#fail(
        route,
        `${registrationLabel(registration)} returned non-exact status ${status} JSON`
      )
      return
    }
    if (!exact) {
      const errors = results
        .filter(
          (result): result is z.SafeParseError<unknown> => !result.success
        )
        .map(schemaError)
        .join(" | ")
      await this.#fail(
        route,
        `${registrationLabel(registration)} returned invalid status ${status} JSON: ${errors}`
      )
      return
    }
    await route.fulfill({
      status,
      json: response.json,
      headers: response.headers,
    })
  }

  #parseInput(
    kind: "body" | "query",
    raw: unknown,
    input: Schema | SchemaInput<Schema> | undefined,
    registration: Registration,
    bodyPresent = true
  ): ParseResult {
    const present =
      kind === "query" ? Object.keys(raw as object).length > 0 : bodyPresent
    if (!input) {
      if (present) {
        return {
          ok: false,
          error: `${registrationLabel(registration)} received undeclared ${kind}`,
        }
      }
      return { ok: true, value: undefined }
    }
    const { schema, projection } = asSchemaInput(input)
    if (projection && (!projection.name.trim() || !projection.reason.trim())) {
      return {
        ok: false,
        error: `${registrationLabel(registration)} ${kind} projection requires a non-empty name and reason`,
      }
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return {
        ok: false,
        error: `${registrationLabel(registration)} received invalid ${kind}: ${schemaError(parsed)}`,
      }
    }
    if (!projection && !hasSameJsonKeys(raw, parsed.data)) {
      return {
        ok: false,
        error: `${registrationLabel(registration)} received ${kind} whose keys were changed by its contract`,
      }
    }
    return { ok: true, value: parsed.data }
  }

  async #fail(route: Route, message: string) {
    this.#violations.push(message)
    await route.abort("failed")
  }
}

function formatRange(range: { min: number; max: number }) {
  return range.min === range.max
    ? String(range.min)
    : `${range.min}..${range.max}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
