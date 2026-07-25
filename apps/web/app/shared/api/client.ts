import { createAlova } from "alova"
import { createServerTokenAuthentication } from "alova/client"
import adapterFetch from "alova/fetch"
import ReactHook from "alova/react"

import { normalizeRequestError } from "./api-error"
import { applyApiRequestPolicy } from "./request"
import { handleApiResponse } from "./response"
import { withCsrf } from "./types"

const { onAuthRequired, onResponseRefreshToken } =
  createServerTokenAuthentication<typeof ReactHook, typeof adapterFetch>({
    refreshTokenOnSuccess: {
      isExpired: (response) => response.status === 401,
      handler: async (_response, method) => {
        await method.context.Post("/api/refresh", undefined, {
          meta: withCsrf({ authRole: "refreshToken" }),
        })
      },
    },
  })

export const apiClient = createAlova({
  statesHook: ReactHook,
  requestAdapter: adapterFetch(),
  cacheFor: null,
  beforeRequest: onAuthRequired((method) => {
    applyApiRequestPolicy(method)
  }),
  responded: onResponseRefreshToken({
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
  }),
})
