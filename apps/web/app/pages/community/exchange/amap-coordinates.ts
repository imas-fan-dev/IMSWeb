import type { AMapSdk } from "./amap-sdk"
import type { MapPosition } from "~/lib/maps/map-engine"
import type { MapViewportBounds } from "./exchange-map-model"

type CoordinateSdk = Pick<AMapSdk, "convertFrom">
const caches = new WeakMap<CoordinateSdk, Map<string, Promise<MapPosition>>>()

/** Official JS API conversion, in batches of at most 40 coordinate pairs. */
export async function convertAMapPositions(
  sdk: CoordinateSdk,
  positions: MapPosition[]
): Promise<MapPosition[]> {
  let cache = caches.get(sdk)
  if (!cache) {
    cache = new Map()
    caches.set(sdk, cache)
  }
  const retained = new Map(
    positions.map((point) => [point.join(","), cache.get(point.join(","))])
  )
  const missing = [
    ...new Map(
      positions
        .filter((point) => !retained.get(point.join(",")))
        .map((point) => [point.join(","), point])
    ).values(),
  ]
  for (let index = 0; index < missing.length; index += 40) {
    const batch = missing.slice(index, index + 40)
    const converted = new Promise<MapPosition[]>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("高德坐标转换超时，请重试")),
        10000
      )
      try {
        // The SDK replaces input entries with LngLat objects in place.
        const input = batch.map(([lng, lat]): MapPosition => [lng, lat])
        sdk.convertFrom(input, "gps", (status, result) => {
          clearTimeout(timer)
          if (
            status !== "complete" ||
            result.info !== "ok" ||
            result.locations?.length !== batch.length
          ) {
            reject(new Error("高德坐标转换失败，请检查安全代理"))
            return
          }
          const points: MapPosition[] = result.locations.map((point) => [
            point.getLng(),
            point.getLat(),
          ])
          if (
            points.some((point) =>
              point.some((value) => !Number.isFinite(value))
            )
          )
            reject(new Error("高德坐标转换结果无效"))
          else resolve(points)
        })
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
    batch.forEach((point, offset) => {
      const key = point.join(",")
      const result = converted
        .then((points) => points[offset]!)
        .catch((error: unknown) => {
          if (cache.get(key) === result) cache.delete(key)
          throw error
        })
      retained.set(key, result)
      cache.set(key, result)
      if (cache.size > 2000) cache.delete(cache.keys().next().value!)
    })
  }
  return Promise.all(positions.map((point) => retained.get(point.join(","))!))
}

/** Conservative WGS84 query envelope includes nonlinear and border offsets. */
export function amapQueryBounds(bounds: MapViewportBounds): MapViewportBounds {
  const intersects =
    bounds.west > bounds.east ||
    !(
      bounds.east < 72 ||
      bounds.west > 138 ||
      bounds.north < 0.8 ||
      bounds.south > 56
    )
  if (!intersects) return bounds
  return {
    west: bounds.west - 0.02,
    east: bounds.east + 0.02,
    south: bounds.south - 0.02,
    north: bounds.north + 0.02,
  }
}
