import type { MapLibreConfig } from "~/lib/maps/providers/maplibre"
import type { ExchangeMapRenderer } from "~/pages/community/exchange/maps/exchange-map-renderer"
import { ExchangeOfficeMap } from "~/pages/community/exchange/maps/maplibre/office-map"

export function createMapRenderer(config: MapLibreConfig): ExchangeMapRenderer {
  return (props) => <ExchangeOfficeMap {...props} styleUrl={config.styleUrl} />
}
