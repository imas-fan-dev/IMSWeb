import type { AMapConfig } from "~/lib/maps/providers/amap"
import type { ExchangeMapRenderer } from "~/pages/community/exchange/maps/exchange-map-renderer"
import { createAMapDriver } from "~/pages/community/exchange/maps/amap/driver"
import { ProviderOfficeMap } from "~/pages/community/exchange/maps/provider-office-map"

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
