import type { MapPosition } from "~/lib/maps/map-engine"
import { MapSearchError } from "~/lib/maps/map-search"
import { awaitMapSearch } from "~/lib/maps/map-search-abort"
import { convertAMapPositions } from "./coordinates"
import type { AMapSdk } from "./sdk"

const MAX_ITERATIONS = 5
const MAX_RESIDUAL_METERS = 1

function valid([lng, lat]: MapPosition) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
  )
}

/** Temporary numerical estimate. This is not an official inverse API. */
export async function estimateAMapSearchPositions(
  sdk: Pick<AMapSdk, "convertFrom">,
  positions: MapPosition[],
  signal: AbortSignal
): Promise<MapPosition[]> {
  signal.throwIfAborted()
  if (positions.some((point) => !valid(point)))
    throw new MapSearchError("failed")
  let candidates = positions.map(([lng, lat]): MapPosition => [lng, lat])
  for (let iteration = 0; iteration <= MAX_ITERATIONS; iteration++) {
    signal.throwIfAborted()
    const forward = await awaitMapSearch(
      convertAMapPositions(sdk, candidates),
      signal
    )
    signal.throwIfAborted()
    const residuals = positions.map(
      ([lng, lat], index): MapPosition => [
        lng - forward[index]![0],
        lat - forward[index]![1],
      ]
    )
    const withinError = residuals.every(([lng, lat], index) => {
      const latitude = (positions[index]![1] * Math.PI) / 180
      return (
        Math.hypot(lng * Math.cos(latitude), lat) * 111320 <=
        MAX_RESIDUAL_METERS
      )
    })
    if (withinError) return candidates
    candidates = candidates.map(
      ([lng, lat], index): MapPosition => [
        lng + residuals[index]![0],
        lat + residuals[index]![1],
      ]
    )
    if (candidates.some((point) => !valid(point))) break
  }
  throw new MapSearchError("failed")
}
