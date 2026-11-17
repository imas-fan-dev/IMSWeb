import { readFileSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import { parseEnv } from "node:util"
import type { Plugin } from "vite"

interface AMapProxyCredentials {
  apiKey: string
  securityJsCode: string
}

const prefix = "/_AMapService/"

function isJsonpResponse(callbacks: string[], body: Buffer): boolean {
  const [callback] = callbacks
  if (
    callbacks.length !== 1 ||
    !callback ||
    !/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(callback)
  )
    return false
  const text = body.toString("utf8").trim()
  const closing = text.endsWith(");") ? 2 : text.endsWith(")") ? 1 : 0
  if (!closing || !text.startsWith(`${callback}(`)) return false
  try {
    JSON.parse(text.slice(callback.length + 1, -closing))
    return true
  } catch {
    return false
  }
}

/** Read only this local, server-owned credential pair; never export to Vite env. */
export function readLocalAMapCredentials(
  webRoot: string
): AMapProxyCredentials | null {
  try {
    const values = parseEnv(
      readFileSync(resolve(webRoot, ".env.local"), "utf8")
    )
    const apiKey = values.IMS_DEV_AMAP_JS_API_KEY?.trim() ?? ""
    const securityJsCode = values.IMS_DEV_AMAP_SECURITY_JS_CODE?.trim() ?? ""
    return /^[a-f0-9]{32}$/i.test(apiKey) &&
      /^[a-f0-9]{32}$/i.test(securityJsCode)
      ? { apiKey, securityJsCode }
      : null
  } catch {
    return null
  }
}

export function createAMapServiceProxy(
  credentials: () => AMapProxyCredentials | null,
  transport: typeof fetch = fetch
) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    const respond = (status: number, message: string) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      })
      res.end(message)
    }
    const url = URL.parse(req.url ?? "/", "http://localhost")
    if (!url) return respond(400, "Invalid request URL")
    if (!url.pathname.startsWith(prefix)) return next()
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET")
      return respond(405, "Only GET is supported")
    }
    const configuration = credentials()
    if (!configuration)
      return respond(
        503,
        "Local AMap proxy credentials are missing; configure apps/web/.env.local"
      )
    const keys = url.searchParams.getAll("key")
    if (
      // The SDK repeats common query parameters in coordinate requests.
      keys.length === 0 ||
      keys.some((key) => key !== configuration.apiKey) ||
      [...url.searchParams.keys()].some((key) => key.toLowerCase() === "jscode")
    )
      return respond(403, "AMap proxy request rejected")

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const disconnect = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.once("close", disconnect)
    void (async () => {
      try {
        const upstreamPath = url.pathname.slice(prefix.length - 1)
        const upstream = new URL(
          upstreamPath.startsWith("/v4/map/styles")
            ? "https://webapi.amap.com"
            : "https://restapi.amap.com"
        )
        upstream.pathname = upstreamPath
        upstream.search = url.search
        upstream.searchParams.set("jscode", configuration.securityJsCode)
        const response = await transport(upstream, {
          signal: controller.signal,
          redirect: "manual",
        })
        // A redirect could disclose the server-only query credentials.
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel()
          return respond(502, "AMap upstream redirect rejected")
        }
        const body = Buffer.from(await response.arrayBuffer())
        if (res.destroyed) return
        res.writeHead(response.status, {
          "Content-Type": isJsonpResponse(
            url.searchParams.getAll("callback"),
            body
          )
            ? "application/javascript; charset=utf-8"
            : (response.headers.get("content-type") ??
              "application/octet-stream"),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        })
        res.end(body)
      } catch {
        if (!res.destroyed) respond(502, "AMap upstream is unavailable")
      } finally {
        clearTimeout(timer)
        res.off("close", disconnect)
      }
    })()
  }
}

export function localAMapServiceProxy(webRoot: string): Plugin {
  return {
    name: "imsweb-local-amap-service-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        createAMapServiceProxy(() => readLocalAMapCredentials(webRoot))
      )
    },
  }
}
