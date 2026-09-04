import { platformAuthPath } from "@imsweb/contracts/paths"
import { createAlova, type Method } from "alova"
import { createServerTokenAuthentication } from "alova/client"
import adapterFetch from "alova/fetch"
import ReactHook from "alova/react"

import { normalizeRequestError } from "./api-error"
import { readCookie } from "./cookies"
import { API_ORIGIN } from "./origin"
import {
  capturePlatformTokens,
  clearPlatformTokens,
  PLATFORM_REFRESH_TOKEN_HEADER,
  readPlatformAccessToken,
  readPlatformRefreshToken,
  usesPlatformBearerAuth,
} from "./platform-token-store"
import { applyApiRequestPolicy, PLATFORM_CSRF_COOKIE_NAME } from "./request"
import { handleApiResponse } from "./response"
import { withPlatformCsrf } from "./types"

const PLATFORM_LOGOUT_PATH = platformAuthPath("/logout")

/**
 * Identifies the session a request was issued under, so a refresh triggered by
 * a stale 401 can tell whether another tab already rotated it. Cookie builds
 * read the CSRF cookie; the packaged client compares its stored access token.
 */
function currentSessionMarker(): string | undefined {
  return usesPlatformBearerAuth
    ? (readPlatformAccessToken() ?? undefined)
    : readCookie(PLATFORM_CSRF_COOKIE_NAME)
}

function refreshRequestHeaders(): Record<string, string> {
  if (!usesPlatformBearerAuth) return {}
  const refreshToken = readPlatformRefreshToken()
  return refreshToken ? { [PLATFORM_REFRESH_TOKEN_HEADER]: refreshToken } : {}
}

// Alova clones Method objects for replays and preserves enumerable symbol fields.
const failedRefreshReplay = Symbol("failed-platform-refresh-replay")
const requestSessionMarkers = new WeakMap<Method, string | undefined>()

function markFailedRefreshReplay(method: Method) {
  const markedMethod = method as { [failedRefreshReplay]?: boolean }
  markedMethod[failedRefreshReplay] = true
}

function consumeFailedRefreshReplay(method: Method) {
  const markedMethod = method as { [failedRefreshReplay]?: boolean }
  const marked = Boolean(markedMethod[failedRefreshReplay])
  if (marked) {
    delete markedMethod[failedRefreshReplay]
  }
  return marked
}

let markRefreshWaveFailed = markFailedRefreshReplay

async function withPlatformRefreshLock(refresh: () => Promise<void>) {
  if (typeof navigator === "undefined" || !navigator.locks) {
    await refresh()
    return
  }
  await navigator.locks.request("imsweb-platform-refresh", refresh)
}

const platformAuthentication = createServerTokenAuthentication<
  typeof ReactHook,
  typeof adapterFetch
>({
  visitorMeta: { authRole: "logout" },
  refreshTokenOnSuccess: {
    isExpired: (response, method) => {
      if (consumeFailedRefreshReplay(method)) {
        return false
      }
      return response.status === 401
    },
    handler: async (_response, method) => {
      const requestSessionMarker = requestSessionMarkers.get(method)
      try {
        await withPlatformRefreshLock(async () => {
          // Another tab may have rotated the session while this request was in flight.
          if (currentSessionMarker() !== requestSessionMarker) {
            return
          }
          await method.context.Post(platformAuthPath("/refresh"), undefined, {
            meta: withPlatformCsrf({ authRole: "refreshToken" }),
            headers: refreshRequestHeaders(),
          })
        })
      } catch {
        // A refused refresh means the stored tokens are spent; keeping them
        // would replay a dead session on every later request.
        clearPlatformTokens()
        markRefreshWaveFailed(method)
      }
    },
  },
})

const { onAuthRequired, onResponseRefreshToken, waitingList } =
  platformAuthentication

markRefreshWaveFailed = (method) => {
  markFailedRefreshReplay(method)
  for (const waiter of waitingList) {
    markFailedRefreshReplay(waiter.method)
  }
}

export const platformApiClient = createAlova({
  baseURL: API_ORIGIN,
  statesHook: ReactHook,
  requestAdapter: adapterFetch(),
  cacheFor: null,
  beforeRequest: onAuthRequired((method) => {
    requestSessionMarkers.set(method, currentSessionMarker())
    applyApiRequestPolicy(method, {
      authRealm: "platform",
      csrfCookieName: PLATFORM_CSRF_COOKIE_NAME,
    })
  }),
  responded: onResponseRefreshToken({
    onSuccess: async (response, method) => {
      const payload = await handleApiResponse(response, {
        method: method.type,
        url: method.url,
        meta: method.meta,
      })
      if (usesPlatformBearerAuth) {
        if (method.url === PLATFORM_LOGOUT_PATH) {
          clearPlatformTokens()
        } else {
          capturePlatformTokens(payload)
        }
      }
      return payload
    },
    onError: (error, method) => {
      consumeFailedRefreshReplay(method)
      throw normalizeRequestError(error, {
        method: method.type,
        url: method.url,
        meta: method.meta,
      })
    },
  }),
})
