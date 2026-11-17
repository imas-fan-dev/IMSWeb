import type { MapboxConfig } from "~/lib/maps/providers/mapbox"
import type { ExchangeMapRenderer } from "~/pages/community/exchange/maps/exchange-map-renderer"
import { createMapboxDriver } from "~/pages/community/exchange/maps/mapbox/driver"
import { ProviderOfficeMap } from "~/pages/community/exchange/maps/provider-office-map"

export function createMapRenderer(config: MapboxConfig): ExchangeMapRenderer {
  const driver = createMapboxDriver(config)
  return (props) => (
    <ProviderOfficeMap
      {...props}
      driver={driver}
      attribution={{
        segments: [
          {
            kind: "link",
            label: "© Mapbox",
            href: "https://www.mapbox.com/about/maps/",
          },
          { kind: "text", value: " · " },
          {
            kind: "link",
            label: "© OpenStreetMap",
            href: "https://www.openstreetmap.org/copyright",
          },
          { kind: "text", value: " · " },
          {
            kind: "link",
            label: "Improve this map",
            href: "https://apps.mapbox.com/feedback/",
          },
        ],
      }}
    />
  )
}
