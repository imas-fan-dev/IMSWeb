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
  `^${ownerMediaPrefix}([^/]+)/media/(front|back)$`
)

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
      (url.search && !/^\?v=\d+$/.test(url.search)) ||
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
