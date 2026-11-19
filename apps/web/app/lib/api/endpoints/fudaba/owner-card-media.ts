import { fudabaErrorResponseSchema } from "@imsweb/contracts/fudaba"
import { exchangePath } from "@imsweb/contracts/paths"

import { API_ORIGIN } from "../../origin"
import { platformApiClient } from "../../platform-client"
import { usesPlatformBearerAuth } from "../../platform-token-store"

const ownerMediaPrefix = exchangePath("me/cards/").replace(
  /[.*+?^${}()|[\]\\]/g,
  "\\$&"
)
const ownerMediaPath = new RegExp(
  `^${ownerMediaPrefix}([^/]+)/media/(front|back|middle-\\d{1,2}|page-[0-9a-f-]{8,})$`
)

/**
 * 服务端（`cardPageMediaUrl`）给页级媒体拼的查询串：`w` 档位、对象版本（修订号
 * 或 uuid），待审页再加 `draft=1`。这里逐项白名单，顺序无关，但每项只能出现一次。
 */
const OWNER_MEDIA_WIDTHS = new Set(["160", "400", "800", "1400"])
const OWNER_MEDIA_VERSION =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function isOwnerMediaSearch(search: string): boolean {
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
  if (width !== null && !OWNER_MEDIA_WIDTHS.has(width)) return false
  const version = params.get("v")
  if (version !== null && !OWNER_MEDIA_VERSION.test(version)) return false
  return params.get("draft") === null || params.get("draft") === "1"
}

/** Only these API-owned routes may receive platform credentials. */
export function ownerCardMediaPath(
  source: string,
  apiOrigin: string
): string | null {
  try {
    const origin = new URL(apiOrigin)
    const url = new URL(source, origin)
    const match = ownerMediaPath.exec(url.pathname)
    const id = match ? decodeURIComponent(match[1]) : ""
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      url.hash ||
      (url.search && !isOwnerMediaSearch(url.search)) ||
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

export function getOwnerCardMedia(source: string) {
  const path = ownerCardMediaPath(source, API_ORIGIN)
  if (!path) throw new Error("Invalid owner card media URL")
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

export function ownerCardMediaRequiresAuth(source: string | null): boolean {
  return Boolean(
    source && usesPlatformBearerAuth && ownerCardMediaPath(source, API_ORIGIN)
  )
}
