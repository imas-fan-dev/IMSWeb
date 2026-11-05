import { expect, it, vi } from "vitest"
import { mapboxNearbyResponseSchema } from "@imsweb/contracts/fudaba/map-delivery"
import { createMapboxNearbySearch } from "~/lib/api/endpoints/fudaba/mapbox-place-search"

it("validates vendor metadata without stripping it, and only returns transient POI previews", async () => {
  const raw = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [139.7, 35.6],
          vendor: "preserved",
        },
        properties: {
          mapbox_id: "poi:1",
          name: "近くの店",
          full_address: "東京",
          feature_type: "poi",
        },
        vendor: 1,
      },
    ],
    attribution: "Mapbox",
    response_id: "response-1",
  }
  expect(mapboxNearbyResponseSchema.parse(raw)).toEqual(raw)
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => raw })
  vi.stubGlobal("fetch", fetch)
  const search = createMapboxNearbySearch("pk.test")
  const response = await search([139.8, 35.7], new AbortController().signal)
  expect(response.items[0]).toMatchObject({
    label: "近くの店",
    target: { kind: "wgs84", position: [139.7, 35.6] },
    previewOnly: true,
  })
  const [url, options] = fetch.mock.calls[0]!
  expect(url.pathname).toBe("/search/searchbox/v1/reverse")
  expect(url.searchParams.get("longitude")).toBe("139.8")
  expect(url.searchParams.get("types")).toBe("poi")
  expect(options).toMatchObject({
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  })
  await search([139.8, 35.7], new AbortController().signal)
  expect(fetch).toHaveBeenCalledTimes(2)
})
it("rejects unusable vendor geometry instead of writing a guessed point", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { mapbox_id: "bad", name: "bad" },
            geometry: { type: "Point", coordinates: [200, 30] },
          },
        ],
      }),
    })
  )
  await expect(
    createMapboxNearbySearch("pk.test")([139, 35], new AbortController().signal)
  ).rejects.toThrow()
})
