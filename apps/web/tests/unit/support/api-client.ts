import { vi } from "vitest"

/**
 * Normalized view of one `fetch` call recorded by a mocked global `fetch`.
 *
 * `url` stays a plain string so callers can compare it directly or hand it to
 * `new URL(...)` when they need a pathname.
 */
export type RequestDetails = {
  body: BodyInit | null | undefined
  headers: Headers
  method: string
  url: string
}

export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

/**
 * Normalizes a `fetch` argument pair into a `Request`.
 *
 * Mock implementations receive either a `Request` or a URL plus `init`; this
 * makes both shapes readable through one interface.
 */
export function requestFrom(
  input: RequestInfo | URL,
  init?: RequestInit
): Request {
  return input instanceof Request
    ? input
    : new Request(new URL(String(input), "http://ims.test"), init)
}

/**
 * Reads one entry of `fetchMock.mock.calls`.
 *
 * Usage: `fetchMock.mock.calls.map((call) => requestDetails(call))`.
 */
export function requestDetails(call: unknown[]): RequestDetails {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined]
  if (input instanceof Request) {
    return {
      body: input.body,
      headers: input.headers,
      method: input.method,
      url: input.url,
    }
  }
  return {
    body: init?.body ?? null,
    headers: new Headers(init?.headers),
    method: init?.method ?? "GET",
    url: String(input),
  }
}

export function successResponse(payload: unknown = { status: "success" }) {
  return Response.json(payload)
}

/**
 * Builds a JSON `Response` for a mocked `fetch`.
 *
 * `status` defaults to 200, which is what a bare `Response.json(payload)`
 * produces; pass a status for error and business-error envelopes.
 */
export function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}

/**
 * Installs a mocked global `fetch` and returns the mock so a test can chain
 * `mockResolvedValue` / `mockImplementation` onto it and inspect
 * `fetchMock.mock.calls`.
 */
export function installFetchMock(
  implementation?: (...args: Parameters<typeof fetch>) => Promise<Response>
): FetchMock {
  const fetchMock = implementation
    ? vi.fn<typeof fetch>().mockImplementation(implementation)
    : vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
