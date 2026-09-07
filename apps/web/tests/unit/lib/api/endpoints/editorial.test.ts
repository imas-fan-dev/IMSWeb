import { afterEach, describe, expect, it, vi } from "vitest"

import {
  deleteAdminEditorial,
  deleteEditorialAsset,
  replaceAdminCommunitySpotlight,
} from "~/lib/api/endpoints/editorial"

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const request = new Request(
    new URL(String(input), window.location.origin),
    init
  )
  return {
    body: request.body ? request.text() : Promise.resolve(undefined),
    headers: request.headers,
    method: request.method,
    url: new URL(request.url, window.location.origin),
  }
}

describe("editorial API endpoints", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("uses the shared success schema for the three editorial mutations", async () => {
    document.cookie = "ims_admin_csrf=editorial-test; path=/"
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      replaceAdminCommunitySpotlight([
        { postId: 11, category: "activity" },
      ]).send()
    ).resolves.toEqual({ success: true })
    await expect(deleteAdminEditorial("events", 12).send()).resolves.toEqual({
      success: true,
    })
    await expect(deleteEditorialAsset(12, 4).send()).resolves.toEqual({
      success: true,
    })

    const requests = await Promise.all(
      fetchMock.mock.calls.map(([input, init]) => requestDetails(input, init))
    )
    expect(requests.map(({ method, url }) => [method, url.pathname])).toEqual([
      ["PUT", "/api/admin/community-posts/spotlight"],
      ["DELETE", "/api/admin/events/12"],
      ["DELETE", "/api/admin/articles/12/assets/4"],
    ])
    expect(await requests[0]?.body).toBe(
      JSON.stringify({ items: [{ postId: 11, category: "activity" }] })
    )
    for (const request of requests) {
      expect(request.headers.get("X-CSRFToken")).toBe("editorial-test")
    }
  })

  it("validates protected HTTP errors without accepting extra fields", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ message: "unauthorized" }, 403))
      .mockResolvedValueOnce(
        jsonResponse({ message: "unauthorized", unexpected: true }, 403)
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      deleteAdminEditorial("chronicle", 12).send()
    ).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: { message: "unauthorized" },
    })
    await expect(
      deleteAdminEditorial("chronicle", 12).send()
    ).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 403,
    })
  })
})
