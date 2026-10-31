import type { FudabaRegionalProviderMapConfig } from "@imsweb/contracts/fudaba/map-delivery"
import type { ExchangeMapRenderer } from "~/pages/community/exchange/maps/exchange-map-renderer"
import { createMapRenderer as createMapboxRenderer } from "./renderer"

/** Search-region selection never replaces the basemap or creates an AMap view. */
export function createMapRenderer(
  config: FudabaRegionalProviderMapConfig
): ExchangeMapRenderer {
  return createMapboxRenderer(config.overseas)
}
