import type { MapPosition } from "~/lib/maps/map-engine"
import { assertMapActive } from "~/lib/maps/map-lifecycle"
import type { AMapSdk } from "~/pages/community/exchange/maps/amap/sdk"
import { convertAMapPositions } from "~/pages/community/exchange/maps/amap/coordinates"

/** A view-local displacement grid sampled exclusively through official GPS conversion. */
export function createAMapRasterProjection(
  sdk: Pick<AMapSdk, "convertFrom">,
  signal: AbortSignal
) {
  type Sample = {
    position: MapPosition
    resolve(point: MapPosition): void
    reject(error: unknown): void
  }
  const samples = new Map<string, Promise<MapPosition>>()
  const pending: Sample[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false,
    nextRequest = 0
  const abort = () => {
    clearTimeout(timer)
    for (const sample of pending.splice(0))
      sample.reject(new DOMException("Map session closed", "AbortError"))
    samples.clear()
  }
  signal.addEventListener("abort", abort, { once: true })
  function schedule() {
    if (timer || running || signal.aborted || !pending.length) return
    timer = setTimeout(
      () => {
        timer = undefined
        void drain()
      },
      Math.max(25, nextRequest - Date.now())
    )
  }
  async function drain() {
    if (signal.aborted) return
    running = true
    const batch = pending.splice(0, 40)
    nextRequest = Date.now() + 600
    try {
      const result = await convertAMapPositions(
        sdk,
        batch.map((sample) => sample.position)
      )
      assertMapActive(signal)
      batch.forEach((sample, i) => sample.resolve(result[i]!))
    } catch (error) {
      batch.forEach((sample) => sample.reject(error))
    } finally {
      running = false
      schedule()
    }
  }
  function sample(position: MapPosition) {
    const key = position.join(",")
    let result = samples.get(key)
    if (!result) {
      result = new Promise<MapPosition>((resolve, reject) => {
        pending.push({ position, resolve, reject })
        schedule()
      })
      const retained = result
      void result.catch(() => {
        if (samples.get(key) === retained) samples.delete(key)
      })
      samples.set(key, result)
      if (samples.size > 2048) samples.delete(samples.keys().next().value!)
    }
    return result
  }
  return async (
    positions: MapPosition[],
    zoom: number
  ): Promise<MapPosition[]> => {
    assertMapActive(signal)
    // Fixed shared lattice per zoom avoids separate conversion meshes per tile.
    const step = 2 ** Math.max(-11, Math.min(1, 8 - zoom))
    const grids = positions.map(([lng, lat]) => {
      const west = Math.floor(lng / step) * step,
        south = Math.floor(lat / step) * step
      return {
        lng,
        lat,
        west,
        south,
        points: [
          [west, south],
          [west + step, south],
          [west, south + step],
          [west + step, south + step],
        ] as MapPosition[],
      }
    })
    const values = await Promise.all(
      grids.map((grid) => Promise.all(grid.points.map(sample)))
    )
    assertMapActive(signal)
    return grids.map((grid, i) => {
      const x = (grid.lng - grid.west) / step,
        y = (grid.lat - grid.south) / step
      const weights = [(1 - x) * (1 - y), x * (1 - y), (1 - x) * y, x * y]
      return [0, 1].map(
        (axis) =>
          grid[axis === 0 ? "lng" : "lat"] +
          values[i]!.reduce(
            (sum, point, j) =>
              sum + (point[axis]! - grid.points[j]![axis]!) * weights[j]!,
            0
          )
      ) as MapPosition
    })
  }
}
