import { createAlova } from "alova"
import adapterFetch from "alova/fetch"
import ReactHook from "alova/react"

import { normalizeRequestError } from "./api-error"
import { routeBundleOwnedRequest } from "./bundle-client"
import { API_ORIGIN } from "./origin"
import { applyApiRequestPolicy } from "./request"
import { handleApiResponse } from "./response"

export const apiClient = createAlova({
  baseURL: API_ORIGIN,
  statesHook: ReactHook,
  requestAdapter: adapterFetch(),
  cacheFor: null,
  beforeRequest: (method) => {
    // Net for a bundle-owned path that reached the API client by mistake. The
    // admin and platform clients need no equivalent: they only ever address
    // `/api/admin` and `/api/platform`, which the bundle never serves.
    routeBundleOwnedRequest(method)
    applyApiRequestPolicy(method)
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
