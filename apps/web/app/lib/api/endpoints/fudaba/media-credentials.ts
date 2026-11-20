import { fudabaErrorResponseSchema } from "@imsweb/contracts/fudaba"

import { platformApiClient } from "../../platform-client"
import { usesPlatformBearerAuth } from "../../platform-token-store"

/**
 * 凭据作用的媒体路由：属主编辑器（`/me/cards/…`）与交换墙收藏者的已下线卡
 * （`/community/exchange/cards/…`）。两者的槽位与查询形状由同一条服务端构造器
 * 产出（`cardPageMediaUrl`），所以校验规则也只写一份。
 *
 * 只有落在这里的地址才会带上平台 Bearer；公开可读的图继续用普通 `<img>`，
 * 保留浏览器缓存。
 */
const MEDIA_WIDTHS = new Set(["160", "400", "800", "1400"])
const MEDIA_VERSION =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function isMediaSearch(search: string): boolean {
  // 服务端只生成裸值；百分号编码只可能来自手写或篡改。
  if (search.includes("%")) return false
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  )
  for (const key of params.keys()) {
    if (key !== "w" && key !== "v" && key !== "draft") return false
    if (params.getAll(key).length !== 1) return false
  }
  const width = params.get("w")
  if (width !== null && !MEDIA_WIDTHS.has(width)) return false
  const version = params.get("v")
  if (version !== null && !MEDIA_VERSION.test(version)) return false
  return params.get("draft") === null || params.get("draft") === "1"
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 返回「把这个前缀下的合法媒体地址收敛成可请求路径」的校验器。
 * 不允许换 origin、凭据、片段或未知查询参数。
 */
export function mediaPathValidator(
  prefix: string
): (source: string, apiOrigin: string) => string | null {
  const path = new RegExp(
    `^${escapeRegExp(prefix)}([^/]+)/media/(front|back|middle-\\d{1,2}|page-[0-9a-f-]{8,})$`
  )
  return (source, apiOrigin) => {
    try {
      const origin = new URL(apiOrigin)
      const url = new URL(source, origin)
      const match = path.exec(url.pathname)
      const id = match ? decodeURIComponent(match[1]) : ""
      if (
        !["http:", "https:"].includes(origin.protocol) ||
        url.origin !== origin.origin ||
        url.username ||
        url.password ||
        url.hash ||
        (url.search && !isMediaSearch(url.search)) ||
        !id ||
        id.length > 128 ||
        /[/\\]/.test(id) ||
        Array.from(id).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        )
      )
        return null
      return `${url.pathname}${url.search}`
    } catch {
      return null
    }
  }
}

export function requiresCredentialedMedia(
  source: string | null,
  resolvePath: (source: string) => string | null
): boolean {
  return Boolean(source && usesPlatformBearerAuth && resolvePath(source))
}

export function getCredentialedMedia(path: string) {
  return platformApiClient.Get<Blob>(path, {
    // Each preview owns cancellation, including StrictMode effect remounts.
    shareRequest: false,
    meta: {
      authRealm: "platform",
      responseType: "blob",
      errorSchema: fudabaErrorResponseSchema,
    },
  })
}
