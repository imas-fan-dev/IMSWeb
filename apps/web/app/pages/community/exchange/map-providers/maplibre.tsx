import type { MapLibreConfig } from "~/lib/maps/providers/maplibre"
import type { ExchangeMapRenderer } from "../exchange-map-renderer"
import { ExchangeOfficeMap } from "../exchange-office-map"

export function createMapRenderer(config: MapLibreConfig): ExchangeMapRenderer {
  return (props) => <ExchangeOfficeMap {...props} styleUrl={config.styleUrl} />
}
