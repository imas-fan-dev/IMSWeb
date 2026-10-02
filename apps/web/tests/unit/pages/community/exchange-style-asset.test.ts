import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

interface MapStyleAsset {
  version: number
  sources: Record<
    string,
    {
      type?: string
      url?: string
      data?: string
      tiles?: string[]
      attribution?: string
      maxzoom?: number
    }
  >
  sprite?: string
  glyphs?: string
  layers: Array<{ id: string; type: string; source?: string }>
}

async function readExchangeStyle(filename = "exchange-style.json") {
  const raw = await readFile(
    resolve(process.cwd(), `public/maps/${filename}`),
    "utf8"
  )
  return JSON.parse(raw) as MapStyleAsset
}

describe("exchange world map style asset", () => {
  it("keeps the detailed OpenFreeMap layers while serving every runtime asset same-origin", async () => {
    const style = await readExchangeStyle()
    const layerIds = new Set(style.layers.map((layer) => layer.id))

    expect(style.version).toBe(8)
    expect(style.sources.openmaptiles).toMatchObject({
      type: "vector",
      url: "pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles",
      maxzoom: 11,
    })
    expect(style.sources.openmaptiles?.attribution).toContain("OpenStreetMap")
    expect(style.sources.ne2_shaded?.tiles).toEqual([
      "/maps/exchange/natural-earth/{z}/{x}/{y}.png",
    ])
    expect(style.sprite).toBe("/maps/exchange/sprites/ofm")
    expect(style.glyphs).toBe("/maps/exchange/fonts/{fontstack}/{range}.pbf")
    expect(JSON.stringify(style)).not.toContain("tiles.openfreemap.org")
    expect(style.layers.length).toBeGreaterThanOrEqual(100)
    for (const layerId of [
      "water",
      "highway-primary",
      "boundary_2",
      "label_city",
      "label_country_1",
    ]) {
      expect(layerIds).toContain(layerId)
    }
    expect(JSON.stringify(style)).not.toContain("china-provinces")
  })
})

describe("exchange test map style asset", () => {
  it("uses the bundled province geometry without PMTiles or remote runtime assets", async () => {
    const style = await readExchangeStyle("exchange-test-style.json")
    const layerIds = style.layers.map((layer) => layer.id)

    expect(style.version).toBe(8)
    expect(style.sources["china-provinces"]).toMatchObject({
      type: "geojson",
      data: "/maps/china-provinces.json",
    })
    expect(style.sources["china-provinces"]?.attribution).toContain(
      "DataV GeoAtlas"
    )
    expect(style.sprite).toBeUndefined()
    expect(style.glyphs).toBe("/maps/exchange/fonts/{fontstack}/{range}.pbf")
    expect(layerIds).toEqual([
      "background",
      "province-fill",
      "province-boundary",
    ])
    expect(JSON.stringify(style.sources)).not.toContain("pmtiles://")
  })
})
