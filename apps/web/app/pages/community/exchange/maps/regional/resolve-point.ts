import type { AMapConfig } from "~/lib/maps/providers/amap"
import type { MapPosition } from "~/lib/maps/map-engine"
import { MapSearchError } from "~/lib/maps/map-search"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { loadAMapSdk } from "../amap/sdk"
import { convertAMapPositions } from "../amap/coordinates"
import {
  loadAMapMapBoundary,
  type GeographicMapBoundary,
} from "../amap/boundary"
import { nativeMapRegion } from "./model"

/** Search and address lookup must classify the same confirmed WGS84 point. */
export function createRegionPointResolver(
  config: Pick<AMapConfig, "apiKey" | "securityProxyUrl">
) {
  let boundary: GeographicMapBoundary | null = null
  return async (point: MapPosition, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new MapSearchError("failed")
    if (point[0] < 72 || point[0] > 138 || point[1] < 0.8 || point[1] > 56)
      return { region: "overseas" as const }
    const sdk = await awaitMapSearch(loadAMapSdk(config), signal)
    if (!boundary) boundary = await loadAMapMapBoundary(sdk, signal)
    signal.throwIfAborted()
    const [nativePosition] = await awaitMapSearch(
      convertAMapPositions(sdk, [point]),
      signal
    )
    signal.throwIfAborted()
    return nativeMapRegion(nativePosition!, boundary) === "mainland"
      ? { region: "mainland" as const, sdk, nativePosition: nativePosition! }
      : { region: "overseas" as const }
  }
}
