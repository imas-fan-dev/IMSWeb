import type { FudabaMapSearchConfig } from "@imsweb/contracts/fudaba/map-delivery"
import type { MapPosition } from "~/lib/maps/map-engine"
import { MapSearchError, type MapPlaceSearcher } from "~/lib/maps/map-search"
import { formatDistance } from "~/lib/maps/map-search-distance"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { sortMapPlacesByDistance } from "~/lib/maps/map-search-distance"
import { DEFAULT_EXCHANGE_MAP_VIEWPORT } from "./exchange-map-model"
import { loadAMapSdk } from "./amap-sdk"
import { convertAMapPositions } from "./amap-coordinates"
import {
  loadAMapMapBoundary,
  type GeographicMapBoundary,
} from "./amap-map-boundary"
import { nativeMapRegion } from "./regional-map-model"

function validPosition(point: MapPosition) {
  return (
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  )
}

/** Route by submitted map centre, never by query text or visitor IP.
 * Distance ranking uses the device fix independently of the search region.
 */
export function createRegionPlaceSearch(
  config: Extract<FudabaMapSearchConfig, { provider: "federated" }>,
  mainland: MapPlaceSearcher,
  overseas: MapPlaceSearcher
): MapPlaceSearcher {
  let boundary: GeographicMapBoundary | null = null
  return async (query, signal, context) => {
    signal.throwIfAborted()
    const center: MapPosition = [
      ...(context?.viewportCenter ??
        context?.devicePosition ??
        DEFAULT_EXCHANGE_MAP_VIEWPORT.center),
    ]
    const devicePosition: MapPosition | undefined = context?.devicePosition
      ? [...context.devicePosition]
      : undefined
    if (
      !validPosition(center) ||
      (devicePosition && !validPosition(devicePosition))
    )
      throw new MapSearchError("failed")
    // Far outside the country envelope no AMap service is needed at all.
    // Inside it, official native geometry excludes neighbouring countries and HK/MO/TW.
    let region: "mainland" | "overseas" = "overseas"
    if (
      center[0] >= 72 &&
      center[0] <= 138 &&
      center[1] >= 0.8 &&
      center[1] <= 56
    ) {
      const sdk = await awaitMapSearch(loadAMapSdk(config.mainland), signal)
      if (!boundary) boundary = await loadAMapMapBoundary(sdk, signal)
      signal.throwIfAborted()
      const [native] = await awaitMapSearch(
        convertAMapPositions(sdk, [center]),
        signal
      )
      region = nativeMapRegion(native!, boundary)
    }
    const result = await (region === "mainland" ? mainland : overseas)(
      query,
      signal,
      { viewportCenter: center, devicePosition }
    )
    signal.throwIfAborted()
    const items = sortMapPlacesByDistance(
      result.items,
      devicePosition ?? center
    ).map((place) => {
      if (
        place.distanceMeters === undefined ||
        !Number.isFinite(place.distanceMeters)
      )
        throw new MapSearchError("failed")
      return {
        ...place,
        distanceLabel: `${devicePosition ? "距你" : "距地图中心"} ${formatDistance(place.distanceMeters)}`,
      }
    })
    return {
      ...result,
      items,
      notice: [
        result.notice,
        devicePosition
          ? "结果按距您当前位置的直线距离排序。排序仅限此次返回的候选，不代表最近地点或路线距离。"
          : "未取得当前位置，暂按距地图中心的直线距离排序。排序仅限此次返回的候选。",
      ]
        .filter(Boolean)
        .join(" "),
    }
  }
}
