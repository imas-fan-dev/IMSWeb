import { afterEach, describe, expect, it, vi } from "vitest"

const API_ORIGIN = "https://api.imsweb.test"

async function loadEventsEndpoint() {
  vi.resetModules()
  vi.stubEnv("VITE_IMS_API_ORIGIN", API_ORIGIN)
  vi.stubEnv("VITE_IMS_APP_TARGET", "app")
  return import("~/lib/api/endpoints/events")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe("event endpoints", () => {
  it("validates and normalizes event poster URLs at the API boundary", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: 1,
              title: "夏日活动",
              image_url: "/uploads/events/summer/poster.webp",
            },
          ],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: "1",
          },
        }),
        { headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { getEventPage } = await loadEventsEndpoint()
    const page = await getEventPage().send()

    expect(page.items[0]?.image_url).toBe(
      `${API_ORIGIN}/uploads/events/summer/poster.webp`
    )
  })
})
