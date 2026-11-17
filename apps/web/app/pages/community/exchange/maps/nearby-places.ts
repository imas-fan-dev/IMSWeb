import { createMapboxNearbySearch, type FudabaMapConfig } from "~/lib/api"
import {
  MapSearchError,
  type MapSearchPlace,
  type MapSearchTarget,
} from "~/lib/maps/map-search"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { createRegionPointResolver } from "./regional/resolve-point"
import { loadAMapSdk, type AMapSdk } from "./amap/sdk"
import { convertAMapPositions } from "./amap/coordinates"
import { estimateAMapSearchPositions } from "./amap/search-coordinates"
import type { MapPosition } from "~/lib/maps/map-engine"

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

async function nearbyAMap(
  sdk: AMapSdk,
  native: MapPosition,
  signal: AbortSignal,
  nativeDisplay: boolean
) {
  const raw = await new Promise<unknown>((resolve, reject) => {
    let settled = false
    const finish = (value?: unknown, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve(value)
    }
    const abort = () =>
      finish(
        undefined,
        new DOMException("Nearby lookup cancelled", "AbortError")
      )
    const timer = setTimeout(
      () => finish(undefined, new MapSearchError("unavailable")),
      8000
    )
    signal.addEventListener("abort", abort, { once: true })
    const run = () => {
      if (settled || signal.aborted) return
      if (!sdk.Geocoder)
        return finish(undefined, new MapSearchError("unavailable"))
      try {
        new sdk.Geocoder({ radius: 1000, extensions: "all" }).getAddress(
          native,
          (status, result) => {
            if (status === "no_data") finish({})
            else if (status === "complete") finish(result)
            else finish(undefined, new MapSearchError("failed"))
          }
        )
      } catch {
        finish(undefined, new MapSearchError("failed"))
      }
    }
    if (signal.aborted) abort()
    else if (sdk.Geocoder) run()
    else if (sdk.plugin) {
      try {
        sdk.plugin(["AMap.Geocoder"], run)
      } catch {
        finish(undefined, new MapSearchError("unavailable"))
      }
    } else finish(undefined, new MapSearchError("unavailable"))
  })
  signal.throwIfAborted()
  const address = record(record(raw).regeocode)
  const pois = Array.isArray(address.pois) ? address.pois : []
  const candidates: {
    id: string
    label: string
    address: string
    native: MapPosition
  }[] = []
  const seen = new Set<string>()
  for (const value of pois) {
    const poi = record(value),
      location = record(poi.location)
    const longitude: unknown =
      typeof location.getLng === "function" ? location.getLng() : location.lng
    const latitude: unknown =
      typeof location.getLat === "function" ? location.getLat() : location.lat
    if (
      !text(poi.id) ||
      !text(poi.name) ||
      seen.has(text(poi.id)) ||
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    )
      continue
    seen.add(text(poi.id))
    candidates.push({
      id: text(poi.id),
      label: text(poi.name),
      address: text(poi.address) || text(address.formattedAddress),
      native: [longitude, latitude],
    })
    if (candidates.length === 5) break
  }
  if (!candidates.length) return { items: [], attribution: "© 高德地图" }
  const positions = nativeDisplay
    ? candidates.map((poi) => poi.native)
    : await estimateAMapSearchPositions(
        sdk,
        candidates.map((poi) => poi.native),
        signal
      )
  return {
    attribution: "© 高德地图",
    items: candidates.map<MapSearchPlace>((poi, index) => ({
      id: poi.id,
      label: poi.label,
      address: poi.address,
      previewOnly: true,
      target: nativeDisplay
        ? { kind: "native", provider: "amap", position: positions[index]! }
        : { kind: "wgs84", position: positions[index]! },
      source: {
        provider: "amap",
        coordinateSystem: "gcj02",
        position: [...poi.native],
        calibration: "amap-forward-estimate",
      },
    })),
  }
}

/** Classify the chosen point with the same resolver as search and reverse geocoding. */
export function createNearbyPlaceSearcher(config: FudabaMapConfig) {
  const search = config.search
  const region =
    search.provider === "federated"
      ? createRegionPointResolver(search.mainland)
      : null
  return async (target: MapSearchTarget, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (
      !target.position.every(Number.isFinite) ||
      Math.abs(target.position[0]) > 180 ||
      Math.abs(target.position[1]) > 90
    )
      throw new MapSearchError("failed")
    if (search.provider === "federated" && region && target.kind === "wgs84") {
      const resolved = await region(target.position, signal)
      return resolved.region === "mainland"
        ? nearbyAMap(resolved.sdk, resolved.nativePosition, signal, false)
        : createMapboxNearbySearch(search.overseas.accessToken)(
            target.position,
            signal
          )
    }
    if (search.provider === "mapbox" && target.kind === "wgs84")
      return createMapboxNearbySearch(search.accessToken)(
        target.position,
        signal
      )
    if (search.provider === "amap") {
      const sdk = await awaitMapSearch(loadAMapSdk(search), signal)
      const native =
        target.kind === "native"
          ? target.position
          : (
              await awaitMapSearch(
                convertAMapPositions(sdk, [target.position]),
                signal
              )
            )[0]!
      return nearbyAMap(sdk, native, signal, config.provider === "amap")
    }
    return { items: [], attribution: "" }
  }
}
