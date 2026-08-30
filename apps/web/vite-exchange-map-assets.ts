import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { extname, resolve, sep } from "node:path"

import type { Plugin } from "vite"

const exchangeMapPrefix = "/maps/exchange/"
export const TAURI_MAP_ORIGINS = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
] as const
const tauriMapOrigins: ReadonlySet<string> = new Set(TAURI_MAP_ORIGINS)
const exchangeMapMimeTypes: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".pbf": "application/x-protobuf",
  ".pmtiles": "application/vnd.pmtiles",
  ".png": "image/png",
}

export function parseByteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null

  const requestedStart = match[1] ? Number(match[1]) : undefined
  const requestedEnd = match[2] ? Number(match[2]) : undefined
  if (
    (requestedStart !== undefined && !Number.isSafeInteger(requestedStart)) ||
    (requestedEnd !== undefined && !Number.isSafeInteger(requestedEnd))
  ) {
    return null
  }

  if (requestedStart === undefined) {
    if (!requestedEnd || size <= 0) return null
    return {
      start: Math.max(0, size - Math.min(requestedEnd, size)),
      end: size - 1,
    }
  }

  const end = Math.min(requestedEnd ?? size - 1, size - 1)
  if (requestedStart < 0 || requestedStart > end || requestedStart >= size) {
    return null
  }
  return { start: requestedStart, end }
}

export function resolveExchangeMapAssetPath(
  relativePath: string,
  exchangeMapRoot: string
) {
  const assetPath = resolve(exchangeMapRoot, relativePath)
  return assetPath.startsWith(`${exchangeMapRoot}${sep}`)
    ? assetPath
    : undefined
}

export function tauriMapAssetCorsOrigin(origin: string | undefined) {
  return origin && tauriMapOrigins.has(origin) ? origin : undefined
}

/** 仅开发服务器启用；生产由宿主机 Nginx 提供同一个只读 URL 合同。 */
export function localExchangeMapAssets(workspaceRoot: string): Plugin {
  const exchangeMapRoot = resolve(workspaceRoot, "data/maps/current")
  return {
    name: "imsweb-local-exchange-map-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost")
          .pathname
        if (!pathname.startsWith(exchangeMapPrefix)) {
          next()
          return
        }
        if (!request.method || !["GET", "HEAD"].includes(request.method)) {
          response.statusCode = 405
          response.setHeader("Allow", "GET, HEAD")
          response.end()
          return
        }

        let relativePath: string
        try {
          relativePath = decodeURIComponent(
            pathname.slice(exchangeMapPrefix.length)
          )
        } catch {
          response.statusCode = 400
          response.end("Malformed map asset path")
          return
        }
        const assetPath = resolveExchangeMapAssetPath(
          relativePath,
          exchangeMapRoot
        )
        if (!assetPath) {
          response.statusCode = 403
          response.end()
          return
        }

        let assetStat
        try {
          assetStat = await stat(assetPath)
        } catch {
          response.statusCode = 404
          response.end(
            "Local map data is unavailable. Run node scripts/maps/prepare-exchange-map.mjs --apply --activate."
          )
          return
        }
        if (!assetStat.isFile()) {
          response.statusCode = 404
          response.end()
          return
        }

        const tauriOrigin = tauriMapAssetCorsOrigin(request.headers.origin)
        if (tauriOrigin) {
          response.setHeader("Access-Control-Allow-Origin", tauriOrigin)
          response.setHeader("Vary", "Origin")
        }

        const rangeHeader = request.headers.range
        const range = rangeHeader
          ? parseByteRange(rangeHeader, assetStat.size)
          : undefined
        if (rangeHeader && !range) {
          response.statusCode = 416
          response.setHeader("Content-Range", `bytes */${assetStat.size}`)
          response.end()
          return
        }

        const start = range?.start ?? 0
        const end = range?.end ?? assetStat.size - 1
        response.statusCode = range ? 206 : 200
        response.setHeader("Accept-Ranges", "bytes")
        response.setHeader("Cache-Control", "no-store")
        response.setHeader(
          "Content-Type",
          exchangeMapMimeTypes[extname(assetPath)] ?? "application/octet-stream"
        )
        response.setHeader("Content-Length", String(end - start + 1))
        response.setHeader("X-Content-Type-Options", "nosniff")
        if (range) {
          response.setHeader(
            "Content-Range",
            `bytes ${start}-${end}/${assetStat.size}`
          )
        }
        if (request.method === "HEAD") {
          response.end()
          return
        }
        const stream = createReadStream(assetPath, { start, end })
        stream.on("error", (error) => response.destroy(error))
        stream.pipe(response)
      })
    },
  }
}
