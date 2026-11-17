import {
  reverseFudabaPlace,
  sendWithAbort,
  type FudabaMapConfig,
  type FudabaPlaceReverseResponse,
} from "~/lib/api"
import type { MapPosition } from "~/lib/maps/map-engine"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { MapSearchError } from "~/lib/maps/map-search"
import { loadAMapSdk } from "./amap/sdk"
import { convertAMapPositions } from "./amap/coordinates"
import { reverseAMapPosition } from "./amap/reverse-geocode"
import { createRegionPointResolver } from "./regional/resolve-point"

export type PointAddressResolver = (
  point: MapPosition,
  signal: AbortSignal
) => Promise<FudabaPlaceReverseResponse>

/** Resolve using the provider responsible for this point, not an unrelated base-map region. */
export function createPointAddressResolver(
  config: FudabaMapConfig,
  fallback: PointAddressResolver = (point, signal) =>
    sendWithAbort(
      reverseFudabaPlace({ longitude: point[0], latitude: point[1] }),
      signal
    )
): PointAddressResolver {
  const region =
    config.provider === "regional"
      ? createRegionPointResolver(config.mainland)
      : null
  return async (position, signal) => {
    const point: MapPosition = [...position]
    signal.throwIfAborted()
    if (
      !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new MapSearchError("failed")
    if (region) {
      const resolved = await region(point, signal)
      if (resolved.region === "mainland")
        return reverseAMapPosition(
          resolved.sdk,
          resolved.nativePosition,
          point,
          signal
        )
    } else if (config.provider === "amap") {
      const sdk = await awaitMapSearch(loadAMapSdk(config), signal)
      signal.throwIfAborted()
      const [native] = await awaitMapSearch(
        convertAMapPositions(sdk, [point]),
        signal
      )
      signal.throwIfAborted()
      return reverseAMapPosition(sdk, native!, point, signal)
    }
    return fallback(point, signal)
  }
}
