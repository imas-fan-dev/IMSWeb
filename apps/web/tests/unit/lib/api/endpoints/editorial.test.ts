import { describe, expect, it } from "vitest"

import {
  installFetchMock,
  jsonResponse,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { setCsrfCookie } from "@/tests/unit/support/auth-cookies"
import {
  deleteAdminEditorial,
  deleteEditorialAsset,
  replaceAdminCommunitySpotlight,
} from "~/lib/api/endpoints/editorial"

describe("editorial API endpoints", () => {
  it("uses the shared success schema for the three editorial mutations", async () => {
    setCsrfCookie("backoffice", "editorial-test")
    const fetchMock = installFetchMock().mockResolvedValue(
      jsonResponse({ success: true })
    )

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
      fetchMock.mock.calls.map((call) => requestDetails(call))
    )
    expect(
      requests.map(({ method, url }) => [
        method,
        new URL(url, window.location.origin).pathname,
      ])
    ).toEqual([
      ["PUT", "/api/admin/community-posts/spotlight"],
      ["DELETE", "/api/admin/events/12"],
      ["DELETE", "/api/admin/articles/12/assets/4"],
    ])
    expect(requests[0]?.body).toBe(
      JSON.stringify({ items: [{ postId: 11, category: "activity" }] })
    )
    for (const request of requests) {
      expect(request.headers.get("X-CSRFToken")).toBe("editorial-test")
    }
  })

  it("validates protected HTTP errors without accepting extra fields", async () => {
    installFetchMock()
      .mockResolvedValueOnce(jsonResponse({ message: "unauthorized" }, 403))
      .mockResolvedValueOnce(
        jsonResponse({ message: "unauthorized", unexpected: true }, 403)
      )

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
