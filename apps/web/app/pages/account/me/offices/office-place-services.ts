import {
  getFudabaMapConfig,
  reverseFudabaPlace,
  searchFudabaPlaces,
  sendWithAbort,
  type FudabaMapConfig,
  type FudabaPlaceSearchResponse,
} from "~/lib/api"
import type { PointAddressResolver } from "~/pages/community/exchange/maps/resolve-point-address"

/** Actor-specific requests keep the same editor usable in owner and admin dialogs. */
export interface OfficePlaceServices {
  loadConfig(signal: AbortSignal): Promise<FudabaMapConfig>
  reverse: PointAddressResolver
  searchCanonical(
    query: string,
    signal: AbortSignal
  ): Promise<FudabaPlaceSearchResponse>
}
export const ownerOfficePlaceServices: OfficePlaceServices = {
  loadConfig: (signal) => sendWithAbort(getFudabaMapConfig(), signal),
  reverse: (point, signal) =>
    sendWithAbort(
      reverseFudabaPlace({ longitude: point[0], latitude: point[1] }),
      signal
    ),
  searchCanonical: (query, signal) =>
    sendWithAbort(searchFudabaPlaces(query), signal),
}
