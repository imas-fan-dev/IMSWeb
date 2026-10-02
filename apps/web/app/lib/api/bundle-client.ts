import { createAlova } from "alova"
import adapterFetch from "alova/fetch"
import ReactHook from "alova/react"

import { normalizeRequestError } from "./api-error"
import { ownedByWebBundle } from "./bundle-assets"
import { handleApiResponse } from "./response"

/**
 * Anything alova can route: the instance baseURL and the per-method path.
 *
 * Structural rather than importing alova's `Method`, so the guard stays usable
 * from any client's `beforeRequest` without threading its generics through.
 */
interface RoutableRequest {
  baseURL: string
  url: string
}

/**
 * Strips the API baseURL off a request for a file the web bundle serves.
 *
 * The three API clients set `baseURL: API_ORIGIN`, which is right for `/api`
 * and for the public media routes Hono owns, and wrong for `/maps`, `/brand`
 * and `/favicon.ico`: those ship inside the frontend bundle. On the website
 * the two live at one origin and the mistake is invisible; a packaged Tauri
 * build serves the bundle from a local scheme and sends the request to the API
 * origin instead, where it 404s.
 *
 * Call this from `beforeRequest`. Alova reads `method.baseURL` *after* the hook
 * resolves (`buildCompletedURL(baseURL, url, params)` in @alova/shared), so
 * clearing it here leaves the path relative and it resolves against the
 * document — which is where the file actually is, on both builds.
 *
 * This is the safety net rather than the intended route. Prefer
 * `bundleAssetClient` at the call site, so the ownership is legible without
 * knowing this hook exists. The net matters because the failure it catches is
 * invisible on the website: a bundle-owned path added to an API client works
 * in every browser test and only 404s once someone packages the app.
 */
export function routeBundleOwnedRequest(request: RoutableRequest): void {
  if (ownedByWebBundle(request.url)) {
    request.baseURL = ""
  }
}

/**
 * Alova client for assets the web bundle serves itself.
 *
 * No baseURL, so a root-relative path reaches the adapter byte-identical and
 * resolves against the document on every build. Shares the API clients'
 * response pipeline, which keeps `parsed()` contract validation, alova's
 * response cache (`cacheFor`) and `ApiError` normalisation — the reason this
 * is an alova instance rather than the plain `fetch` helper that
 * `check-source-rules.mjs` would also permit inside `app/lib/api`.
 *
 * Rejects paths it does not own, so the client cannot be used to *skip* the
 * API origin on a route that needs it.
 */
export const bundleAssetClient = createAlova({
  baseURL: "",
  statesHook: ReactHook,
  requestAdapter: adapterFetch(),
  cacheFor: null,
  beforeRequest: (method) => {
    if (!ownedByWebBundle(method.url)) {
      throw new Error(
        `${method.url} is not served by the web bundle; use the API client so it keeps the API origin`
      )
    }
    // The asset is same-origin with the document by construction, so this
    // never becomes a cross-origin credentialed request.
    method.config.credentials = "same-origin"
  },
  responded: {
    onSuccess: (response, method) =>
      handleApiResponse(response, {
        method: method.type,
        url: method.url,
        meta: method.meta,
      }),
    onError: (error, method) => {
      throw normalizeRequestError(error, {
        method: method.type,
        url: method.url,
        meta: method.meta,
      })
    },
  },
})
