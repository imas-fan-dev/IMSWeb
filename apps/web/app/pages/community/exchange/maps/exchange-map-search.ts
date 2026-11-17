import type { FudabaMapSearchConfig } from "@imsweb/contracts/fudaba/map-delivery"
import {
  searchFudabaPlaces,
  sendWithAbort,
  type FudabaPlaceSearchResponse,
} from "~/lib/api"
import {
  MapSearchError,
  type MapPlaceSearcher,
  type MapSearchPlace,
} from "~/lib/maps/map-search"
import { createRegionPlaceSearch } from "~/pages/community/exchange/maps/regional/place-search"

type CanonicalLookup = (
  query: string,
  signal: AbortSignal
) => Promise<FudabaPlaceSearchResponse>

interface SearchRegistration {
  matches(config: FudabaMapSearchConfig): boolean
  load(
    config: FudabaMapSearchConfig,
    canonicalLookup?: CanonicalLookup
  ): Promise<MapPlaceSearcher>
}

function register<Id extends FudabaMapSearchConfig["provider"]>(
  id: Id,
  load: (
    config: Extract<FudabaMapSearchConfig, { provider: Id }>,
    canonicalLookup?: CanonicalLookup
  ) => Promise<MapPlaceSearcher>
): SearchRegistration {
  const matches = (
    config: FudabaMapSearchConfig
  ): config is Extract<FudabaMapSearchConfig, { provider: Id }> =>
    config.provider === id
  return {
    matches,
    load(config, canonicalLookup) {
      if (!matches(config)) throw new MapSearchError("unavailable")
      return load(config, canonicalLookup)
    },
  }
}

const registrations: SearchRegistration[] = [
  register(
    "nominatim",
    async (_config, canonicalLookup) => async (query, signal) => {
      const result = canonicalLookup
        ? await canonicalLookup(query, signal)
        : await sendWithAbort(searchFudabaPlaces(query), signal)
      return {
        attribution: result.attribution,
        items: result.items.map<MapSearchPlace>((place) => ({
          id: place.id,
          label: place.label,
          address: place.address,
          target: {
            kind: "wgs84",
            position: [place.location.longitude, place.location.latitude],
          },
          source: {
            provider: "nominatim",
            coordinateSystem: "wgs84",
            position: [place.location.longitude, place.location.latitude],
            calibration: "identity",
          },
        })),
      }
    }
  ),
  register("amap", async (config) =>
    (
      await import("~/pages/community/exchange/maps/amap/place-search")
    ).createAMapPlaceSearch(config)
  ),
  register("mapbox", async (config) =>
    (await import("~/lib/api")).createMapboxPlaceSearch(config.accessToken)
  ),
  register("federated", async (config) => {
    // Keep the wire discriminator for persisted source references. Runtime
    // routing now queries one service, never merges two unrelated result sets.
    const [amapModule, api] = await Promise.all([
      import("~/pages/community/exchange/maps/amap/place-search"),
      import("~/lib/api"),
    ])
    return createRegionPlaceSearch(
      config,
      amapModule.createAMapPlaceSearch(config.mainland, "wgs84", {
        vicinityFirst: true,
      }),
      api.createMapboxPlaceSearch(config.overseas.accessToken)
    )
  }),
]

export async function loadExchangeMapSearch(
  config: FudabaMapSearchConfig,
  canonicalLookup?: CanonicalLookup
): Promise<MapPlaceSearcher> {
  const matches = registrations.filter((registration) =>
    registration.matches(config)
  )
  if (matches.length !== 1) throw new MapSearchError("unavailable")
  return matches[0]!.load(config, canonicalLookup)
}
