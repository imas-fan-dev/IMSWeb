import { expect, it } from "vitest"
import { resampleRaster } from "~/pages/community/exchange/maps/amap/raster/sampling"

const mesh = (width: number, height: number) =>
  Array.from({ length: 25 }, (_, i) => ({
    x: ((i % 5) * width) / 4,
    y: (Math.floor(i / 5) * height) / 4,
  }))
const pixels = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
})

it("keeps an opaque source opaque across all inverse mesh cells, including retina output", () => {
  const source = pixels(8, 8),
    target = pixels(128, 128)
  for (let i = 0; i < source.data.length; i += 4)
    source.data.set([18, 160, 210, 255], i)
  const grid = mesh(8, 8).map((p, i) => ({
    x: p.x + Math.sin(i) * 0.2,
    y: p.y + Math.cos(i) * 0.1,
  }))
  resampleRaster(source, target, grid)
  for (let i = 0; i < target.data.length; i += 4)
    expect([...target.data.slice(i, i + 4)]).toEqual([18, 160, 210, 255])
})

it("preserves pixel centers at unchanged scale instead of enlarging an older tile", () => {
  const source = pixels(8, 8),
    target = pixels(8, 8)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      source.data.set([x * 24, y * 24, (x + y) * 12, 255], (y * 8 + x) * 4)
  resampleRaster(source, target, mesh(8, 8))
  expect(target.data).toEqual(source.data)
})

it("interpolates premultiplied alpha without leaking transparent pixel colors", () => {
  const source = pixels(2, 1),
    target = pixels(1, 1)
  source.data.set([255, 0, 0, 0, 0, 0, 255, 255])
  resampleRaster(source, target, mesh(2, 1))
  expect([...target.data]).toEqual([0, 0, 255, 128])
})
