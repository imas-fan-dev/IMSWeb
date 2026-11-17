import type { MapPosition, MapScreenPoint } from "~/lib/maps/map-engine"

export interface MapAffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function transformMapPoint(
  matrix: MapAffineTransform,
  point: MapScreenPoint
): MapScreenPoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

/** Affine mapping for a raster mesh triangle; coordinate conversion stays in the SDK. */
export function alignMapFrames(
  from: readonly MapScreenPoint[],
  to: readonly MapScreenPoint[]
): MapAffineTransform {
  if (from.length !== 3 || to.length !== 3)
    throw new Error("Three map fiducials required")
  const [p, q, r] = from as [MapScreenPoint, MapScreenPoint, MapScreenPoint]
  const [u, v, w] = to as [MapScreenPoint, MapScreenPoint, MapScreenPoint]
  const x1 = q.x - p.x,
    y1 = q.y - p.y,
    x2 = r.x - p.x,
    y2 = r.y - p.y
  const determinant = x1 * y2 - x2 * y1
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10)
    throw new Error("Map fiducials are degenerate")
  const a = ((v.x - u.x) * y2 - (w.x - u.x) * y1) / determinant
  const c = ((w.x - u.x) * x1 - (v.x - u.x) * x2) / determinant
  const b = ((v.y - u.y) * y2 - (w.y - u.y) * y1) / determinant
  const d = ((w.y - u.y) * x1 - (v.y - u.y) * x2) / determinant
  return { a, b, c, d, e: u.x - a * p.x - c * p.y, f: u.y - b * p.x - d * p.y }
}

/** Mercator projection only; it does not convert between coordinate systems. */
export function mapWorldPoint([
  longitude,
  latitude,
]: MapPosition): MapScreenPoint {
  const radians =
    (Math.max(-85.0511287798066, Math.min(85.0511287798066, latitude)) *
      Math.PI) /
    180
  return {
    x: (longitude + 180) / 360,
    y: (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2,
  }
}

/** Inverse of the Mercator projection only; this does not change a coordinate CRS. */
export function mapWorldPosition({ x, y }: MapScreenPoint): MapPosition {
  return [
    x * 360 - 180,
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  ]
}

export interface MapBoundaryRing {
  points: MapScreenPoint[]
  west: number
  north: number
  east: number
  south: number
}

/** Project once per view; large native boundaries must not use argument spreading. */
export function mapBoundaryRings(
  rings: readonly MapPosition[][]
): MapBoundaryRing[] {
  return rings.map((ring) => {
    const points = ring.map(mapWorldPoint)
    const bounds = {
      west: Infinity,
      east: -Infinity,
      north: Infinity,
      south: -Infinity,
    }
    for (const point of points) {
      bounds.west = Math.min(bounds.west, point.x)
      bounds.east = Math.max(bounds.east, point.x)
      bounds.north = Math.min(bounds.north, point.y)
      bounds.south = Math.max(bounds.south, point.y)
    }
    return { points, ...bounds }
  })
}

/** Clip in doubles before drawing: avoid huge offscreen Canvas paths and precision loss. */
export function clipMapRing(
  points: MapScreenPoint[],
  west: number,
  north: number,
  east: number,
  south: number
): MapScreenPoint[] {
  let result = points
  for (const [axis, edge, lower] of [
    ["y", north, true],
    ["y", south, false],
    ["x", west, true],
    ["x", east, false],
  ] as const) {
    const input = result
    result = []
    if (!input.length) break
    let previous = input[input.length - 1]!
    let wasInside = lower ? previous[axis] >= edge : previous[axis] <= edge
    for (const point of input) {
      const inside = lower ? point[axis] >= edge : point[axis] <= edge
      if (inside !== wasInside) {
        const t = (edge - previous[axis]) / (point[axis] - previous[axis])
        result.push({
          x: previous.x + t * (point.x - previous.x),
          y: previous.y + t * (point.y - previous.y),
          [axis]: edge,
        })
      }
      if (inside) result.push(point)
      previous = point
      wasInside = inside
    }
  }
  return result
}
