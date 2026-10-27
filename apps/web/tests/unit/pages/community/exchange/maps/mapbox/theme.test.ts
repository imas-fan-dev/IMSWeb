import type { StyleSpecification } from "mapbox-gl"
import { expect, it, vi } from "vitest"
import { applyMapboxPortalTheme } from "~/pages/community/exchange/maps/mapbox/theme"
import { exchangeMapColors } from "~/lib/maps/map-theme"

it("themes the stock basemap without altering business overlays, native icons or road filters", () => {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      { id: "land", type: "background" },
      {
        id: "hillshade",
        type: "fill",
        source: "composite",
        "source-layer": "hillshade",
        filter: ["==", ["get", "class"], "shadow"],
      },
      {
        id: "landcover",
        type: "fill",
        source: "composite",
        "source-layer": "landcover",
        minzoom: 0,
        maxzoom: 12,
        filter: ["!=", ["get", "class"], "grass"],
      },
      {
        id: "water",
        type: "fill",
        source: "composite",
        "source-layer": "water",
        paint: { "fill-opacity": 0.7 },
      },
      {
        id: "road-primary",
        type: "line",
        source: "composite",
        "source-layer": "road",
        filter: ["==", "class", "primary"],
      },
      {
        id: "road-label",
        type: "symbol",
        source: "composite",
        "source-layer": "road",
        layout: { "text-field": "{name}" },
      },
      {
        id: "road-number-shield",
        type: "symbol",
        source: "composite",
        "source-layer": "road",
        layout: { "text-field": "{ref}", "icon-image": "shield" },
      },
      {
        id: "road-oneway-arrow-blue",
        type: "symbol",
        source: "composite",
        "source-layer": "road",
        layout: { "icon-image": "oneway" },
      },
      {
        id: "office-overlay",
        type: "circle",
        source: "offices",
        paint: { "circle-color": "#f34e6c" },
      },
    ],
  }
  const original = structuredClone(style)
  const map = {
    getStyle: () => style,
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    setLayerZoomRange: vi.fn(),
  }
  applyMapboxPortalTheme(map, "mapbox://styles/mapbox/streets-v12")
  expect(map.setPaintProperty).toHaveBeenCalledWith(
    "water",
    "fill-color",
    exchangeMapColors.water
  )
  expect(map.setPaintProperty).not.toHaveBeenCalledWith(
    "water",
    "fill-opacity",
    expect.anything()
  )
  // The stock Streets terrain is a vector fill. Using raster hillshade paint
  // here would leave the visible shadows intact and fail SDK validation.
  expect(map.setPaintProperty).toHaveBeenCalledWith(
    "hillshade",
    "fill-opacity",
    0
  )
  for (const id of [
    "office-overlay",
    "road-number-shield",
    "road-oneway-arrow-blue",
  ])
    expect(
      map.setPaintProperty.mock.calls.some(([layerId]) => layerId === id)
    ).toBe(false)
  expect(style).toEqual(original)
  // Only the generalized vegetation backdrop outlives the stock cutoff;
  // detailed landuse, road filters and business data keep their ownership.
  expect(map.setFilter.mock.calls).toEqual([["landcover", null]])
  expect(map.setLayerZoomRange.mock.calls).toEqual([["landcover", 0, 24]])
})

it.each([
  "mapbox://styles/ims/portal-custom-theme",
  "mapbox://styles/mapbox/standard",
  "mapbox://styles/mapbox/satellite-streets-v12",
])("retains published colors for %s", (styleUrl) => {
  const map = {
    getStyle: vi.fn(),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    setLayerZoomRange: vi.fn(),
  }
  applyMapboxPortalTheme(map, styleUrl)
  expect(map.getStyle).not.toHaveBeenCalled()
  expect(map.setPaintProperty).not.toHaveBeenCalled()
  expect(map.setFilter).not.toHaveBeenCalled()
  expect(map.setLayerZoomRange).not.toHaveBeenCalled()
})
