import type { LayerSpecification, Map, PaintSpecification } from "mapbox-gl"
import { exchangeMapColors as palette } from "~/lib/maps/map-theme"

type Paint = Partial<PaintSpecification>

function layerPaint(layer: LayerSpecification): Paint | null {
  const sourceLayer = "source-layer" in layer ? layer["source-layer"] : null
  if (layer.type === "background")
    return { "background-color": palette.background }
  if (layer.type === "hillshade") return { "hillshade-exaggeration": 0 }
  if (layer.type === "fill") {
    switch (sourceLayer) {
      // Streets draws terrain shadows as vector fills, not a hillshade layer.
      case "hillshade":
        return { "fill-opacity": 0 }
      case "water":
      case "depth":
        return { "fill-color": palette.water }
      case "waterway":
        return { "fill-color": palette.waterway }
      case "building":
        return {
          "fill-color": palette.building,
          "fill-outline-color": palette.buildingOutline,
        }
      case "landcover":
        return {
          "fill-color": [
            "match",
            ["get", "class"],
            ["wood", "scrub"],
            palette.wood,
            ["snow", "ice"],
            palette.glacier,
            ["grass", "crop"],
            palette.grass,
            "sand",
            palette.sand,
            palette.background,
          ],
          // Match AMap's flat regional view, while retaining a faint backdrop
          // where detailed landuse has no forest polygons at street zooms.
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            0.05,
            5,
            0.07,
            9,
            0.12,
            12,
            0.2,
            16,
            0.26,
          ],
        }
      case "landuse_overlay":
        return {
          "fill-color": palette.park,
          // Large reserve boundaries should not tint an entire regional map.
          // Detailed park polygons in landuse retain their native opacity.
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            0.08,
            9,
            0.16,
            12,
            0.4,
            15,
            0.7,
          ],
        }
      case "landuse":
        return {
          "fill-color": [
            "match",
            ["get", "class"],
            ["park", "pitch", "grass"],
            palette.park,
            ["wood", "scrub"],
            palette.wood,
            "agriculture",
            palette.grass,
            "glacier",
            palette.glacier,
            "sand",
            palette.sand,
            "cemetery",
            palette.cemetery,
            "hospital",
            palette.hospital,
            "school",
            palette.school,
            "industrial",
            palette.industrial,
            ["commercial", "commercial_area"],
            palette.commercial,
            palette.residential,
          ],
        }
      case "aeroway":
      case "structure":
        return { "fill-color": palette.railwayLand }
      case "road":
        return { "fill-color": palette.minorRoad }
    }
  }
  if (layer.type === "line") {
    if (sourceLayer === "landuse")
      return { "line-color": palette.wood, "line-opacity": 0.8 }
    if (sourceLayer === "waterway" || layer.id.startsWith("ferry"))
      return { "line-color": palette.waterway, "line-opacity": 0.84 }
    if (sourceLayer === "admin")
      return {
        "line-color": layer.id.includes("admin-0")
          ? palette.boundary
          : palette.regionalBoundary,
        "line-opacity": layer.id.endsWith("-bg") ? 0 : 0.85,
      }
    if (sourceLayer === "road") {
      if (layer.id.includes("-rail"))
        return { "line-color": palette.railway, "line-opacity": 0.5 }
      if (layer.id.endsWith("-case") || layer.id.endsWith("-bg"))
        return {
          "line-color": palette.roadCasing,
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6,
            0.14,
            12,
            0.24,
            16,
            0.4,
          ],
        }
      if (layer.id.includes("motorway") || layer.id.includes("major-link"))
        return { "line-color": palette.motorway, "line-opacity": 0.96 }
      if (layer.id.includes("primary"))
        return { "line-color": palette.arterialRoad, "line-opacity": 0.96 }
      if (layer.id.includes("secondary-tertiary"))
        return { "line-color": palette.collectorRoad, "line-opacity": 0.94 }
      return { "line-color": palette.minorRoad, "line-opacity": 0.88 }
    }
  }
  if (layer.type === "symbol" && layer.layout?.["text-field"]) {
    // Preserve the native shield artwork and its contrasting text.
    if (layer.id.endsWith("-shield")) return null
    if (layer.id.startsWith("water") || layer.id.startsWith("waterway"))
      return {
        "text-color": palette.waterLabel,
        "text-halo-color": palette.waterLabelHalo,
        "text-halo-width": 1,
        "text-opacity": 0.95,
      }
    const major =
      layer.id === "country-label" || layer.id === "settlement-major-label"
    const place = sourceLayer === "place_label"
    return {
      "text-color": major || place ? palette.cityLabel : palette.label,
      "text-halo-color": palette.labelHalo,
      "text-halo-width": major ? 1 : 0.9,
      "text-opacity":
        sourceLayer === "poi_label" || sourceLayer === "transit_stop_label"
          ? 0.68
          : sourceLayer === "road"
            ? 0.78
            : major || place
              ? 1
              : 0.9,
    }
  }
  return null
}

export function applyMapboxPortalTheme(
  map: Pick<
    Map,
    "getStyle" | "setPaintProperty" | "setFilter" | "setLayerZoomRange"
  >,
  styleUrl: string
) {
  // Studio themes and import-based Standard styles keep their published colors.
  if (
    !/^mapbox:\/\/styles\/mapbox\/(?:streets-v12|light-v11|outdoors-v12)$/.test(
      styleUrl
    )
  )
    return
  for (const layer of map.getStyle().layers ?? []) {
    const paint = layerPaint(layer)
    if (!paint) continue
    if (layer.type === "fill" && layer["source-layer"] === "landcover") {
      // Keep grass/scrub after z8 and the backdrop after z12. Detailed
      // landuse, roads and buildings remain above this generalized layer.
      map.setFilter(layer.id, null)
      map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, 24)
    }
    for (const [name, value] of Object.entries(paint)) {
      map.setPaintProperty(
        layer.id,
        name as keyof PaintSpecification,
        value as PaintSpecification[keyof PaintSpecification]
      )
    }
  }
}
