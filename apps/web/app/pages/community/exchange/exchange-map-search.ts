import type { FudabaMapSearchConfig } from "@imsweb/contracts/fudaba/map-delivery"
import { searchFudabaPlaces, sendWithAbort } from "~/lib/api"
import { MapSearchError, type MapPlaceSearcher } from "~/lib/maps/map-search"
import { createRegionPlaceSearch } from "./region-place-search"

interface SearchRegistration {
  matches(config: FudabaMapSearchConfig): boolean
  load(config: FudabaMapSearchConfig): Promise<MapPlaceSearcher>
}

function register<Id extends FudabaMapSearchConfig["provider"]>(
  id: Id,
  load: (
    config: Extract<FudabaMapSearchConfig, { provider: Id }>
  ) => Promise<MapPlaceSearcher>
): SearchRegistration {
  const matches = (
    config: FudabaMapSearchConfig
  ): config is Extract<FudabaMapSearchConfig, { provider: Id }> =>
    config.provider === id
  return {
    matches,
    load(config) {
      if (!matches(config)) throw new MapSearchError("unavailable")
      return load(config)
    },
  }
}

const registrations: SearchRegistration[] = [
  register("nominatim", async () => async (query, signal) => {
    const result = await sendWithAbort(searchFudabaPlaces(query), signal)
    return {
      attribution: result.attribution,
      items: result.items.map((place) => ({
        id: place.id,
        label: place.label,
        address: place.address,
        target: {
          kind: "wgs84" as const,
          position: [place.location.longitude, place.location.latitude],
        },
      })),
    }
  }),
  register("amap", async (config) =>
    (await import("./amap-place-search")).createAMapPlaceSearch(config)
  ),
  register("mapbox", async (config) =>
    (await import("~/lib/api")).createMapboxPlaceSearch(config.accessToken)
  ),
  register("federated", async (config) => {
    // Keep the wire discriminator for persisted source references. Runtime
    // routing now queries one service, never merges two unrelated result sets.
    const [amapModule, api] = await Promise.all([
      import("./amap-place-search"),
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
  config: FudabaMapSearchConfig
): Promise<MapPlaceSearcher> {
  const matches = registrations.filter((registration) =>
    registration.matches(config)
  )
  if (matches.length !== 1) throw new MapSearchError("unavailable")
  return matches[0]!.load(config)
}
