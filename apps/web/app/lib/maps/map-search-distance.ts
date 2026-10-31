import type { MapPosition } from "./map-engine"
import { MapSearchError, type MapSearchPlace } from "./map-search"

export function formatDistance(distance: number) {
  return distance < 1000
    ? `${Math.round(distance)} 米`
    : `${(distance / 1000).toFixed(distance < 10_000 ? 1 : 0)} 公里`
}

/** Great-circle distance, not a route or travel-time estimate. */
export function mapDistanceMeters(from: MapPosition, to: MapPosition) {
  const rad = Math.PI / 180
  const dlat = (to[1] - from[1]) * rad
  const dlng = (to[0] - from[0]) * rad
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(from[1] * rad) * Math.cos(to[1] * rad) * Math.sin(dlng / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
}

export function sortMapPlacesByDistance(
  items: MapSearchPlace[],
  origin: MapPosition
) {
  return items
    .map((place, index) => {
      if (place.target.kind !== "wgs84") throw new MapSearchError("failed")
      return {
        place: {
          ...place,
          distanceMeters: mapDistanceMeters(origin, place.target.position),
        },
        index,
      }
    })
    .sort(
      (a, b) =>
        a.place.distanceMeters - b.place.distanceMeters || a.index - b.index
    )
    .map(({ place }) => place)
}
