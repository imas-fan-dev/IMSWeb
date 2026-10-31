import type { FudabaMapProviderConfig } from "@imsweb/contracts/fudaba/map-delivery"
import { MapDisplayError } from "~/lib/maps/map-errors"

type Config = Extract<FudabaMapProviderConfig, { provider: "mapbox" }>

/** Official Static Tiles endpoint. The configured published style owns all labels. */
export function createMapboxRasterSource(
  config: Config,
  signal: AbortSignal,
  pixelRatio: 1 | 2 = 1
) {
  const style = /^mapbox:\/\/styles\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/.exec(
    config.styleUrl
  )
  if (!style)
    throw new MapDisplayError(
      "unsupported-provider",
      "海外地图需要有效的 Mapbox 发布样式。"
    )
  const cache = new Map<string, Promise<Blob>>()
  signal.addEventListener("abort", () => cache.clear(), { once: true })
  return async (x: number, y: number, z: number): Promise<Blob> => {
    signal.throwIfAborted()
    const size = 2 ** z
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(z) ||
      z < 0 ||
      z > 22 ||
      y < 0 ||
      y >= size
    )
      throw new MapDisplayError(
        "unsupported-provider",
        "海外地图瓦片范围无效。"
      )
    x = ((x % size) + size) % size
    const key = `${z}/${x}/${y}`
    let result = cache.get(key)
    if (result) {
      cache.delete(key)
      cache.set(key, result)
      return result
    }
    result = (async () => {
      try {
        const url = new URL(
          `https://api.mapbox.com/styles/v1/${style[1]}/${style[2]}/tiles/256/${key}${pixelRatio === 2 ? "@2x" : ""}`
        )
        url.searchParams.set("access_token", config.accessToken)
        const response = await fetch(url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
          credentials: "omit",
          redirect: "error",
        })
        if (!response.ok)
          throw new MapDisplayError(
            response.status === 401 || response.status === 403
              ? "authorization"
              : "resource",
            response.status === 401 || response.status === 403
              ? "海外地图未获授权，请联系管理员检查 Mapbox Token 和发布样式。"
              : "海外地图瓦片暂不可用，请稍后重试。"
          )
        if (!response.headers.get("content-type")?.startsWith("image/"))
          throw new Error("Unexpected tile content")
        return await response.blob()
      } catch (error) {
        if (signal.aborted)
          throw new DOMException("Map session closed", "AbortError")
        throw error instanceof MapDisplayError
          ? error
          : new MapDisplayError(
              "resource",
              "海外地图瓦片暂不可用，请稍后重试。"
            )
      }
    })()
    const retained = result
    void result.catch(() => {
      if (cache.get(key) === retained) cache.delete(key)
    })
    cache.set(key, result)
    if (cache.size > 64) cache.delete(cache.keys().next().value!)
    return result
  }
}
