import { APP_OAUTH_CALLBACK_URL } from "@imsweb/contracts/paths"
import { isTauri } from "@tauri-apps/api/core"

import { IS_APP_TARGET } from "~/lib/app-target"

/**
 * The app half of the OAuth return channel.
 *
 * The provider only ever redirects to our HTTPS callback; the custom-scheme
 * deep link is minted after that callback by the API. This module owns the
 * contract between the two: matching an incoming URL against
 * `APP_OAUTH_CALLBACK_URL` and turning the Tauri deep-link plugin's callbacks
 * into a single subscription the login page can drive.
 */

export type PlatformOAuthDeepLinkFlow = "login" | "link"

export interface PlatformOAuthCallbackPayload {
  code?: string
  error?: string
  /** Present only on link round trips; a missing key means `login`. */
  flow?: "link"
}

/**
 * Strict match against the shared callback URL: scheme, host and path must all
 * agree. Anything else — including a scheme with the same name but a different
 * path — is not ours and returns `null`.
 *
 * The `flow` key is only added when the callback says so. The web login route
 * leaves it out, and callers assert the payload byte-for-byte.
 */
export function parsePlatformOAuthCallbackUrl(
  value: string
): PlatformOAuthCallbackPayload | null {
  let url: URL
  let expected: URL
  try {
    url = new URL(value)
    expected = new URL(APP_OAUTH_CALLBACK_URL)
  } catch {
    return null
  }
  if (
    url.protocol !== expected.protocol ||
    url.host !== expected.host ||
    url.pathname !== expected.pathname
  ) {
    return null
  }
  const flow = url.searchParams.get("flow") === "link" ? "link" : undefined
  const code = url.searchParams.get("code")
  if (code) return flow ? { code, flow } : { code }
  const error = url.searchParams.get("error")
  if (error) return flow ? { error, flow } : { error }
  return null
}

export type PlatformOAuthDeepLinkHandler = (
  payload: PlatformOAuthCallbackPayload
) => void

/** False in the browser, on desktop, and in App-target Playwright. */
function usesPlatformDeepLink(): boolean {
  return IS_APP_TARGET && typeof window !== "undefined" && isTauri()
}

/**
 * Subscribe to the app's OAuth deep link. `getCurrent()` covers a cold start
 * (the OS launched the app with the callback URL) and `onOpenUrl` covers a
 * warm return. Resolves to an unsubscribe function; outside a real Tauri
 * runtime it is a no-op.
 */
export async function subscribePlatformOAuthCallback(
  handler: PlatformOAuthDeepLinkHandler
): Promise<() => void> {
  if (!usesPlatformDeepLink()) return () => undefined

  const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link")
  const deliver = (urls: string[] | null | undefined) => {
    for (const url of urls ?? []) {
      const payload = parsePlatformOAuthCallbackUrl(url)
      if (payload) handler(payload)
    }
  }

  const listening = onOpenUrl((urls) => deliver(urls))
  try {
    deliver(await getCurrent())
  } catch {
    // A cold start with no launch URL is the normal case; keep listening.
  }

  return () => {
    void listening.then((unlisten) => unlisten()).catch(() => undefined)
  }
}

/**
 * App-wide delivery, above any single screen.
 *
 * The OS can deliver the callback before the sign-in screen exists. It may even
 * have reclaimed the app process while the user was authorizing in the system
 * browser, in which case the app cold-starts on whatever route it was launched
 * with — and the callback arrives while nobody is listening. A subscription
 * owned by the sign-in screen misses that case, and one owned by a component
 * that renders only once providers load misses it whenever that fetch fails.
 * Both are the same mistake: the callback belongs to the app, not to a screen.
 *
 * Delivery therefore starts once, at the shell, and a payload that lands with no
 * listener is held until a listener takes it.
 */
let deliveryStarted = false
/** One held payload per flow: the login and link callbacks never coalesce. */
const pendingPayloads: Record<
  PlatformOAuthDeepLinkFlow,
  PlatformOAuthCallbackPayload | null
> = { login: null, link: null }
const payloadListeners: Record<
  PlatformOAuthDeepLinkFlow,
  Set<PlatformOAuthDeepLinkHandler>
> = { login: new Set(), link: new Set() }

/** A payload with no `flow` key is a login callback. */
function platformOAuthPayloadFlow(
  payload: PlatformOAuthCallbackPayload
): PlatformOAuthDeepLinkFlow {
  return payload.flow === "link" ? "link" : "login"
}

/**
 * Begin delivering callbacks. Idempotent, because a second subscription would
 * hand the same one-time code to two consumers and burn it for whichever lost
 * the race.
 *
 * `onUnclaimed` runs when a callback arrives with nothing listening: the cold
 * start, where the app sits on an unrelated route and the user has to be sent
 * somewhere that can finish the round trip. The payload is handed over so the
 * caller can route by flow.
 */
export function startPlatformOAuthDeepLink(
  onUnclaimed?: (payload: PlatformOAuthCallbackPayload) => void
): void {
  if (deliveryStarted) return
  deliveryStarted = true
  void subscribePlatformOAuthCallback((payload) => {
    const flow = platformOAuthPayloadFlow(payload)
    if (payloadListeners[flow].size === 0) {
      pendingPayloads[flow] = payload
      onUnclaimed?.(payload)
      return
    }
    deliverToListeners(flow, payload)
  })
}

function deliverToListeners(
  flow: PlatformOAuthDeepLinkFlow,
  payload: PlatformOAuthCallbackPayload
): void {
  for (const listener of [...payloadListeners[flow]]) listener(payload)
}

/**
 * Receive callbacks for one flow, including one that arrived before this
 * listener existed. Resolves to an unsubscribe function.
 *
 * A payload is handed over exactly once and to the first matching listener: it
 * carries a one-time code, so a second receiver would turn a successful round
 * trip into a spurious failure. A listener that mounts while a payload is
 * waiting therefore drains it immediately, synchronously, before this returns.
 */
export function subscribePlatformOAuthPayload(
  handler: PlatformOAuthDeepLinkHandler,
  flow: PlatformOAuthDeepLinkFlow = "login"
): () => void {
  payloadListeners[flow].add(handler)
  const buffered = pendingPayloads[flow]
  if (buffered) {
    pendingPayloads[flow] = null
    handler(buffered)
  }
  return () => {
    payloadListeners[flow].delete(handler)
  }
}
