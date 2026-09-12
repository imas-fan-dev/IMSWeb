import { successFlagSchema } from "@imsweb/contracts/common"
import { z } from "@imsweb/contracts/z"
import { describe, expect, it, vi } from "vitest"

import { resolveApiContract } from "../../e2e/fixtures/api-contract-catalog"
import { ApiDispatcher } from "../../e2e/fixtures/api-dispatcher"

type RouteMatcher = (url: URL) => boolean
type TestRoute = ReturnType<typeof makeRoute>
type RouteHandler = (route: TestRoute) => Promise<void>

function makeHarness() {
  let matcher: RouteMatcher | undefined
  let handler: RouteHandler | undefined
  const page = {
    route: vi.fn(
      async (nextMatcher: RouteMatcher, nextHandler: RouteHandler) => {
        matcher = nextMatcher
        handler = nextHandler
      }
    ),
    unroute: vi.fn(),
  }
  const dispatcher = new ApiDispatcher("https://example.test")
  return {
    dispatcher,
    page,
    async install() {
      await dispatcher.install(page as never)
    },
    matcher() {
      return matcher!
    },
    async dispatch(input: Parameters<typeof makeRoute>[0] = {}) {
      const route = makeRoute(input)
      await handler!(route)
      return route
    },
  }
}

function makeRoute({
  method = "GET",
  path = "/api/example",
  headers = {},
  body = null,
}: {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string | null
} = {}) {
  const request = {
    method: () => method,
    url: () => `https://example.test${path}`,
    headers: () => headers,
    postData: () => body,
  }
  return {
    request: () => request,
    fulfill: vi.fn(),
    abort: vi.fn(),
    continue: vi.fn(),
  }
}

const response = { responses: { 200: successFlagSchema } }

describe("ApiDispatcher", () => {
  it("matches exact method, path, query, and body while recording the request", async () => {
    const harness = makeHarness()
    const querySchema = z.object({ page: z.coerce.number().int() }).strict()
    const bodySchema = z.object({ title: z.string() }).strict()
    harness.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      query: querySchema,
      body: bodySchema,
      ...response,
      handle: ({ body, query }) => {
        expect(query).toEqual({ page: 2 })
        expect(body).toEqual({ title: "Example" })
        return { json: { success: true } }
      },
    })
    await harness.install()
    const route = await harness.dispatch({
      method: "POST",
      path: "/api/example?page=2",
      headers: { "x-csrftoken": "csrf" },
      body: JSON.stringify({ title: "Example" }),
    })

    expect(route.fulfill).toHaveBeenCalledWith({
      status: 200,
      json: { success: true },
      headers: undefined,
    })
    expect(harness.dispatcher.requests()).toMatchObject([
      {
        method: "POST",
        path: "/api/example",
        headers: { "x-csrftoken": "csrf" },
        rawQuery: { page: "2" },
        query: { page: 2 },
        jsonBody: { title: "Example" },
        body: { title: "Example" },
      },
    ])
    harness.dispatcher.assertSatisfied()
  })

  it("leaves non-API and cross-origin resources untouched", async () => {
    const harness = makeHarness()
    await harness.install()
    expect(
      harness.matcher()(new URL("https://example.test/image/logo.png"))
    ).toBe(false)
    expect(harness.matcher()(new URL("https://cdn.example/api/image"))).toBe(
      false
    )
    expect(harness.matcher()(new URL("https://example.test/api/events"))).toBe(
      true
    )
  })

  it("fails an unregistered path", async () => {
    const harness = makeHarness()
    await harness.install()
    const route = await harness.dispatch({ path: "/api/unknown?x=1" })
    expect(route.abort).toHaveBeenCalledWith("failed")
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "unregistered request: GET /api/unknown?x=1"
    )
  })

  it("does not globally allow formerly live API paths", async () => {
    const harness = makeHarness()
    await harness.install()
    const route = await harness.dispatch({ path: "/api/events" })
    expect(route.abort).toHaveBeenCalledWith("failed")
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "unregistered request: GET /api/events"
    )
  })

  it("fails a known path requested with the wrong method", async () => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await harness.install()
    await harness.dispatch({ method: "GET" })
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "wrong method GET; expected POST"
    )
  })

  it("rejects duplicate and ambiguous registrations", () => {
    const harness = makeHarness()
    const expectation = {
      method: "GET" as const,
      path: "/api/example",
      ...response,
      handle: () => ({ json: { success: true } }),
    }
    harness.dispatcher.expect(expectation)
    expect(() => harness.dispatcher.expect(expectation)).toThrow(
      "duplicate API registration"
    )

    const eventExpectation = {
      ...expectation,
      path: "/api/events",
    }
    const passThroughThenExpectation = makeHarness()
    passThroughThenExpectation.dispatcher.passThrough({
      name: "live events",
      reason: "browser integration boundary",
      method: "GET",
      path: "/api/events",
    })
    expect(() =>
      passThroughThenExpectation.dispatcher.expect(eventExpectation)
    ).toThrow("ambiguous API registration")

    const expectationThenPassThrough = makeHarness()
    expectationThenPassThrough.dispatcher.expect(eventExpectation)
    expect(() =>
      expectationThenPassThrough.dispatcher.passThrough({
        name: "live events",
        reason: "browser integration boundary",
        method: "GET",
        path: "/api/events",
      })
    ).toThrow("ambiguous API registration")
  })

  it("requires one explicit uppercase method at the type and runtime boundary", () => {
    const harness = makeHarness()
    expect(() => {
      // @ts-expect-error The compatibility API intentionally requires a method.
      harness.dispatcher.mockRoute("/api/events", vi.fn())
    }).toThrow("requires exactly one uppercase HTTP method: undefined")
    expect(() =>
      harness.dispatcher.mockRoute("/api/events", vi.fn(), ["GET"] as never)
    ).toThrow("requires exactly one uppercase HTTP method: GET")
    expect(() =>
      harness.dispatcher.mockRoute("/api/events", vi.fn(), "get" as never)
    ).toThrow("requires exactly one uppercase HTTP method: get")
  })

  it("expects compatibility mocks exactly once by default", () => {
    const harness = makeHarness()
    harness.dispatcher.mockRoute(
      "/api/events",
      (route) => route.fulfill({ json: { success: true } }),
      "GET"
    )
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "GET /api/events received 0, expected 1"
    )
  })

  it.each([
    ["query", "/api/example?page=1&extra=true", null],
    [
      "body",
      "/api/example?page=1",
      JSON.stringify({ title: "ok", extra: true }),
    ],
  ])("fails extra or invalid %s fields", async (_kind, path, body) => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      query: z.object({ page: z.string() }).strip(),
      body: z.object({ title: z.string() }).strip(),
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await harness.install()
    await harness.dispatch({ method: "POST", path, body })
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      /keys were changed by its contract|invalid body/
    )
  })

  it.each([
    ["query", "/api/example?unexpected=1", null],
    ["body", "/api/example", JSON.stringify({ unexpected: true })],
  ])("fails an undeclared %s", async (_kind, path, body) => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await harness.install()
    await harness.dispatch({ method: "POST", path, body })
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      /received undeclared (query|body)/
    )
  })

  it("permits only a named, reasoned request projection", async () => {
    const missingReason = makeHarness()
    missingReason.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      body: {
        schema: z.object({ title: z.string() }).strip(),
        projection: { name: "legacy", reason: "" },
      },
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await missingReason.install()
    await missingReason.dispatch({
      method: "POST",
      body: JSON.stringify({ title: "ok", extra: true }),
    })
    expect(() => missingReason.dispatcher.assertSatisfied()).toThrow(
      "projection requires a non-empty name and reason"
    )

    const named = makeHarness()
    named.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      body: {
        schema: z.object({ title: z.string() }).strip(),
        projection: {
          name: "legacy request projection",
          reason: "the production endpoint intentionally ignores unknown keys",
        },
      },
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await named.install()
    await named.dispatch({
      method: "POST",
      body: JSON.stringify({ title: "ok", extra: true }),
    })
    named.dispatcher.assertSatisfied()
  })

  it("fails undeclared response statuses", async () => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      ...response,
      handle: () => ({ status: 503, json: { error: "Unavailable" } }),
    })
    await harness.install()
    await harness.dispatch()
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "returned undeclared status 503"
    )
  })

  it.each([
    [200, { success: false }],
    [503, { error: 503 }],
  ])("fails invalid success and error payloads", async (status, json) => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      responses: {
        200: successFlagSchema,
        503: z.object({ error: z.string() }).strict(),
      },
      handle: () => ({ status, json }),
    })
    await harness.install()
    await harness.dispatch()
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      `returned invalid status ${status} JSON`
    )
  })

  it("fails response schemas that alter otherwise accepted JSON", async () => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      responses: { 200: z.object({ success: z.literal(true) }).strip() },
      handle: () => ({ json: { success: true, hidden: true } }),
    })
    await harness.install()
    await harness.dispatch()
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "returned non-exact status 200 JSON"
    )
  })

  it("fails unmet and over-times expectations", async () => {
    const unmet = makeHarness()
    unmet.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      ...response,
      times: 2,
      handle: () => ({ json: { success: true } }),
    })
    expect(() => unmet.dispatcher.assertSatisfied()).toThrow(
      "received 0, expected 2"
    )

    const over = makeHarness()
    over.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await over.install()
    await over.dispatch()
    const route = await over.dispatch()
    expect(route.abort).toHaveBeenCalledWith("failed")
    expect(() => over.dispatcher.assertSatisfied()).toThrow("exceeded times 1")
  })

  it("allows only named and reasoned exact API pass-throughs", async () => {
    const harness = makeHarness()
    expect(() =>
      harness.dispatcher.passThrough({
        name: "",
        reason: "",
        method: "GET",
        path: "/api/example",
      })
    ).toThrow("require a non-empty name and reason")
    harness.dispatcher.passThrough({
      name: "live browser contract",
      reason: "the test verifies the deployed API response",
      method: "GET",
      path: "/api/events",
      times: 1,
    })
    await harness.install()
    const route = await harness.dispatch({ path: "/api/events" })
    expect(route.continue).toHaveBeenCalledOnce()
    harness.dispatcher.assertSatisfied()
  })

  it("rejects an ambiguous JSON and raw body registration", () => {
    const harness = makeHarness()
    expect(() =>
      harness.dispatcher.expect({
        method: "POST",
        path: "/api/example",
        body: z.object({ title: z.string() }).strict(),
        rawBody: {
          name: "raw request",
          reason: "the endpoint accepts text",
          schema: z.string(),
        },
        ...response,
        handle: () => ({ json: { success: true } }),
      })
    ).toThrow("cannot declare both body and rawBody")
  })

  it("validates a declared raw body content type", async () => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "POST",
      path: "/api/example",
      rawBody: {
        name: "multipart request",
        reason: "the endpoint accepts FormData",
        schema: z.string().min(1),
        contentType: z.string().regex(/^multipart\/form-data;/),
      },
      ...response,
      handle: () => ({ json: { success: true } }),
    })
    await harness.install()
    await harness.dispatch({
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not multipart",
    })
    expect(() => harness.dispatcher.assertSatisfied()).toThrow(
      "received invalid content-type"
    )
  })

  it("accepts any exact configured response alternative", async () => {
    const harness = makeHarness()
    harness.dispatcher.expect({
      method: "GET",
      path: "/api/example",
      responses: {
        200: [
          successFlagSchema,
          z.object({ success: z.literal(false), error: z.string() }).strict(),
        ],
      },
      handle: () => ({ json: { success: false, error: "Unavailable" } }),
    })
    await harness.install()
    const route = await harness.dispatch()
    expect(route.fulfill).toHaveBeenCalledOnce()
    harness.dispatcher.assertSatisfied()
  })

  it("clears installation state when route setup or teardown fails", async () => {
    const setup = makeHarness()
    setup.page.route.mockRejectedValueOnce(new Error("route failed"))
    await expect(setup.dispatcher.install(setup.page as never)).rejects.toThrow(
      "route failed"
    )
    await expect(setup.dispatcher.install(setup.page as never)).resolves.toBe(
      undefined
    )

    const teardown = makeHarness()
    await teardown.install()
    teardown.page.unroute.mockRejectedValueOnce(new Error("unroute failed"))
    await expect(teardown.dispatcher.dispose()).rejects.toThrow(
      "unroute failed"
    )
    await expect(
      teardown.dispatcher.install(teardown.page as never)
    ).resolves.toBe(undefined)
  })

  it("rejects invalid response status declarations", () => {
    const harness = makeHarness()
    expect(() =>
      harness.dispatcher.expect({
        method: "GET",
        path: "/api/example",
        responses: { 99: successFlagSchema },
        handle: () => ({ json: { success: true } }),
      })
    ).toThrow("declares invalid response status 99")
    expect(() =>
      harness.dispatcher.expect({
        method: "GET",
        path: "/api/example",
        responses: { 200: [] },
        handle: () => ({ json: { success: true } }),
      })
    ).toThrow("status 200 must declare at least one response schema")
  })

  it("anchors dynamic catalog paths to their owning API namespaces", () => {
    expect(() =>
      resolveApiContract(
        "GET",
        "/api/community/exchange/me/offices/office-1/location"
      )
    ).not.toThrow()
    expect(() =>
      resolveApiContract("GET", "/api/unrelated/me/offices/office-1/location")
    ).toThrow("No contracts catalog entry")
    expect(() =>
      resolveApiContract(
        "PUT",
        "/api/admin/offices/office-1/cards/card-1/placement"
      )
    ).toThrow("No contracts catalog entry")
    expect(() =>
      resolveApiContract(
        "GET",
        "/api/x/api/admin/wiki/agencies/1/story-cover-assets"
      )
    ).toThrow("No contracts catalog entry")
    expect(() =>
      resolveApiContract("PUT", "/api/admin/homepage-links/order")
    ).toThrow("No contracts catalog entry")
  })
})
