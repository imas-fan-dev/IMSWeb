import { expect, it, vi } from "vitest"
import { createMapboxPlaceSearch } from "~/lib/api"
import { mapboxGeocodingResponseSchema } from "@imsweb/contracts/fudaba/map-delivery"

const response = {
  type: "FeatureCollection",
  attribution: "vendor attribution",
  extra: "preserved",
  features: [
    {
      type: "Feature",
      id: "vendor-id",
      geometry: { type: "Point", coordinates: [139.69, 35.68] },
      properties: {
        mapbox_id: "place.tokyo",
        name: "東京",
        full_address: "東京都 日本",
        feature_type: "place",
        context: { country: { name: "日本" } },
      },
    },
  ],
}
it("uses worldwide temporary geocoding without portal credentials, cache or redirects", async () => {
  const fetch = vi.fn(async () => Response.json(response))
  vi.stubGlobal("fetch", fetch)
  const result = await createMapboxPlaceSearch("pk.public-test-token")(
    "東京",
    new AbortController().signal
  )
  const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
  expect(url.origin + url.pathname).toBe(
    "https://api.mapbox.com/search/geocode/v6/forward"
  )
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "東京",
    access_token: "pk.public-test-token",
    autocomplete: "false",
    limit: "5",
    permanent: "false",
  })
  expect(options).toMatchObject({
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal: expect.any(AbortSignal),
  })
  expect(result).toEqual({
    items: [
      {
        id: "place.tokyo",
        label: "東京",
        address: "東京都 日本",
        target: { kind: "wgs84", position: [139.69, 35.68] },
      },
    ],
    attribution: "© Mapbox",
  })
  expect(mapboxGeocodingResponseSchema.parse(response)).toEqual(response)
})

it("biases Mapbox candidates toward the submitted map centre rather than the distance-ranking device fix", async () => {
  const fetch = vi.fn(async () => Response.json(response))
  vi.stubGlobal("fetch", fetch)
  await createMapboxPlaceSearch("pk.public-test-token")(
    "Tokyo",
    new AbortController().signal,
    {
      viewportCenter: [139.7, 35.6],
      devicePosition: [121.5, 31.2],
    }
  )
  const [url] = fetch.mock.calls[0] as unknown as [URL]
  expect(url.searchParams.get("proximity")).toBe("139.7,35.6")
})

it.each([
  [429, "busy"],
  [403, "unavailable"],
  [500, "failed"],
])(
  "classifies HTTP %s without exposing vendor messages or tokens",
  async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "secret-bearing vendor diagnostics" },
          { status: Number(status) }
        )
      )
    )
    await expect(
      createMapboxPlaceSearch("pk.public-test-token")(
        "Paris",
        new AbortController().signal
      )
    ).rejects.toMatchObject({ kind, message: "Map place search failed" })
  }
)

it("rejects malformed vendor coordinates and does not accept a silently stripped response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ...response,
        features: [
          {
            ...response.features[0],
            geometry: { type: "Point", coordinates: [139, "invalid"] },
          },
        ],
      })
    )
  )
  await expect(
    createMapboxPlaceSearch("pk.public-test-token")(
      "Tokyo",
      new AbortController().signal
    )
  ).rejects.toMatchObject({ kind: "failed" })
})

it.each([401, 403, 429])(
  "retains HTTP %s classification when the gateway returns non-JSON",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream unavailable", { status }))
    )
    await expect(
      createMapboxPlaceSearch("pk.public-test-token")(
        "Tokyo",
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      kind: status === 429 ? "busy" : "unavailable",
      message: "Map place search failed",
    })
  }
)
