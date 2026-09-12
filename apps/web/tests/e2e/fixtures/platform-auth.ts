import {
  platformHttpErrorSchema,
  platformOAuthProvidersResponseSchema,
  platformSessionSchema,
  type PlatformSession,
} from "@imsweb/contracts/platform"
import { platformAuthPath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

export function installPlatformOAuthProvidersMock(
  api: ApiDispatcher,
  times: ApiTimes = 1
) {
  api.expect({
    method: "GET",
    path: platformAuthPath("/oauth/providers"),
    responses: { 200: platformOAuthProvidersResponseSchema },
    times,
    handle: () => ({
      status: 200,
      json: { success: true, providers: [] },
    }),
  })
}

export function installPlatformSessionMock(
  api: ApiDispatcher,
  response: PlatformSession | { success: false; code: string },
  options: { status?: 200 | 401; times?: { min: number; max: number } } = {}
) {
  const status = options.status ?? (response.success ? 200 : 401)
  api.expect({
    method: "GET",
    path: platformAuthPath("/session"),
    responses: {
      200: platformSessionSchema,
      401: platformHttpErrorSchema,
    },
    times: options.times,
    handle: () => ({ status, json: response }),
  })
}
