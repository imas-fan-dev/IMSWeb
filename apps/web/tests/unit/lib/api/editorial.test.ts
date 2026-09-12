import { afterEach, describe, expect, it, vi } from "vitest"

import { getEditorialEvent } from "~/lib/api"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("getEditorialEvent", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the API-normalized response used by historical list entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          id: 31,
          title: "历史活动",
          summary: "",
          name: "旧活动发布者",
          contact: null,
          image_url: null,
          created_at: "2026-08-01T10:00:00.000Z",
          cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
          body_html: "",
          status: "published",
          revision: 0,
          related_links: [],
        })
      )
    )

    const result = await getEditorialEvent("31").send()

    expect(result.status).toBe("published")
    expect(result.revision).toBe(0)
    expect(result.body_html).toBe("")
    expect(result.created_at).toBe("2026-08-01T10:00:00.000Z")
  })

  it("rejects an incomplete legacy row instead of filling response defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ id: 31, title: "历史活动" }))
    )

    await expect(getEditorialEvent("31").send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
    })
  })
})
