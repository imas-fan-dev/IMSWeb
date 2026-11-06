import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { test, expect } from "./fixtures/test"
import type { AMapSdk } from "~/pages/community/exchange/maps/amap/sdk"

declare global {
  interface Window {
    GeographicRaster: typeof import("~/pages/community/exchange/maps/amap/raster/geographic-raster")
  }
}

let bundle: string
test.beforeAll(async () => {
  const { build } = await import("vite")
  const root = fileURLToPath(new URL("../../", import.meta.url))
  const result = await build({
    configFile: false,
    root,
    logLevel: "error",
    resolve: { alias: { "~": join(root, "app") } },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: join(
          root,
          "app/pages/community/exchange/maps/amap/raster/geographic-raster.ts"
        ),
        name: "GeographicRaster",
        formats: ["iife"],
      },
    },
  })
  if (!Array.isArray(result) && !("output" in result))
    throw new Error("Unexpected watcher")
  const entry = (Array.isArray(result) ? result : [result])
    .flatMap((b) => b.output)
    .find((o) => o.type === "chunk" && o.isEntry)
  if (!entry || entry.type !== "chunk")
    throw new Error("Missing raster test bundle")
  bundle = entry.code
})

for (const pixelRatio of [1, 2] as const)
  test(`opaque reprojected tiles have no transparent mesh or tile-edge seams at ${pixelRatio}x`, async ({
    page,
  }) => {
    await page.addScriptTag({ content: bundle })
    const result = await page.evaluate(async (ratio) => {
      const sdk: Pick<AMapSdk, "convertFrom"> = {
        convertFrom(points, _type, done) {
          done("complete", {
            info: "ok",
            locations: points.map(([lng, lat]) => ({
              getLng: () => lng + 0.003,
              getLat: () => lat + 0.002,
            })),
          })
        },
      }
      const image = document.createElement("canvas")
      image.width = image.height = 256 * ratio
      const ctx = image.getContext("2d")!
      ctx.fillStyle = "rgb(18,160,210)"
      ctx.fillRect(0, 0, image.width, image.height)
      const blob = await new Promise<Blob>((resolve, reject) =>
        image.toBlob((b) =>
          b ? resolve(b) : reject(new Error("Missing image"))
        )
      )
      const owner = new AbortController()
      try {
        const render = window.GeographicRaster.geographicTileRenderer(
          sdk,
          { country: [], overseas: [] },
          async () => blob,
          owner.signal,
          () => {
            throw new Error("Unexpected resource error")
          },
          { pixelRatio: ratio }
        )
        const tile = await new Promise<HTMLCanvasElement>((resolve, reject) =>
          render(213, 110, 8, resolve, () => reject(new Error("Tile failed")))
        )
        const rgba = tile
          .getContext("2d")!
          .getImageData(0, 0, tile.width, tile.height).data
        let badAlpha = 0,
          badColor = 0
        for (let i = 0; i < rgba.length; i += 4) {
          if (rgba[i + 3] !== 255) badAlpha++
          if (rgba[i] !== 18 || rgba[i + 1] !== 160 || rgba[i + 2] !== 210)
            badColor++
        }
        return { width: tile.width, height: tile.height, badAlpha, badColor }
      } finally {
        owner.abort()
      }
    }, pixelRatio)
    expect(result).toEqual({
      width: 256 * pixelRatio,
      height: 256 * pixelRatio,
      badAlpha: 0,
      badColor: 0,
    })
  })

test("restoring an overseas boundary does not leave a halo in otherwise fully overseas coverage", async ({
  page,
}) => {
  await page.addScriptTag({ content: bundle })
  const result = await page.evaluate(() => {
    const points = [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.3 },
      { x: 0.6, y: 0.8 },
    ]
    const rings = [{ points, west: 0.2, east: 0.8, north: 0.2, south: 0.8 }]
    const tile = window.GeographicRaster.overseasTileMask(rings, rings, 0, 0, 0)
    const rgba = tile.context.getImageData(0, 0, 256, 256).data
    let holes = 0
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) holes++
    return holes
  })
  expect(result).toBe(0)
})

test("bounds pending work and prioritizes the current view after a rapid camera change", async ({
  page,
}) => {
  await page.addScriptTag({ content: bundle })
  const result = await page.evaluate(async () => {
    const owner = new AbortController(),
      started: number[] = [],
      dropped: number[] = []
    const image = document.createElement("canvas")
    image.width = image.height = 256
    const blob = await new Promise<Blob>((resolve, reject) =>
      image.toBlob((b) => (b ? resolve(b) : reject(new Error("Missing image"))))
    )
    let releaseFirst: () => void = () => {},
      targetStarted: () => void = () => {},
      fourStarted: () => void = () => {}
    const target = new Promise<void>((r) => {
        targetStarted = r
      }),
      four = new Promise<void>((r) => {
        fourStarted = r
      })
    let cameraTarget = 0
    const render = window.GeographicRaster.geographicTileRenderer(
      {
        convertFrom() {
          throw new Error("Low zoom must not convert")
        },
      },
      { country: [], overseas: [] },
      (x) => {
        started.push(x)
        if (started.length === 4) fourStarted()
        if (x === 70) targetStarted()
        return new Promise<Blob>((resolve, reject) => {
          const abort = () => reject(new DOMException("Canceled", "AbortError"))
          owner.signal.addEventListener("abort", abort, { once: true })
          if (x === 0)
            releaseFirst = () => {
              owner.signal.removeEventListener("abort", abort)
              resolve(blob)
            }
        })
      },
      owner.signal,
      () => {},
      { priority: (x) => Math.abs(x - cameraTarget) }
    )
    try {
      for (let x = 0; x < 4; x++)
        render(
          x,
          64,
          7,
          () => {},
          () => {
            dropped.push(x)
          }
        )
      await four
      const initial = started.length
      cameraTarget = 70
      for (let x = 4; x < 80; x++)
        render(
          x,
          64,
          7,
          () => {},
          () => {
            dropped.push(x)
          }
        )
      releaseFirst()
      await target
      return {
        initial,
        next: started[4],
        overflowDropped: dropped.length > 0,
        currentDropped: dropped.includes(70),
      }
    } finally {
      owner.abort()
    }
  })
  expect(result).toEqual({
    initial: 4,
    next: 70,
    overflowDropped: true,
    currentDropped: false,
  })
})

test("prepares queued coordinate windows while active images are still waiting", async ({
  page,
}) => {
  await page.addScriptTag({ content: bundle })
  const result = await page.evaluate(async () => {
    const owner = new AbortController()
    let preparedQueued = false,
      imagesStarted = 0,
      fourStarted: () => void = () => {}
    const four = new Promise<void>((resolve) => {
      fourStarted = resolve
    })
    const sdk: Pick<AMapSdk, "convertFrom"> = {
      convertFrom(points, _type, done) {
        if (points.some(([lng]) => lng >= 125)) preparedQueued = true
        done("complete", {
          info: "ok",
          locations: points.map(([lng, lat]) => ({
            getLng: () => lng + 0.003,
            getLat: () => lat + 0.002,
          })),
        })
      },
    }
    const render = window.GeographicRaster.geographicTileRenderer(
      sdk,
      { country: [], overseas: [] },
      () => {
        if (++imagesStarted === 4) fourStarted()
        return new Promise<Blob>((_resolve, reject) =>
          owner.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Canceled", "AbortError")),
            { once: true }
          )
        )
      },
      owner.signal,
      () => {}
    )
    try {
      for (let x = 210; x < 218; x++)
        render(
          x,
          110,
          8,
          () => {},
          () => {}
        )
      await four
      return { imagesWaiting: imagesStarted > 0, preparedQueued }
    } finally {
      owner.abort()
    }
  })
  expect(result).toEqual({ imagesWaiting: true, preparedQueued: true })
})
