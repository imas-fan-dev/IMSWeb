import type { MapboxConfig } from "~/lib/maps/providers/mapbox"
import type { ExchangeMapRenderer } from "../exchange-map-renderer"
import { createMapboxDriver } from "../mapbox-driver"
import { ProviderOfficeMap } from "../provider-office-map"

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
