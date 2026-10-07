/**
 * The PKCE pair and verifier storage shared by the App's OAuth round trips.
 *
 * Login and link are separate flows that can be in flight at the same time, so
 * each gets its own storage key. A verifier is worthless once the API's OAuth
 * state expires, so it is kept for exactly that window rather than forever.
 *
 * `localStorage`, not `sessionStorage`, is what makes a killed process
 * survivable. The OS can reclaim the app while the user authorizes in the
 * system browser, and a WebView session store does not outlive that; the
 * returned code then arrives with no verifier to redeem it and the round trip
 * is silently lost. The verifier never travels through the deep link, so
 * keeping it on disk adds nothing to another app that claims the same scheme.
 */

export type PlatformOAuthAppFlow = "login" | "link"

const VERIFIER_STORAGE_KEYS: Record<PlatformOAuthAppFlow, string> = {
  login: "ims.platform.oauth-app-verifier",
  link: "ims.platform.oauth-app-link-verifier",
}

/**
 * The API's OAuth state lives for ten minutes, and the verifier is worthless
 * once that state is gone — so it is kept for exactly that long.
 */
const OAUTH_APP_VERIFIER_TTL_MS = 10 * 60_000

interface StoredOAuthAppVerifier {
  verifier: string
  expiresAt: number
}

/**
 * The last resort for a WebView that denies storage. It only outlives a single
 * attempt, which is the best a denied origin can do; it is deliberately read
 * only when the storage API itself throws, so a stale entry on disk can never
 * be shadowed by a newer in-memory one.
 */
const verifierMemory = new Map<PlatformOAuthAppFlow, StoredOAuthAppVerifier>()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * A fresh PKCE pair. The verifier never leaves the app process; only its
 * SHA-256 challenge is sent to the API.
 */
export async function createPlatformOAuthPkcePair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) }
}

function readMemory(flow: PlatformOAuthAppFlow): string | null {
  const stored = verifierMemory.get(flow)
  if (!stored) return null
  if (stored.expiresAt <= Date.now()) {
    verifierMemory.delete(flow)
    return null
  }
  return stored.verifier
}

function clearStored(flow: PlatformOAuthAppFlow): void {
  try {
    window.localStorage.removeItem(VERIFIER_STORAGE_KEYS[flow])
  } catch {
    // Nothing to clear.
  }
}

export function writePlatformOAuthAppVerifier(
  flow: PlatformOAuthAppFlow,
  verifier: string
): void {
  const stored: StoredOAuthAppVerifier = {
    verifier,
    expiresAt: Date.now() + OAUTH_APP_VERIFIER_TTL_MS,
  }
  verifierMemory.set(flow, stored)
  try {
    window.localStorage.setItem(
      VERIFIER_STORAGE_KEYS[flow],
      JSON.stringify(stored)
    )
  } catch {
    // A storage-denied WebView still keeps the in-memory copy.
  }
}

export function readPlatformOAuthAppVerifier(
  flow: PlatformOAuthAppFlow
): string | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(VERIFIER_STORAGE_KEYS[flow])
  } catch {
    // Storage denied: only the in-process copy can answer.
    return readMemory(flow)
  }
  if (!raw) return null
  let stored: Partial<StoredOAuthAppVerifier> | null = null
  try {
    stored = JSON.parse(raw) as Partial<StoredOAuthAppVerifier> | null
  } catch {
    // Unparseable: redeem nothing rather than guess.
  }
  if (
    typeof stored?.verifier !== "string" ||
    !stored.verifier ||
    typeof stored.expiresAt !== "number" ||
    stored.expiresAt <= Date.now()
  ) {
    clearStored(flow)
    return null
  }
  return stored.verifier
}

export function clearPlatformOAuthAppVerifier(
  flow: PlatformOAuthAppFlow
): void {
  verifierMemory.delete(flow)
  clearStored(flow)
}
