import {
  platformHttpErrorSchema,
  platformOAuthExchangeRequestSchema,
  platformSessionSchema,
  type PlatformOAuthExchangeRequest,
} from "@imsweb/contracts/platform"
import { platformAuthOAuthPath } from "@imsweb/contracts/paths"

import { normalizePlatformSession } from "../../media-urls"
import { parsed } from "../../parsed"
import { platformApiClient } from "../../platform-client"
import { withPlatformAuth } from "../../types"

/**
 * Redeem the one-time deep-link code for a bearer session.
 *
 * This is the only Platform endpoint the packaged app calls with an explicit
 * `X-IMS-Auth-Mode: bearer` header. Browser builds never reach it: the app
 * section that starts the flow only renders when `API_ORIGIN` is configured,
 * and a caller without the bearer header is refused with 400.
 *
 * The response interceptor already stores the returned tokens in
 * `platform-token-store`, so callers only have to accept the session.
 */
export function exchangePlatformOAuthSession(
  input: PlatformOAuthExchangeRequest
) {
  const submission = platformOAuthExchangeRequestSchema.parse(input)
  return platformApiClient.Post(
    platformAuthOAuthPath("/exchange"),
    submission,
    parsed(platformSessionSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
      headers: { "X-IMS-Auth-Mode": "bearer" },
      select: normalizePlatformSession,
    })
  )
}
