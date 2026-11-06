import { exchangeMapColors } from "~/lib/maps/map-theme"
import type { AMapDistrictLayer, AMapNativeMap, AMapSdk } from "./sdk"

/** Official country outlines over the native basemap, with no area fill. */
export function installAMapPortalTheme(sdk: AMapSdk, map: AMapNativeMap) {
  let closed = false
  const layers: AMapDistrictLayer[] = []
  const detach = () => {
    for (const layer of layers.splice(0).reverse()) {
      try {
        layer.setMap(null)
      } catch {
        // Still release the other layer if the SDK already disposed this one.
      }
    }
  }
  const install = () => {
    if (closed || layers.length) return
    const Country = sdk.DistrictLayer?.Country
    if (!Country) return
    try {
      for (const [zIndex, color, width] of [
        [119, exchangeMapColors.background, 7],
        [120, exchangeMapColors.boundary, 2],
      ] as const) {
        const layer = new Country({
          SOC: "CHN",
          depth: 0,
          zIndex,
          zooms: [2, 20],
        })
        layers.push(layer)
        layer.setStyles({
          fill: "rgba(0,0,0,0)",
          "nation-stroke": color,
          "stroke-width": width,
          "coastline-stroke": "rgba(0,0,0,0)",
          "province-stroke": "rgba(0,0,0,0)",
          "city-stroke": "rgba(0,0,0,0)",
        })
        layer.setMap(map)
      }
    } catch {
      // Optional border styling must not prevent the native map from working.
      detach()
    }
  }
  try {
    if (sdk.DistrictLayer?.Country) install()
    else sdk.plugin?.(["AMap.DistrictLayer"], install)
  } catch {
    detach()
  }
  return () => {
    closed = true
    detach()
  }
}
