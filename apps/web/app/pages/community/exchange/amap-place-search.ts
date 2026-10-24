import type { FudabaMapSearchConfig } from "@imsweb/contracts/fudaba/map-delivery"
import {
  MapSearchError,
  type MapPlaceSearcher,
  type MapSearchPlace,
} from "~/lib/maps/map-search"
import { assertMapActive } from "~/lib/maps/map-lifecycle"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { loadAMapSdk } from "./amap-sdk"
import { estimateAMapSearchPositions } from "./amap-search-coordinates"
import { convertAMapPositions } from "./amap-coordinates"

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The official JS service reuses our JS key and server-owned security proxy. */
export function createAMapPlaceSearch(
  config: Extract<FudabaMapSearchConfig, { provider: "amap" }>,
  coordinates: "native" | "wgs84" = "native",
  options: { vicinityFirst?: boolean } = {}
): MapPlaceSearcher {
  return async (query, signal, context) => {
    assertMapActive(signal)
    const sdk = await awaitMapSearch(loadAMapSdk(config), signal)
    assertMapActive(signal)
    const center = options.vicinityFirst
      ? (context?.viewportCenter ?? context?.devicePosition)
      : undefined
    const nativeCenter = center
      ? (await awaitMapSearch(convertAMapPositions(sdk, [center]), signal))[0]
      : undefined
    assertMapActive(signal)
    const response = await new Promise<Awaited<ReturnType<MapPlaceSearcher>>>(
      (resolve, reject) => {
        let settled = false
        let expanded = false
        const finish = (items?: MapSearchPlace[], error?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          signal.removeEventListener("abort", abort)
          if (error) reject(error)
          else
            resolve({
              items: items ?? [],
              attribution: "© 高德地图",
              ...(expanded
                ? {
                    notice:
                      "地图中心附近 3 公里内没有匹配结果，已扩大到全国关键词搜索。",
                  }
                : {}),
            })
        }
        const abort = () =>
          finish(undefined, new DOMException("Search cancelled", "AbortError"))
        const timer = setTimeout(
          () => finish(undefined, new MapSearchError("failed")),
          8000
        )
        signal.addEventListener("abort", abort, { once: true })
        const search = () => {
          if (settled) return
          if (!sdk.PlaceSearch)
            return finish(undefined, new MapSearchError("unavailable"))
          try {
            const service = new sdk.PlaceSearch({
              pageSize: 5,
              pageIndex: 1,
              city: "全国",
              citylimit: false,
              extensions: "base",
            })
            let useNearby = Boolean(nativeCenter && service.searchNearBy)
            const handle = (status: string, result: unknown) => {
              if (settled) return
              const empty =
                status === "no_data" ||
                (status === "complete" &&
                  record(result) &&
                  record(result.poiList) &&
                  Array.isArray(result.poiList.pois) &&
                  result.poiList.pois.length === 0)
              if (useNearby && empty) {
                useNearby = false
                expanded = true
                try {
                  service.search(query, handle)
                } catch {
                  finish(undefined, new MapSearchError("failed"))
                }
                return
              }
              if (status === "no_data") return finish([])
              if (
                status !== "complete" ||
                !record(result) ||
                !record(result.poiList) ||
                !Array.isArray(result.poiList.pois)
              )
                return finish(undefined, new MapSearchError("failed"))
              try {
                const items: MapSearchPlace[] = []
                const seen = new Set<string>()
                for (const poi of result.poiList.pois) {
                  if (
                    !record(poi) ||
                    typeof poi.id !== "string" ||
                    !poi.id ||
                    typeof poi.name !== "string" ||
                    !poi.name ||
                    !record(poi.location)
                  )
                    continue
                  const location = poi.location
                  if (
                    typeof location.getLng !== "function" ||
                    typeof location.getLat !== "function"
                  )
                    continue
                  const longitude: unknown = location.getLng(),
                    latitude: unknown = location.getLat()
                  if (
                    typeof longitude !== "number" ||
                    typeof latitude !== "number" ||
                    !Number.isFinite(longitude) ||
                    !Number.isFinite(latitude) ||
                    Math.abs(longitude) > 180 ||
                    Math.abs(latitude) > 90 ||
                    seen.has(poi.id)
                  )
                    continue
                  seen.add(poi.id)
                  const address = [
                    poi.pname,
                    poi.cityname,
                    poi.adname,
                    poi.address,
                  ].filter(
                    (value): value is string =>
                      typeof value === "string" && Boolean(value.trim())
                  )
                  items.push({
                    id: poi.id,
                    label: poi.name,
                    address: [...new Set(address)].join(" ") || poi.name,
                    target: {
                      kind: "native",
                      provider: "amap",
                      position: [longitude, latitude],
                    },
                  })
                  if (items.length === 5) break
                }
                finish(items)
              } catch {
                finish(undefined, new MapSearchError("failed"))
              }
            }
            if (useNearby && nativeCenter && service.searchNearBy)
              service.searchNearBy(query, nativeCenter, 3000, handle)
            else service.search(query, handle)
          } catch {
            finish(undefined, new MapSearchError("failed"))
          }
        }
        try {
          if (sdk.PlaceSearch) search()
          else if (sdk.plugin) sdk.plugin(["AMap.PlaceSearch"], search)
          else finish(undefined, new MapSearchError("unavailable"))
        } catch {
          finish(undefined, new MapSearchError("failed"))
        }
      }
    )
    assertMapActive(signal)
    if (coordinates === "native" || !response.items.length) return response
    try {
      const positions = await estimateAMapSearchPositions(
        sdk,
        response.items.map((place) => place.target.position),
        signal
      )
      assertMapActive(signal)
      return {
        ...response,
        items: response.items.map((place, index) => ({
          ...place,
          target: { kind: "wgs84" as const, position: positions[index]! },
        })),
      }
    } catch {
      assertMapActive(signal)
      throw new MapSearchError("failed")
    }
  }
}
