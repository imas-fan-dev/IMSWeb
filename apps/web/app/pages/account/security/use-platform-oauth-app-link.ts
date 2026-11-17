import { useCallback, useEffect, useRef, useState } from "react"

import { usePlatformSession } from "~/components/platform/platform-session-provider"
import {
  API_ORIGIN,
  exchangePlatformOAuthSession,
  isApiError,
  startPlatformOAuthLinkApp,
} from "~/lib/api"
import { openSystemUrl } from "~/lib/navigation/system-opener"
import {
  clearPlatformOAuthAppVerifier,
  createPlatformOAuthPkcePair,
  readPlatformOAuthAppVerifier,
  writePlatformOAuthAppVerifier,
} from "~/lib/platform-oauth-app-verifier"
import {
  subscribePlatformOAuthPayload,
  type PlatformOAuthCallbackPayload,
} from "~/lib/platform-oauth-deep-link"

import {
  oauthLinkReasonKey,
  type PlatformOAuthLinkReasonKey,
} from "./account-security-model"

/**
 * Drives the packaged App's OAuth link (bind) round trip.
 *
 * The flow mirrors the App login channel: the provider page opens in the system
 * browser, the API callback mints a one-time code, and a `flow=link` deep link
 * hands that code back. The Web counterpart cannot use this path — it navigates
 * the whole document to the API's `/start`, which the app cannot do because a
 * document navigation carries no bearer session.
 */

export interface PlatformOAuthAppLinkResult {
  key: PlatformOAuthLinkReasonKey
  success: boolean
}

export interface PlatformOAuthAppLink {
  waiting: boolean
  /** The provider code of the round trip in flight or just finished. */
  activeProvider: string | null
  /** The outcome to render, or null while idle. */
  result: PlatformOAuthAppLinkResult | null
  start: (providerCode: string) => Promise<void>
  cancel: () => void
}

/** How long the App waits for the user to finish authorizing before giving up. */
const OAUTH_APP_LINK_TTL_MS = 5 * 60_000

const LINKED_KEY = "platformAccount.security.oauth.linked"
const LINK_EXPIRED_KEY = "platformAccount.security.oauth.linkExpired"
const LINK_FAILED_KEY = "platformAccount.security.oauth.linkFailed"
const LINK_UNAVAILABLE_KEY = "platformAccount.security.oauth.linkUnavailable"

function resultFor(
  key: PlatformOAuthLinkReasonKey
): PlatformOAuthAppLinkResult {
  return { key, success: key === LINKED_KEY }
}

/** Maps the API's exchange errors onto an existing account-security key. */
function exchangeErrorKey(error: unknown): PlatformOAuthLinkReasonKey {
  if (isApiError(error) && error.kind === "http" && error.status === 401) {
    return error.code === "PLATFORM_OAUTH_EXCHANGE_EXPIRED"
      ? LINK_EXPIRED_KEY
      : LINK_FAILED_KEY
  }
  return LINK_FAILED_KEY
}

/** Maps a start failure: an unavailable provider is its own, actionable reason. */
function startErrorKey(error: unknown): PlatformOAuthLinkReasonKey {
  if (
    isApiError(error) &&
    error.status === 404 &&
    error.code === "PLATFORM_OAUTH_LINK_UNAVAILABLE"
  ) {
    return LINK_UNAVAILABLE_KEY
  }
  return LINK_FAILED_KEY
}

export function usePlatformOAuthAppLink(
  onLinked?: () => void
): PlatformOAuthAppLink {
  const { acceptSession } = usePlatformSession()
  const [waiting, setWaiting] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [result, setResult] = useState<PlatformOAuthAppLinkResult | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const handlingRef = useRef(false)
  const startingRef = useRef(false)
  const mountedRef = useRef(true)
  const linkedRef = useRef(onLinked)
  const completeRef = useRef<(code: string) => void>(() => undefined)
  const failRef = useRef<(key: PlatformOAuthLinkReasonKey) => void>(
    () => undefined
  )

  useEffect(() => {
    linkedRef.current = onLinked
  }, [onLinked])

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  /**
   * End the round trip: stop the timer, drop the one-time verifier, and report
   * the outcome. Both success and failure funnel through here so the verifier
   * can never be left behind for the next attempt to reuse.
   */
  const settle = useCallback(
    (key: PlatformOAuthLinkReasonKey | null) => {
      clearTimer()
      clearPlatformOAuthAppVerifier("link")
      handlingRef.current = false
      startingRef.current = false
      setWaiting(false)
      setResult(key ? resultFor(key) : null)
    },
    [clearTimer]
  )

  const complete = useCallback(
    async (code: string) => {
      if (handlingRef.current) return
      handlingRef.current = true
      const verifier = readPlatformOAuthAppVerifier("link")
      if (!verifier) {
        settle(LINK_EXPIRED_KEY)
        return
      }
      try {
        const session = await exchangePlatformOAuthSession({
          code,
          codeVerifier: verifier,
        }).send()
        if (!mountedRef.current) return
        acceptSession(session)
        linkedRef.current?.()
        settle(LINKED_KEY)
      } catch (error) {
        if (!mountedRef.current) return
        settle(exchangeErrorKey(error))
      }
    },
    [acceptSession, settle]
  )

  useEffect(() => {
    completeRef.current = (code) => void complete(code)
    failRef.current = (key) => settle(key)
  }, [complete, settle])

  useEffect(() => {
    mountedRef.current = true
    // Only the link flow: the login hook owns the plain callback and the two
    // must never redeem each other's one-time codes.
    const unsubscribe = subscribePlatformOAuthPayload(
      (payload: PlatformOAuthCallbackPayload) => {
        if (!mountedRef.current) return
        if (payload.code) {
          completeRef.current(payload.code)
          return
        }
        if (payload.error) {
          failRef.current(oauthLinkReasonKey(payload.error) ?? LINK_FAILED_KEY)
        }
      },
      "link"
    )
    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const start = useCallback(
    async (providerCode: string) => {
      if (!API_ORIGIN) {
        setWaiting(false)
        setResult(resultFor(LINK_UNAVAILABLE_KEY))
        return
      }
      // Two overlapping round trips would fight over the single stored
      // verifier: the second `write` wins, so the first code comes back
      // unredeemable and the user sees a failure for a link that may have
      // succeeded. The waiting panel hides the buttons, but only once the
      // provider URL returns, so the guard has to start before the awaits.
      if (startingRef.current) return
      startingRef.current = true
      setResult(null)
      try {
        const { verifier, challenge } = await createPlatformOAuthPkcePair()
        writePlatformOAuthAppVerifier("link", verifier)
        const response = await startPlatformOAuthLinkApp({
          provider: providerCode,
          codeChallenge: challenge,
        }).send()
        await openSystemUrl(response.authorizationUrl)
        if (!mountedRef.current) return
        handlingRef.current = false
        setActiveProvider(providerCode)
        setWaiting(true)
        clearTimer()
        timeoutRef.current = window.setTimeout(() => {
          failRef.current(LINK_EXPIRED_KEY)
        }, OAUTH_APP_LINK_TTL_MS)
      } catch (error) {
        if (!mountedRef.current) return
        settle(startErrorKey(error))
      }
    },
    [clearTimer, settle]
  )

  const cancel = useCallback(() => {
    clearTimer()
    clearPlatformOAuthAppVerifier("link")
    handlingRef.current = false
    startingRef.current = false
    setWaiting(false)
    setActiveProvider(null)
    setResult(null)
  }, [clearTimer])

  return { waiting, activeProvider, result, start, cancel }
}
