import { platformAuthOAuthPath } from "@imsweb/contracts/paths"
import { useCallback, useEffect, useRef, useState } from "react"

import { API_ORIGIN, exchangePlatformOAuthSession, isApiError } from "~/lib/api"
import { useNavigation } from "~/lib/navigation/use-navigation"
import { openSystemUrl } from "~/lib/navigation/system-opener"
import {
  clearPlatformOAuthAppVerifier,
  createPlatformOAuthPkcePair,
  readPlatformOAuthAppVerifier,
  writePlatformOAuthAppVerifier,
} from "~/lib/platform-oauth-app-verifier"
import { subscribePlatformOAuthPayload } from "~/lib/platform-oauth-deep-link"
import { usePlatformSession } from "~/components/platform/platform-session-provider"

/**
 * Drives the packaged App's OAuth login.
 *
 * The flow leaves the WebView entirely: the provider page opens in the system
 * browser, the API callback mints a one-time code, and a custom-scheme deep
 * link hands that code back to the app. Only this module ever sees the PKCE
 * verifier, which is why an app that merely claims the same scheme still
 * cannot redeem the code.
 */

export type PlatformOAuthAppStatus = "idle" | "waiting" | "error"

/** The restricted set of existing translation keys the app flow may show. */
export type PlatformOAuthAppErrorKey =
  | "platformAuth.oauth.denied"
  | "platformAuth.oauth.expired"
  | "platformAuth.oauth.unavailable"
  | "platformAuth.oauth.failed"

const OAUTH_APP_CODE_TTL_MS = 5 * 60_000
const OAUTH_APP_RETURN_PATH = "/account/me"

export interface PlatformOAuthAppLogin {
  status: PlatformOAuthAppStatus
  errorKey: PlatformOAuthAppErrorKey | null
  activeProvider: string | null
  start: (providerCode: string) => Promise<void>
  cancel: () => void
}

/** Maps the API's exchange errors onto an existing `platformAuth.oauth` key. */
function exchangeErrorKey(error: unknown): PlatformOAuthAppErrorKey {
  if (isApiError(error) && error.kind === "http" && error.status === 401) {
    return error.code === "PLATFORM_OAUTH_EXCHANGE_EXPIRED"
      ? "platformAuth.oauth.expired"
      : "platformAuth.oauth.failed"
  }
  return "platformAuth.oauth.failed"
}

/** Maps a provider reason (`?oauth=` or the deep link's `?error=`) to a message. */
export function platformOAuthReasonKey(
  reason: string
): PlatformOAuthAppErrorKey {
  switch (reason) {
    case "denied":
      return "platformAuth.oauth.denied"
    case "expired":
      return "platformAuth.oauth.expired"
    case "unavailable":
      return "platformAuth.oauth.unavailable"
    default:
      return "platformAuth.oauth.failed"
  }
}

export function usePlatformOAuthAppLogin(): PlatformOAuthAppLogin {
  const { acceptSession } = usePlatformSession()
  const navigate = useNavigation()
  const [status, setStatus] = useState<PlatformOAuthAppStatus>("idle")
  const [errorKey, setErrorKey] = useState<PlatformOAuthAppErrorKey | null>(
    null
  )
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const handlingRef = useRef(false)
  const mountedRef = useRef(true)
  const completeRef = useRef<(code: string) => void>(() => undefined)
  const failRef = useRef<(key: PlatformOAuthAppErrorKey | null) => void>(
    () => undefined
  )

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const forgetVerifier = useCallback(() => {
    clearPlatformOAuthAppVerifier("login")
  }, [])

  const fail = useCallback(
    (key: PlatformOAuthAppErrorKey | null) => {
      clearTimer()
      forgetVerifier()
      handlingRef.current = false
      setActiveProvider(null)
      setStatus(key ? "error" : "idle")
      setErrorKey(key)
    },
    [clearTimer, forgetVerifier]
  )

  const complete = useCallback(
    async (code: string) => {
      if (handlingRef.current) return
      handlingRef.current = true
      const verifier = readPlatformOAuthAppVerifier("login")
      if (!verifier) {
        fail("platformAuth.oauth.expired")
        return
      }
      try {
        const session = await exchangePlatformOAuthSession({
          code,
          codeVerifier: verifier,
        }).send()
        if (!mountedRef.current) return
        clearTimer()
        forgetVerifier()
        acceptSession(session)
        navigate(OAUTH_APP_RETURN_PATH, { replace: true })
      } catch (error) {
        if (!mountedRef.current) return
        fail(exchangeErrorKey(error))
      }
    },
    [acceptSession, clearTimer, fail, forgetVerifier, navigate]
  )

  useEffect(() => {
    completeRef.current = (code) => void complete(code)
    failRef.current = fail
  }, [complete, fail])

  useEffect(() => {
    mountedRef.current = true
    // Synchronous, and it takes a callback the OS delivered before this screen
    // existed — the cold start that used to drop the code on the floor.
    const unsubscribe = subscribePlatformOAuthPayload((payload) => {
      if (!mountedRef.current) return
      if (payload.code) {
        completeRef.current(payload.code)
        return
      }
      if (payload.error) failRef.current(platformOAuthReasonKey(payload.error))
    })
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const start = useCallback(
    async (providerCode: string) => {
      if (!API_ORIGIN) {
        setStatus("error")
        setErrorKey("platformAuth.oauth.unavailable")
        return
      }
      setErrorKey(null)
      try {
        const { verifier, challenge } = await createPlatformOAuthPkcePair()
        writePlatformOAuthAppVerifier("login", verifier)
        const returnPath = encodeURIComponent(OAUTH_APP_RETURN_PATH)
        const startPath = platformAuthOAuthPath(
          `/${encodeURIComponent(providerCode)}/start?client=app&codeChallenge=${challenge}&returnPath=${returnPath}`
        )
        await openSystemUrl(`${API_ORIGIN}${startPath}`)
        if (!mountedRef.current) return
        handlingRef.current = false
        setActiveProvider(providerCode)
        setStatus("waiting")
        clearTimer()
        timeoutRef.current = window.setTimeout(() => {
          failRef.current("platformAuth.oauth.expired")
        }, OAUTH_APP_CODE_TTL_MS)
      } catch {
        fail("platformAuth.oauth.failed")
      }
    },
    [clearTimer, fail]
  )

  const cancel = useCallback(() => fail(null), [fail])

  return { status, errorKey, activeProvider, start, cancel }
}
