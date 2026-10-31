import type { AMapSdk } from "./sdk"
import type { MapPosition } from "~/lib/maps/map-engine"
import type { FudabaPlaceReverseResponse } from "~/lib/api"
import { MapSearchError } from "~/lib/maps/map-search"

const attribution = { text: "© 高德地图", url: "https://www.amap.com/" }
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

/** Native coordinates are for the query only; the confirmed business point stays WGS84. */
export function reverseAMapPosition(
  sdk: Pick<AMapSdk, "Geocoder" | "plugin">,
  nativePosition: MapPosition,
  confirmed: MapPosition,
  signal: AbortSignal
): Promise<FudabaPlaceReverseResponse> {
  signal.throwIfAborted()
  const point: MapPosition = [...confirmed]
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (value?: FudabaPlaceReverseResponse, error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolve(value!)
    }
    const abort = () =>
      finish(
        undefined,
        new DOMException("Address lookup cancelled", "AbortError")
      )
    const timeout = setTimeout(
      () => finish(undefined, new MapSearchError("unavailable")),
      8000
    )
    signal.addEventListener("abort", abort, { once: true })
    const run = () => {
      if (settled || signal.aborted) return
      if (!sdk.Geocoder) {
        finish(undefined, new MapSearchError("unavailable"))
        return
      }
      try {
        const geocoder = new sdk.Geocoder({ radius: 1000, extensions: "all" })
        geocoder.getAddress([...nativePosition], (status, result) => {
          if (settled || signal.aborted) return
          if (status === "no_data") {
            finish({ place: null, attribution })
            return
          }
          if (status !== "complete") {
            finish(undefined, new MapSearchError("failed"))
            return
          }
          const address = record(record(result).regeocode)
          const component = record(address.addressComponent)
          const province = text(component.province)
          const city =
            text(component.city) ||
            (province.endsWith("市")
              ? province
              : text(component.district) || province)
          const street = record(component.streetNumber)
          const detail =
            text(address.formattedAddress) ||
            [
              ...new Set(
                [
                  province,
                  city,
                  text(component.district),
                  text(component.township),
                  text(street.street) + text(street.number),
                ].filter(Boolean)
              ),
            ].join("")
          finish({
            place:
              detail || city
                ? {
                    id: `amap-reverse:${point[0]},${point[1]}`,
                    label: detail || city,
                    city,
                    address: detail,
                    location: {
                      longitude: point[0],
                      latitude: point[1],
                      precision: "exact",
                    },
                  }
                : null,
            attribution,
          })
        })
      } catch {
        finish(undefined, new MapSearchError("failed"))
      }
    }
    if (sdk.Geocoder) run()
    else if (sdk.plugin) {
      try {
        sdk.plugin(["AMap.Geocoder"], run)
      } catch {
        finish(undefined, new MapSearchError("unavailable"))
      }
    } else finish(undefined, new MapSearchError("unavailable"))
  })
}
