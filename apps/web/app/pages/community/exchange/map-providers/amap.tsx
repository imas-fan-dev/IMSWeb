import type { AMapConfig } from "~/lib/maps/providers/amap"
import type { ExchangeMapRenderer } from "../exchange-map-renderer"
import { createAMapDriver } from "../amap-driver"
import { ProviderOfficeMap } from "../provider-office-map"

export function createMapRenderer(config: AMapConfig): ExchangeMapRenderer {
  const driver = createAMapDriver(config)
  return (props) => (
    <ProviderOfficeMap
      {...props}
      driver={driver}
      attribution={{
        segments: [
          { kind: "link", label: "© 高德地图", href: "https://www.amap.com/" },
        ],
      }}
    />
  )
}
