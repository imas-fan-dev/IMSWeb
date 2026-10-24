import { expect, it } from "vitest"
import {
  alignMapFrames,
  mapBoundaryRings,
  clipMapRing,
  mapWorldPosition,
  mapWorldPoint,
  transformMapPoint,
} from "~/pages/community/exchange/geographic-map-geometry"

it("maps raster mesh triangles without changing coordinates", () => {
  const source = [
    { x: 100, y: 120 },
    { x: 104, y: 119 },
    { x: 101, y: 115 },
  ]
  const target = [
    { x: 400, y: 300 },
    { x: 408, y: 300 },
    { x: 400, y: 290 },
  ]
  const registration = alignMapFrames(source, target)
  for (let index = 0; index < source.length; index++) {
    const projected = transformMapPoint(registration, source[index]!)
    expect(projected.x).toBeCloseTo(target[index]!.x)
    expect(projected.y).toBeCloseTo(target[index]!.y)
  }
  expect(() => alignMapFrames(source, [])).toThrow()
  expect(() =>
    alignMapFrames([source[0]!, source[0]!, source[0]!], target)
  ).toThrow()
})

it("round-trips Mercator projection across world copies without changing the coordinate CRS", () => {
  for (const longitude of [121.5, 179.9, -179.9, 540]) {
    const center: [number, number] = [longitude, 31.2]
    const projected = mapWorldPosition(mapWorldPoint(center))
    expect(projected[0]).toBeCloseTo(center[0])
    expect(projected[1]).toBeCloseTo(center[1])
  }
})

it("clips native boundary rings before drawing, including a tile enclosed without any interior source vertex", () => {
  const ring = [
    { x: -5, y: -5 },
    { x: 5, y: -5 },
    { x: 5, y: 5 },
    { x: -5, y: 5 },
  ]
  const clipped = clipMapRing(ring, 0, 0, 1, 1)
  expect(clipped).toHaveLength(4)
  expect(new Set(clipped.map((p) => `${p.x},${p.y}`))).toEqual(
    new Set(["0,0", "1,0", "1,1", "0,1"])
  )
  expect(clipMapRing(ring, 6, 6, 7, 7)).toEqual([])
  const projected = mapBoundaryRings([
    [
      [110, 20],
      [120, 20],
      [120, 30],
    ],
  ])[0]!
  expect(projected.points).toHaveLength(3)
  expect(projected.west).toBeLessThan(projected.east)
  expect(projected.north).toBeLessThan(projected.south)
})
