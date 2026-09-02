import { afterEach, describe, expect, it, vi } from "vitest"

import { getEditorialEvent } from "~/lib/api"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("getEditorialEvent", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts the legacy public event response used by historical list entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          id: 31,
          title: "历史活动",
          name: "旧活动发布者",
          contact: null,
          image_url: null,
          created_at: "2026-08-01T10:00:00.000Z",
        })
      )
    )

    const result = await getEditorialEvent("31").send()

    expect(result.status).toBe("published")
    expect(result.revision).toBe(0)
    expect(result.body_html).toBe("")
    expect(result.created_at).toBe("2026-08-01T10:00:00.000Z")
  })
})
