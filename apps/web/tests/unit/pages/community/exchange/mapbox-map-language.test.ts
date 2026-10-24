import { createRequire } from "node:module"
import type { StyleSpecification, SymbolLayerSpecification } from "mapbox-gl"
import type * as StyleSpec from "mapbox-gl/dist/style-spec/index.d.ts"
import { expect, it, vi } from "vitest"
import { applyMapboxLocalLabels } from "~/pages/community/exchange/mapbox-map-language"

// Use the installed SDK's real parser/evaluator, rather than duplicating it.
const { expression }: typeof StyleSpec = createRequire(import.meta.url)(
  "mapbox-gl/dist/style-spec/index.cjs"
)
type TextField = NonNullable<SymbolLayerSpecification["layout"]>["text-field"]

function harness(field: TextField, sourceLayer = "place_label") {
  const layer: SymbolLayerSpecification = {
    id: "label",
    type: "symbol",
    source: "streets",
    "source-layer": sourceLayer,
    layout: { "text-field": field, "icon-image": "station" },
    filter: ["==", ["get", "class"], "city"],
  }
  const style: StyleSpecification = {
    version: 8,
    sources: {
      streets: {
        type: "vector",
        url: "mapbox://mapbox.mapbox-terrain-v2,mapbox.mapbox-streets-v8",
      },
    },
    layers: [layer],
  }
  const map = {
    getStyle: () => style,
    setLayoutProperty: vi.fn(),
    updateImport: vi.fn(),
  }
  applyMapboxLocalLabels(map)
  const output = map.setLayoutProperty.mock.calls[0]?.[2] ?? field
  return { style, layer, map, output }
}

function render(
  field: unknown,
  properties: Record<string, unknown>,
  zoom = 14
) {
  const parsed = expression.createExpression(field)
  if (parsed.result === "error") throw new Error(JSON.stringify(parsed.value))
  return String(
    parsed.value.evaluateWithoutErrorHandling({ zoom }, { type: 1, properties })
  )
}

it.each([
  ["東京", "Tokyo"],
  ["서울", "Seoul"],
  ["กรุงเทพมหานคร", "Bangkok"],
  ["دبي", "Dubai"],
  ["ירושלים", "Jerusalem"],
  ["München", "Munich"],
  ["北京", "Beijing"],
  ["Bruxelles / Brussel", "Brussels"],
])("prefers the local name %s over translations", (name, english) => {
  const { output } = harness(["coalesce", ["get", "name_en"], ["get", "name"]])
  expect(render(output, { name, name_en: english })).toBe(name)
})

it.each([
  [{ name: null, name_en: "Tokyo" }, "Tokyo"],
  [{ name: "", name_en: "Tokyo" }, "Tokyo"],
  [{ name: "", name_en: "", name_ja: "東京" }, "東京"],
  [{}, ""],
])("falls back from unavailable or empty names: %j", (properties, expected) => {
  const { output } = harness([
    "coalesce",
    ["get", "name_en"],
    ["get", "name_ja"],
    ["get", "name"],
  ])
  expect(render(output, properties)).toBe(expected)
})

it("preserves transit zoom conditions, modes, airport references and terminal reference-only labels", () => {
  const names = ["coalesce", ["get", "name_en"], ["get", "name"]] as const
  const transit = harness(
    [
      "step",
      ["zoom"],
      "",
      13,
      ["match", ["get", "mode"], ["rail", "metro_rail"], [...names], ""],
      18,
      [...names],
    ],
    "transit_stop_label"
  ).output
  expect(
    render(transit, { name: "東京駅", name_en: "Tokyo", mode: "rail" }, 12)
  ).toBe("")
  expect(
    render(transit, { name: "東京駅", name_en: "Tokyo", mode: "rail" }, 13)
  ).toBe("東京駅")
  expect(render(transit, { name: "東京駅", mode: "bus" }, 13)).toBe("")
  const airport = harness(
    [
      "step",
      ["get", "sizerank"],
      ["concat", ["get", "ref"], " -\n", [...names]],
      15,
      ["get", "ref"],
    ],
    "airport_label"
  ).output
  expect(
    render(airport, { sizerank: 10, ref: "HND", name: "東京国際空港" })
  ).toBe("HND -\n東京国際空港")
  expect(
    render(airport, { sizerank: 16, ref: "HND", name: "東京国際空港" })
  ).toBe("HND")
})

it("keeps token-string references and rich-text formatting without duplicate bilingual names", () => {
  const token = harness("{ref} · {name_en}", "road").output
  expect(render(token, { ref: "A1", name: "München", name_en: "Munich" })).toBe(
    "A1 · München"
  )
  const rich = harness([
    "format",
    ["get", "name_en"],
    { "font-scale": 1.2 },
    "\n",
    {},
    ["get", "name"],
    { "font-scale": 0.8 },
  ]).output
  expect(render(rich, { name: "東京", name_en: "Tokyo" })).toBe("東京")
  expect(rich).toMatchObject([
    "format",
    expect.any(Array),
    { "font-scale": 1.2 },
  ])
  const fallback = harness([
    "format",
    ["get", "name_en"],
    {},
    "\n",
    {},
    ["get", "name_ja"],
    {},
  ]).output
  expect(render(fallback, { name: "", name_en: "", name_ja: "東京" })).toBe(
    "東京"
  )
})

it("converges on repeated style loads while leaving filters, fonts and artwork intact", () => {
  const { style, layer, map, output } = harness(["get", "name_en"])
  const original = structuredClone(style)
  layer.layout = { ...layer.layout, "text-field": output }
  map.setLayoutProperty.mockClear()
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).not.toHaveBeenCalled()
  expect(layer.filter).toEqual(original.layers[0].filter)
  expect(layer.layout["icon-image"]).toBe("station")
})

it("leaves house numbers, shields, literal strings, unknown sources and business overlays unchanged", () => {
  for (const field of [
    "{ref}",
    "{housenum}",
    ["get", "name_script"],
    ["literal", "name_en"],
  ] as TextField[]) {
    expect(harness(field, "road").map.setLayoutProperty).not.toHaveBeenCalled()
  }
  expect(
    harness(["get", "name_en"], "housenum_label").map.setLayoutProperty
  ).not.toHaveBeenCalled()
  const { map, style } = harness(["get", "name_en"])
  map.setLayoutProperty.mockClear()
  style.sources.streets = {
    type: "vector",
    url: "https://example.com/streets.json",
  }
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).not.toHaveBeenCalled()
  style.sources.streets = {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  }
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).not.toHaveBeenCalled()
})

it("uses actual source identities in custom styles and tolerates import-only Standard styles", () => {
  const { map, style } = harness(["get", "name_zh-Hans"])
  map.setLayoutProperty.mockClear()
  style.sources.streets = {
    type: "vector",
    url: "mapbox://mapbox.mapbox-streets-v8-lite",
  }
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).toHaveBeenCalledTimes(1)
  map.setLayoutProperty.mockClear()
  style.layers = []
  style.sources = {}
  style.imports = [{ id: "basemap", url: "mapbox://styles/mapbox/standard" }]
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).not.toHaveBeenCalled()
})

it("updates serialized Standard and nested imports through the public API without reloading unchanged data", () => {
  const { map, style } = harness(["get", "name_en"])
  const basemap = structuredClone(style)
  const nested = structuredClone(style)
  basemap.imports = [{ id: "nested", url: "", data: nested }]
  style.layers = []
  style.sources = {}
  style.imports = [
    {
      id: "basemap",
      url: "",
      data: basemap,
      config: { show3dObjects: false },
    },
  ]
  map.setLayoutProperty.mockClear()
  applyMapboxLocalLabels(map)
  expect(map.setLayoutProperty).not.toHaveBeenCalled()
  expect(map.updateImport).toHaveBeenCalledTimes(1)
  const [id, updated] = map.updateImport.mock.calls[0]
  expect(id).toBe("basemap")
  expect(updated.config).toEqual({ show3dObjects: false })
  expect(
    render(updated.data.layers[0].layout["text-field"], {
      name: "東京",
      name_en: "Tokyo",
    })
  ).toBe("東京")
  expect(
    render(updated.data.imports[0].data.layers[0].layout["text-field"], {
      name: "서울",
      name_en: "Seoul",
    })
  ).toBe("서울")
  expect(basemap).toEqual(
    expect.objectContaining({
      layers: [
        expect.objectContaining({
          layout: expect.objectContaining({ "text-field": ["get", "name_en"] }),
        }),
      ],
    })
  )
  style.imports = [updated]
  map.updateImport.mockClear()
  applyMapboxLocalLabels(map)
  expect(map.updateImport).not.toHaveBeenCalled()
})
