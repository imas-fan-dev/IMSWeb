import type { MapPosition } from "~/lib/maps/map-engine"
import { MapDisplayError } from "~/lib/maps/map-errors"
import { assertMapActive } from "~/lib/maps/map-lifecycle"
import type { AMapSdk } from "./sdk"

export interface GeographicMapBoundary {
  country: MapPosition[][]
  overseas: MapPosition[][]
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

function boundary(result: unknown, code: string): MapPosition[][] {
  if (!record(result) || !Array.isArray(result.districtList))
    throw new Error("Missing boundary")
  const district = result.districtList.find(
    (item: unknown) => record(item) && String(item.adcode) === code
  )
  if (
    !record(district) ||
    !Array.isArray(district.boundaries) ||
    !district.boundaries.length
  )
    throw new Error("Missing boundary")
  let vertices = 0
  return district.boundaries.map((ring: unknown) => {
    if (
      !Array.isArray(ring) ||
      ring.length < 3 ||
      (vertices += ring.length) > 300000
    )
      throw new Error("Invalid boundary")
    return ring.map((point: unknown): MapPosition => {
      if (
        !record(point) ||
        typeof point.getLng !== "function" ||
        typeof point.getLat !== "function"
      )
        throw new Error("Invalid boundary point")
      const lng: unknown = point.getLng(),
        lat: unknown = point.getLat()
      if (
        typeof lng !== "number" ||
        typeof lat !== "number" ||
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        Math.abs(lng) > 180 ||
        Math.abs(lat) > 85.051129
      )
        throw new Error("Invalid boundary point")
      return [lng, lat]
    })
  })
}

/** Native SDK boundaries stay view-local and are never exported as business geometry. */
export async function loadAMapMapBoundary(
  sdk: Pick<AMapSdk, "DistrictSearch" | "plugin">,
  owner: AbortSignal
): Promise<GeographicMapBoundary> {
  assertMapActive(owner)
  const signal = AbortSignal.any([owner, AbortSignal.timeout(12000)])
  function call<T>(
    start: (done: (value: T) => void, fail: () => void) => void
  ): Promise<T> {
    assertMapActive(signal)
    return new Promise((resolve, reject) => {
      const abort = () =>
        reject(new DOMException("Map session closed", "AbortError"))
      signal.addEventListener("abort", abort, { once: true })
      const done = (value: T) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      }
      const fail = () => {
        signal.removeEventListener("abort", abort)
        reject(new Error("Boundary unavailable"))
      }
      try {
        start(done, fail)
      } catch {
        fail()
      }
    })
  }
  try {
    if (!sdk.DistrictSearch)
      await call<void>((done, fail) => {
        if (!sdk.plugin) return fail()
        sdk.plugin(["AMap.DistrictSearch"], () =>
          sdk.DistrictSearch ? done() : fail()
        )
      })
    const regions: MapPosition[][][] = []
    for (const [name, code] of [
      ["中国", "100000"],
      ["香港特别行政区", "810000"],
      ["澳门特别行政区", "820000"],
      ["台湾省", "710000"],
    ] as const) {
      const result = await call<unknown>((done, fail) => {
        new sdk.DistrictSearch!({
          level: code === "100000" ? "country" : "province",
          subdistrict: 0,
          extensions: "all",
        }).search(name, (status, result) =>
          status === "complete" ? done(result) : fail()
        )
      })
      assertMapActive(signal)
      regions.push(boundary(result, code))
    }
    return { country: regions[0]!, overseas: regions.slice(1).flat() }
  } catch {
    assertMapActive(owner)
    throw new MapDisplayError(
      "resource",
      "大陆与海外地图边界暂不可用，请重试地图。"
    )
  }
}
