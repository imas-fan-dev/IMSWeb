import type { MapPosition } from "./map-engine"

/** UI-only targets. Native coordinates never enter the canonical office API. */
export type MapSearchTarget =
  | { kind: "wgs84"; position: MapPosition }
  | { kind: "native"; provider: string; position: MapPosition }

export interface MapSearchPlace {
  id: string
  label: string
  address: string
  attribution?: string
  target: MapSearchTarget
  distanceMeters?: number
  distanceLabel?: string
  /** Regional office targets should keep their deliberately coarse map scale. */
  zoom?: number
}
export interface MapSearchContext {
  viewportCenter?: MapPosition
  devicePosition?: MapPosition
}
export type MapPlaceSearcher = (
  query: string,
  signal: AbortSignal,
  context?: MapSearchContext
) => Promise<{ items: MapSearchPlace[]; attribution: string; notice?: string }>

export class MapSearchError extends Error {
  constructor(readonly kind: "busy" | "unavailable" | "failed") {
    super("Map place search failed")
  }
}

export function mapSearchPosition(
  target: MapSearchTarget,
  nativeProvider?: string
): MapPosition {
  if (target.kind === "wgs84" || target.provider === nativeProvider)
    return [...target.position]
  throw new MapSearchError("unavailable")
}
