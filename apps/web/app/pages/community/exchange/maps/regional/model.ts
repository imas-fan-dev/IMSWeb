import type { MapPosition } from "~/lib/maps/map-engine"
import type { MapSearchTarget } from "~/lib/maps/map-search"
import type { GeographicMapBoundary } from "~/pages/community/exchange/maps/amap/boundary"

export type MapRegion = "mainland" | "overseas"
export interface RegionalCamera {
  target: MapSearchTarget
  /** Shared camera scale; AMap's native zoom is one greater than Mapbox's. */
  zoom: number
}

export function ringContains(
  ring: readonly MapPosition[],
  [x, y]: MapPosition
) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** All operands are AMap-native. These view-local boundaries are not business data. */
export function nativeMapRegion(
  point: MapPosition,
  boundary: GeographicMapBoundary
): MapRegion {
  return boundary.country.some((ring) => ringContains(ring, point)) &&
    !boundary.overseas.some((ring) => ringContains(ring, point))
    ? "mainland"
    : "overseas"
}

/** Keep the current engine near coasts/borders to avoid oscillation. */
export function stableNativeMapRegion(
  point: MapPosition,
  boundary: GeographicMapBoundary,
  current: MapRegion
): MapRegion {
  const next = nativeMapRegion(point, boundary)
  if (next === current) return current
  const margin = 0.03
  const probes: MapPosition[] = [
    [point[0] - margin, point[1]],
    [point[0] + margin, point[1]],
    [point[0], point[1] - margin],
    [point[0], point[1] + margin],
  ]
  return probes.every((probe) => nativeMapRegion(probe, boundary) === next)
    ? next
    : current
}
