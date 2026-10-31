import type { MapScreenPoint } from "~/lib/maps/map-engine"

type RasterPixels = Pick<ImageData, "width" | "height" | "data">

/** Pull pixels through a 5×5 inverse mesh: no antialiased triangle clips or holes. */
export function resampleRaster(
  source: RasterPixels,
  target: RasterPixels,
  mesh: MapScreenPoint[]
) {
  const input = source.data,
    output = target.data
  for (let y = 0; y < target.height; y++) {
    const gy = ((y + 0.5) / target.height) * 4
    const row = Math.min(3, Math.floor(gy)),
      fy = gy - row
    for (let x = 0; x < target.width; x++) {
      const gx = ((x + 0.5) / target.width) * 4
      const col = Math.min(3, Math.floor(gx)),
        fx = gx - col
      const a = mesh[row * 5 + col]!,
        b = mesh[row * 5 + col + 1]!
      const c = mesh[(row + 1) * 5 + col]!,
        d = mesh[(row + 1) * 5 + col + 1]!
      const u = Math.max(
        0,
        Math.min(
          source.width - 1,
          (a.x * (1 - fx) + b.x * fx) * (1 - fy) +
            (c.x * (1 - fx) + d.x * fx) * fy -
            0.5
        )
      )
      const v = Math.max(
        0,
        Math.min(
          source.height - 1,
          (a.y * (1 - fx) + b.y * fx) * (1 - fy) +
            (c.y * (1 - fx) + d.y * fx) * fy -
            0.5
        )
      )
      const x0 = Math.floor(u),
        y0 = Math.floor(v),
        dx = u - x0,
        dy = v - y0
      const p = (y0 * source.width + x0) * 4
      const q = (y0 * source.width + Math.min(x0 + 1, source.width - 1)) * 4
      const r = (Math.min(y0 + 1, source.height - 1) * source.width + x0) * 4
      const s =
        (Math.min(y0 + 1, source.height - 1) * source.width +
          Math.min(x0 + 1, source.width - 1)) *
        4
      const wa = (1 - dx) * (1 - dy) * input[p + 3]!
      const wb = dx * (1 - dy) * input[q + 3]!
      const wc = (1 - dx) * dy * input[r + 3]!
      const wd = dx * dy * input[s + 3]!
      const alpha = wa + wb + wc + wd,
        offset = (y * target.width + x) * 4
      for (let channel = 0; channel < 3; channel++)
        output[offset + channel] = alpha
          ? Math.round(
              (input[p + channel]! * wa +
                input[q + channel]! * wb +
                input[r + channel]! * wc +
                input[s + channel]! * wd) /
                alpha
            )
          : 0
      output[offset + 3] = Math.round(alpha)
    }
  }
}
