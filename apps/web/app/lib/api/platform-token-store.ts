import { isCrossOriginApi } from "./origin"

/**
 * Token custody for the packaged client.
 *
 * A WebView that loads the bundle from `tauri://localhost` has no shared
 * cookie jar with the API origin, so the session cookies the API sets are
 * dropped and CSRF double-submit has nothing to read. The API therefore hands
 * the tokens to callers that ask for them explicitly, and this module keeps
 * them.
 *
 * Browser builds never reach this path: `isCrossOriginApi` is false there, the
 * access token stays httpOnly, and no page script can read it.
 */
export const usesPlatformBearerAuth = isCrossOriginApi

export const PLATFORM_AUTH_MODE_HEADER = "X-IMS-Auth-Mode"
export const PLATFORM_AUTH_MODE_BEARER = "bearer"
export const PLATFORM_REFRESH_TOKEN_HEADER = "X-IMS-Refresh-Token"

const ACCESS_TOKEN_KEY = "ims.platform.access-token"
const REFRESH_TOKEN_KEY = "ims.platform.refresh-token"

// Mirrors the persisted values so a WebView that denies storage (private mode,
// a locked-down profile) still keeps a session for as long as the app runs.
let memoryAccessToken: string | null = null
let memoryRefreshToken: string | null = null

function tokenStorage(): Storage | null {
  if (!usesPlatformBearerAuth || typeof window === "undefined") {
    return null
  }
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readStored(key: string): string | null {
  try {
    return tokenStorage()?.getItem(key) || null
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null): void {
  const storage = tokenStorage()
  if (!storage) return
  try {
    if (value) {
      storage.setItem(key, value)
    } else {
      storage.removeItem(key)
    }
  } catch {
    // Storage quota or a hardened WebView; the in-memory mirror still holds.
  }
}

export function readPlatformAccessToken(): string | null {
  if (!usesPlatformBearerAuth) return null
  memoryAccessToken ??= readStored(ACCESS_TOKEN_KEY)
  return memoryAccessToken
}

export function readPlatformRefreshToken(): string | null {
  if (!usesPlatformBearerAuth) return null
  memoryRefreshToken ??= readStored(REFRESH_TOKEN_KEY)
  return memoryRefreshToken
}

export function storePlatformTokens(tokens: {
  accessToken?: string | null
  refreshToken?: string | null
}): void {
  if (!usesPlatformBearerAuth) return
  if (tokens.accessToken) {
    memoryAccessToken = tokens.accessToken
    writeStored(ACCESS_TOKEN_KEY, tokens.accessToken)
  }
  if (tokens.refreshToken) {
    memoryRefreshToken = tokens.refreshToken
    writeStored(REFRESH_TOKEN_KEY, tokens.refreshToken)
  }
}

export function clearPlatformTokens(): void {
  memoryAccessToken = null
  memoryRefreshToken = null
  writeStored(ACCESS_TOKEN_KEY, null)
  writeStored(REFRESH_TOKEN_KEY, null)
}

/**
 * Picks up the tokens that login, registration and refresh return to bearer
 * callers. Responses for browser builds carry no such fields, so this is a
 * no-op there.
 */
export function capturePlatformTokens(payload: unknown): void {
  if (!usesPlatformBearerAuth) return
  if (typeof payload !== "object" || payload === null) return
  const { accessToken, refreshToken } = payload as {
    accessToken?: unknown
    refreshToken?: unknown
  }
  storePlatformTokens({
    accessToken: typeof accessToken === "string" ? accessToken : null,
    refreshToken: typeof refreshToken === "string" ? refreshToken : null,
  })
}

/** True when a stored token makes a session restore worth attempting. */
export function hasStoredPlatformSession(): boolean {
  return Boolean(readPlatformAccessToken() || readPlatformRefreshToken())
}
