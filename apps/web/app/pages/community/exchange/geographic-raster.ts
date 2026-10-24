import type { MapPosition } from "~/lib/maps/map-engine"
import { assertMapActive } from "~/lib/maps/map-lifecycle"
import type { AMapFlexibleOptions, AMapSdk } from "./amap-sdk"
import { convertAMapPositions } from "./amap-coordinates"
import { createAMapRasterProjection } from "./amap-raster-projection"
import type { GeographicMapBoundary } from "./amap-map-boundary"
import { resampleRaster } from "./geographic-raster-sampling"
import {
  mapWorldPoint,
  mapWorldPosition,
  mapBoundaryRings,
  clipMapRing,
  type MapBoundaryRing,
} from "./geographic-map-geometry"

const SIZE = 256

function canvas(pixelRatio = 1, width = SIZE, height = SIZE) {
  const element = document.createElement("canvas")
  element.width = width * pixelRatio
  element.height = height * pixelRatio
  const context = element.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Raster processing unavailable")
  context.scale(pixelRatio, pixelRatio)
  return { element, context }
}

/** Native country coverage, with Hong Kong, Macao and Taiwan restored to overseas. */
export function overseasTileMask(
  country: MapBoundaryRing[],
  overseas: MapBoundaryRing[],
  x: number,
  y: number,
  z: number,
  pixelRatio = 1
) {
  const tile = canvas(pixelRatio),
    count = 2 ** z
  x = ((x % count) + count) % count
  tile.context.fillStyle = "white"
  tile.context.fillRect(0, 0, SIZE, SIZE)
  // Add the restored coverage, rather than alpha-blending it: coincident
  // country/overseas edges must cancel completely, including antialias pixels.
  for (const [rings, operation] of [
    [country, "destination-out"],
    [overseas, "lighter"],
  ] as const) {
    tile.context.globalCompositeOperation = operation
    for (const polygon of rings) {
      if (
        polygon.east < x / count ||
        polygon.west > (x + 1) / count ||
        polygon.south < y / count ||
        polygon.north > (y + 1) / count
      )
        continue
      tile.context.beginPath()
      const ring = clipMapRing(
        polygon.points,
        x / count,
        y / count,
        (x + 1) / count,
        (y + 1) / count
      )
      ring.forEach((point, index) => {
        const px = (point.x * count - x) * SIZE,
          py = (point.y * count - y) * SIZE
        if (index === 0) tile.context.moveTo(px, py)
        else tile.context.lineTo(px, py)
      })
      tile.context.closePath()
      tile.context.fill("evenodd")
    }
  }
  tile.context.globalCompositeOperation = "source-over"
  const pixels = tile.context.getImageData(
    0,
    0,
    tile.element.width,
    tile.element.height
  ).data
  let visible = false
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]) {
      visible = true
      break
    }
  }
  return { ...tile, visible }
}

/** A raster-only source window, solved using official forward samples; never persisted. */
export async function rasterSourceWindow(
  sdk: Pick<AMapSdk, "convertFrom">,
  x: number,
  y: number,
  z: number,
  signal: AbortSignal,
  project: (
    positions: MapPosition[],
    zoom: number
  ) => Promise<MapPosition[]> = (positions) =>
    convertAMapPositions(sdk, positions),
  pixelRatio = 1
) {
  const count = 2 ** z
  const target = Array.from({ length: 25 }, (_, index) => ({
    x: (x + (index % 5) / 4) / count,
    y: (y + Math.floor(index / 5) / 4) / count,
  }))
  let source = target.map((p) => ({ ...p }))
  let unchanged = true
  // Forward-only SDK evaluations locate the raster patch in the native tile plane.
  // No local GCJ formula and no provider-native position enters business state.
  for (let iteration = 0; iteration < 2; iteration++) {
    assertMapActive(signal)
    const projected = (await project(source.map(mapWorldPosition), z)).map(
      mapWorldPoint
    )
    assertMapActive(signal)
    if (iteration === 0)
      unchanged = projected.every(
        (p, i) =>
          Math.hypot(p.x - target[i]!.x, p.y - target[i]!.y) * count * SIZE <
          0.01
      )
    source = source.map((p, i) => ({
      x: p.x + target[i]!.x - projected[i]!.x,
      y: p.y + target[i]!.y - projected[i]!.y,
    }))
  }
  // Bilinear sampling needs half a physical pixel beyond the mesh envelope.
  const margin = 0.5 / (count * SIZE * pixelRatio)
  return {
    mesh: source,
    unchanged,
    west: Math.min(...source.map((p) => p.x)) - margin,
    east: Math.max(...source.map((p) => p.x)) + margin,
    north: Math.min(...source.map((p) => p.y)) - margin,
    south: Math.max(...source.map((p) => p.y)) + margin,
  }
}

export function geographicTileRenderer(
  sdk: Pick<AMapSdk, "convertFrom">,
  boundary: GeographicMapBoundary,
  load: (x: number, y: number, z: number) => Promise<Blob>,
  signal: AbortSignal,
  onError: () => void,
  options: {
    pixelRatio?: 1 | 2
    priority?: (x: number, y: number, z: number) => number
  } = {}
): AMapFlexibleOptions["createTile"] {
  const pixelRatio = options.pixelRatio ?? 1
  const project = createAMapRasterProjection(sdk, signal)
  const country = mapBoundaryRings(boundary.country),
    overseas = mapBoundaryRings(boundary.overseas)
  const jobs: {
    priority(): number
    prepare(): void
    run(): Promise<void>
    drop(): void
  }[] = []
  let running = 0,
    scheduled = false
  function scheduleDrain() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      drain()
    })
  }
  function drain() {
    if (signal.aborted) {
      jobs.length = 0
      return
    }
    jobs.sort((a, b) => a.priority() - b.priority())
    // Batch the next camera-near coordinate windows while current images load.
    // Preparing at most eight queued jobs avoids a chain of tiny SDK requests.
    for (const job of jobs.slice(0, 8)) job.prepare()
    while (running < 4 && jobs.length) {
      const job = jobs.shift()!
      running++
      void job.run().finally(() => {
        running--
        scheduleDrain()
      })
    }
  }
  return (rawX, y, z, success, fail) => {
    if (signal.aborted) return
    const count = 2 ** z,
      x = ((rawX % count) + count) % count
    if (y < 0 || y >= count || z < 0 || z > 22) {
      fail()
      return
    }
    let prepared:
      | Promise<{
          mask: ReturnType<typeof overseasTileMask>
          window: Awaited<ReturnType<typeof rasterSourceWindow>> | null
        }>
      | undefined
    const prepare = () => {
      if (!prepared) {
        prepared = (async () => {
          assertMapActive(signal)
          const mask = overseasTileMask(country, overseas, x, y, z, pixelRatio)
          const west = (x / count) * 360 - 180,
            east = ((x + 1) / count) * 360 - 180
          const north = mapWorldPosition({ x: 0, y: y / count })[1],
            south = mapWorldPosition({ x: 0, y: (y + 1) / count })[1]
          const needsProjection =
            mask.visible &&
            z > 7 &&
            east >= 72 &&
            west <= 138 &&
            north >= 0.8 &&
            south <= 56
          const window = needsProjection
            ? await rasterSourceWindow(
                sdk,
                x,
                y,
                z,
                signal,
                project,
                pixelRatio
              )
            : null
          return { mask, window }
        })()
        // Preparation can fail before a queued job starts; run() owns its error UI.
        void prepared.catch(() => {})
      }
      return prepared
    }
    // Bound obsolete work after continuous gestures; only four jobs run at once.
    jobs.push({
      priority: () => options.priority?.(x, y, z) ?? 0,
      prepare() {
        void prepare()
      },
      drop: fail,
      run: async () => {
        try {
          assertMapActive(signal)
          const { mask, window } = await prepare()
          assertMapActive(signal)
          if (!mask.visible) {
            success(mask.element)
            return
          }
          const output = canvas(pixelRatio)
          if (!window || window.unchanged) {
            const image = await createImageBitmap(await load(x, y, z))
            try {
              assertMapActive(signal)
              output.context.drawImage(image, 0, 0, SIZE, SIZE)
            } finally {
              image.close()
            }
          } else {
            const left = Math.floor(window.west * count),
              right = Math.floor(window.east * count)
            const top = Math.max(0, Math.floor(window.north * count)),
              bottom = Math.min(count - 1, Math.floor(window.south * count))
            if ((right - left + 1) * (bottom - top + 1) > 16)
              throw new Error("Raster patch out of range")
            const atlas = canvas(
              pixelRatio,
              (right - left + 1) * SIZE,
              (bottom - top + 1) * SIZE
            )
            const patches: Promise<void>[] = []
            for (let sy = top; sy <= bottom; sy++)
              for (let sx = left; sx <= right; sx++)
                patches.push(
                  (async () => {
                    const image = await createImageBitmap(await load(sx, sy, z))
                    try {
                      assertMapActive(signal)
                      atlas.context.drawImage(
                        image,
                        (sx - left) * SIZE,
                        (sy - top) * SIZE,
                        SIZE,
                        SIZE
                      )
                    } finally {
                      image.close()
                    }
                  })()
                )
            await Promise.all(patches)
            assertMapActive(signal)
            const pixels = output.context.createImageData(
              output.element.width,
              output.element.height
            )
            resampleRaster(
              atlas.context.getImageData(
                0,
                0,
                atlas.element.width,
                atlas.element.height
              ),
              pixels,
              window.mesh.map((p) => ({
                x: (p.x * count - left) * SIZE * pixelRatio,
                y: (p.y * count - top) * SIZE * pixelRatio,
              }))
            )
            output.context.putImageData(pixels, 0, 0)
          }
          assertMapActive(signal)
          output.context.globalCompositeOperation = "destination-in"
          output.context.drawImage(mask.element, 0, 0, SIZE, SIZE)
          success(output.element)
        } catch {
          if (!signal.aborted) {
            try {
              const fallback = overseasTileMask(
                country,
                overseas,
                x,
                y,
                z,
                pixelRatio
              )
              fallback.context.globalCompositeOperation = "source-in"
              fallback.context.fillStyle = "#edf3f8"
              fallback.context.fillRect(0, 0, SIZE, SIZE)
              success(fallback.element)
            } catch {
              fail()
            }
            onError()
          }
        }
      },
    })
    if (jobs.length > 64) {
      jobs.sort((a, b) => a.priority() - b.priority())
      jobs.pop()!.drop()
    }
    scheduleDrain()
  }
}
