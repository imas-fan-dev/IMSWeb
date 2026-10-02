import {
  platformHttpErrorSchema,
  platformOAuthProvidersResponseSchema,
  platformSessionSchema,
  type PlatformOAuthProvider,
  type PlatformSession,
} from "@imsweb/contracts/platform"
import { platformAuthPath } from "@imsweb/contracts/paths"

import type { ApiDispatcher, ApiTimes } from "./api-dispatcher"

/**
 * Two enabled providers. Provider codes are free-form in the API, so the
 * fixture deliberately uses one plain code and one dashed code to keep the
 * `^[a-z][a-z0-9-]*$` contract exercised in the rendered button set.
 */
export const platformOAuthProviderFixtures: PlatformOAuthProvider[] = [
  {
    code: "github",
    displayName: "GitHub",
    icon: "github",
    buttonColor: "#24292f",
  },
  {
    code: "ims-sso",
    displayName: "事务所统一登录",
    icon: "key-round",
    buttonColor: "#2463a8",
  },
]

export function installPlatformOAuthProvidersMock(
  api: ApiDispatcher,
  times: ApiTimes = 1,
  providers: PlatformOAuthProvider[] = []
) {
  api.expect({
    method: "GET",
    path: platformAuthPath("/oauth/providers"),
    responses: { 200: platformOAuthProvidersResponseSchema },
    times,
    handle: () => ({
      status: 200,
      json: { success: true, providers },
    }),
  })
}

/**
 * A provider-list read that fails first and succeeds afterwards.
 *
 * The login screen has to keep the OAuth entry recoverable instead of dropping
 * it silently, and the retry has to actually re-issue the read. One registration
 * with a call counter expresses both, because the dispatcher rejects a second
 * registration for the same endpoint.
 */
export function installRecoveringPlatformOAuthProvidersMock(
  api: ApiDispatcher,
  options: { failures?: number; providers?: PlatformOAuthProvider[] } = {}
) {
  const failures = options.failures ?? 1
  const providers = options.providers ?? platformOAuthProviderFixtures
  let calls = 0

  api.expect({
    method: "GET",
    path: platformAuthPath("/oauth/providers"),
    responses: {
      200: platformOAuthProvidersResponseSchema,
      500: platformHttpErrorSchema,
    },
    times: { min: 1, max: failures + 1 },
    handle: () => {
      calls += 1
      if (calls <= failures) {
        return {
          status: 500,
          json: {
            success: false,
            code: "PLATFORM_OAUTH_PROVIDERS_UNAVAILABLE",
          },
        }
      }
      return { status: 200, json: { success: true, providers } }
    },
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
