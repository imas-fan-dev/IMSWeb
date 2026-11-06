import { platformApiPath } from "@imsweb/contracts/paths"
import {
  platformAccountSecurityErrorSchema,
  platformEmailBindRequestSchema,
  platformEmailBindingResponseSchema,
  platformEmailChangeRequestSchema,
  platformEmailCredentialResponseSchema,
  platformEmailVerificationCodeRequestSchema,
  platformEmailVerificationCodeResponseSchema,
  platformOAuthLinkAppStartRequestSchema,
  platformOAuthLinkAppStartResponseSchema,
  platformOAuthLinkParamsSchema,
} from "@imsweb/contracts/platform/account-security"
import { z } from "@imsweb/contracts/z"

import { parsed } from "../../parsed"
import { platformApiClient } from "../../platform-client"
import { withPlatformAuth, withPlatformCsrf } from "../../types"

/**
 * Account-security endpoints added by the binding channel.
 *
 * This module is imported directly rather than re-exported from the `platform`
 * barrel: the barrel's export lists are wired once all binding channels land,
 * and growing them here would force the sibling channels' typechecks to move in
 * lockstep.
 */

export type PlatformEmailVerificationCodeInput = z.input<
  typeof platformEmailVerificationCodeRequestSchema
>
export type PlatformEmailBindInput = z.input<
  typeof platformEmailBindRequestSchema
>
export type PlatformEmailChangeInput = z.input<
  typeof platformEmailChangeRequestSchema
>

/**
 * The App-side link start input. The provider selects the path segment and the
 * challenge is the body; the two are validated against their own contracts. The
 * type stays Web-local because it is the caller's shape, not a wire body.
 */
export interface PlatformOAuthLinkAppStartInput {
  provider: string
  codeChallenge: string
}

/**
 * The account's current email credential, or null when it has none.
 *
 * `null` is the "link an email" case rather than an error, so the section uses
 * this to pick its binding form without a failed request.
 */
export function getPlatformEmailCredential() {
  return platformApiClient.Get(
    platformApiPath("/me/email"),
    parsed(platformEmailCredentialResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function sendPlatformEmailVerificationCode(
  input: PlatformEmailVerificationCodeInput
) {
  const submission = platformEmailVerificationCodeRequestSchema.parse(input)
  return platformApiClient.Post(
    platformApiPath("/me/email/verification-code"),
    submission,
    parsed(platformEmailVerificationCodeResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function bindPlatformEmail(input: PlatformEmailBindInput) {
  const submission = platformEmailBindRequestSchema.parse(input)
  return platformApiClient.Post(
    platformApiPath("/me/email/bind"),
    submission,
    parsed(platformEmailBindingResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function changePlatformEmail(input: PlatformEmailChangeInput) {
  const submission = platformEmailChangeRequestSchema.parse(input)
  return platformApiClient.Post(
    platformApiPath("/me/email/change"),
    submission,
    parsed(platformEmailBindingResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/**
 * The API URL that starts an OAuth link round trip.
 *
 * It is a plain document navigation, not an alova request: the endpoint answers
 * with a 303 to the provider, exactly like the login page's provider buttons.
 * The provider code is validated and percent-encoded here so a crafted value
 * cannot escape the path segment.
 */
export function platformOAuthLinkStartUrl(provider: string): string {
  const code = platformOAuthLinkParamsSchema.shape.provider.parse(provider)
  return platformApiPath(`/me/oauth-links/${encodeURIComponent(code)}/start`)
}

/**
 * Start an OAuth link round trip for the packaged app.
 *
 * The app cannot carry a bearer session across the document navigation that the
 * plain `platformOAuthLinkStartUrl` implies, so it asks for the provider URL
 * over JSON instead and opens that URL in the system browser. The returned
 * authorization URL is provider-owned, so a document navigation would leak the
 * API's 401 JSON into the WebView as page content — the defect this replaces.
 */
export function startPlatformOAuthLinkApp(
  input: PlatformOAuthLinkAppStartInput
) {
  const code = platformOAuthLinkParamsSchema.shape.provider.parse(
    input.provider
  )
  const submission = platformOAuthLinkAppStartRequestSchema.parse({
    codeChallenge: input.codeChallenge,
  })
  return platformApiClient.Post(
    platformApiPath(`/me/oauth-links/${encodeURIComponent(code)}/start`),
    submission,
    parsed(platformOAuthLinkAppStartResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}
