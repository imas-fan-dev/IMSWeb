import {
  platformApiPath,
  platformAuthOAuthPath,
  platformAuthPath,
} from "@imsweb/contracts/paths"
import { successFlagSchema } from "@imsweb/contracts/common"
import {
  passwordResetIssueResponseSchema,
  platformHttpErrorSchema,
  platformAvatarRemovalRequestSchema,
  platformLoginRequestSchema,
  platformOAuthProvidersResponseSchema,
  platformPasswordResetRequestSchema,
  platformPasswordResetSubmissionSchema,
  platformProfileHttpErrorSchema,
  platformProfileMutationResponseSchema,
  platformProfileResponseSchema,
  platformProfileUpdateRequestSchema,
  platformRegistrationVerificationRequestSchema,
  platformRegistrationVerificationResponseSchema,
  platformRegisterRequestSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"
import {
  platformAccountSecurityErrorSchema,
  platformOAuthLinkListResponseSchema,
  platformOAuthLinkParamsSchema,
  platformOAuthUnlinkResponseSchema,
  platformPasswordChangeRequestSchema,
  platformPasswordChangeResponseSchema,
  platformSessionListResponseSchema,
  platformSessionParamsSchema,
  platformSessionRevocationResponseSchema,
} from "@imsweb/contracts/platform/account-security"
import { z } from "@imsweb/contracts/z"

import {
  normalizePlatformProfileMutation,
  normalizePlatformProfileResponse,
  normalizePlatformSession,
} from "../../media-urls"
import { parsed } from "../../parsed"
import { readCookie } from "../../cookies"
import { platformApiClient } from "../../platform-client"
import { hasStoredPlatformSession } from "../../platform-token-store"
import { PLATFORM_CSRF_COOKIE_NAME } from "../../request"
import { withPlatformAuth, withPlatformCsrf } from "../../types"

export {
  platformOAuthProviderCodeSchema,
  platformOAuthProviderIconSchema,
  platformOAuthButtonColorSchema,
  platformOAuthProviderSchema,
  platformOAuthProvidersResponseSchema,
  platformAccountSchema,
  platformSessionProfileSchema,
  platformProfileSchema,
  platformSessionSchema,
  platformRegistrationVerificationResponseSchema,
  platformProfileResponseSchema,
  platformProfileMutationResponseSchema,
  passwordResetIssueResponseSchema,
} from "@imsweb/contracts/platform"
export type * from "@imsweb/contracts/platform"

export {
  platformSessionDeviceSchema,
  platformSessionListResponseSchema,
  platformSessionRevocationResponseSchema,
  platformOAuthLinkSchema,
  platformOAuthLinkListResponseSchema,
  platformOAuthUnlinkResponseSchema,
  platformPasswordChangeResponseSchema,
} from "@imsweb/contracts/platform/account-security"
export type * from "@imsweb/contracts/platform/account-security"

export {
  platformLoginPasswordSchema,
  platformPasswordSchema,
  platformPasswordResetRequestSchema,
  platformPasswordResetSubmissionSchema,
} from "@imsweb/contracts/platform"

export const platformAvatarRemovalSchema = platformAvatarRemovalRequestSchema
export const platformLoginInputSchema = platformLoginRequestSchema
export const platformProfileUpdateSchema = platformProfileUpdateRequestSchema
export const platformRegistrationVerificationInputSchema =
  platformRegistrationVerificationRequestSchema
export const platformRegisterInputSchema = platformRegisterRequestSchema

const fileSchema = z.custom<File>(
  (value) => typeof File !== "undefined" && value instanceof File,
  "image must be a File"
)

export const platformAvatarUploadSchema = z
  .object({
    image: fileSchema,
    expectedUpdatedAt: z.number().int().safe().nonnegative(),
  })
  .strict()

export const platformPasswordChangeInputSchema =
  platformPasswordChangeRequestSchema
export const platformSessionIdSchema = platformSessionParamsSchema.shape.id

export type PlatformLoginInput =
  import("@imsweb/contracts/platform").PlatformLoginRequest
export type PlatformRegisterInput =
  import("@imsweb/contracts/platform").PlatformRegisterRequest
export type PlatformPasswordResetRequest = z.input<
  typeof platformPasswordResetRequestSchema
>
export type PlatformPasswordResetSubmission = z.input<
  typeof platformPasswordResetSubmissionSchema
>
export type PlatformRegistrationVerificationInput = z.input<
  typeof platformRegistrationVerificationRequestSchema
>
export type PlatformProfileUpdate = z.input<
  typeof platformProfileUpdateRequestSchema
>
export type PlatformAvatarUpload = z.input<typeof platformAvatarUploadSchema>
export type PlatformPasswordChangeInput =
  import("@imsweb/contracts/platform/account-security").PlatformPasswordChangeRequest

/**
 * Whether a session restore is worth a network round trip on boot.
 *
 * Browser builds look for the readable CSRF cookie that accompanies the
 * httpOnly session cookies. The packaged client has no cookie jar, so it looks
 * for the tokens it stored itself.
 */
export function hasPlatformSessionHint() {
  return (
    Boolean(readCookie(PLATFORM_CSRF_COOKIE_NAME)) || hasStoredPlatformSession()
  )
}

export function getPlatformOAuthProviders() {
  return platformApiClient.Get(
    platformAuthOAuthPath("/providers"),
    parsed(platformOAuthProvidersResponseSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
    })
  )
}

export function sendPlatformPasswordResetVerificationCode(
  input: PlatformPasswordResetRequest
) {
  const submission = platformPasswordResetRequestSchema.parse(input)
  return platformApiClient.Post(
    platformAuthPath("/password-reset/verification-code"),
    submission,
    parsed(passwordResetIssueResponseSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
    })
  )
}

export function resetPlatformPassword(input: PlatformPasswordResetSubmission) {
  const submission = platformPasswordResetSubmissionSchema.parse(input)
  return platformApiClient.Post(
    platformAuthPath("/password-reset"),
    submission,
    parsed(successFlagSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
    })
  )
}

export function getPlatformSession() {
  return platformApiClient.Get(
    platformAuthPath("/session"),
    parsed(platformSessionSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth(),
      select: normalizePlatformSession,
    })
  )
}

export function loginPlatform(input: PlatformLoginInput) {
  const submission = platformLoginInputSchema.parse(input)
  return platformApiClient.Post(
    platformAuthPath("/login"),
    submission,
    parsed(platformSessionSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
      select: normalizePlatformSession,
    })
  )
}

export function sendPlatformRegistrationVerificationCode(
  input: PlatformRegistrationVerificationInput
) {
  const submission = platformRegistrationVerificationInputSchema.parse(input)
  return platformApiClient.Post(
    platformAuthPath("/register/verification-code"),
    submission,
    parsed(platformRegistrationVerificationResponseSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
    })
  )
}

export function registerPlatform(input: PlatformRegisterInput) {
  const submission = platformRegisterInputSchema.parse(input)
  return platformApiClient.Post(
    platformAuthPath("/register"),
    submission,
    parsed(platformSessionSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth({ authRole: "login" }),
      select: normalizePlatformSession,
    })
  )
}

export function getPlatformProfile() {
  return platformApiClient.Get(
    platformApiPath("/me"),
    parsed(platformProfileResponseSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformAuth(),
      select: normalizePlatformProfileResponse,
    })
  )
}

export function updatePlatformProfile(input: PlatformProfileUpdate) {
  const submission = platformProfileUpdateSchema.parse(input)
  return platformApiClient.Put(
    platformApiPath("/me"),
    submission,
    parsed(platformProfileMutationResponseSchema, {
      errorSchema: platformProfileHttpErrorSchema,
      meta: withPlatformCsrf(),
      select: normalizePlatformProfileMutation,
    })
  )
}

export function uploadPlatformAvatar(input: PlatformAvatarUpload) {
  const upload = platformAvatarUploadSchema.parse(input)
  const form = new FormData()
  form.append("image", upload.image)
  form.append("expectedUpdatedAt", String(upload.expectedUpdatedAt))
  return platformApiClient.Put(
    platformApiPath("/me/avatar"),
    form,
    parsed(platformProfileMutationResponseSchema, {
      errorSchema: platformProfileHttpErrorSchema,
      meta: withPlatformCsrf(),
      select: normalizePlatformProfileMutation,
    })
  )
}

export function removePlatformAvatar(expectedUpdatedAt: number) {
  const submission = platformAvatarRemovalSchema.parse({ expectedUpdatedAt })
  return platformApiClient.Delete(
    platformApiPath("/me/avatar"),
    submission,
    parsed(platformProfileMutationResponseSchema, {
      errorSchema: platformProfileHttpErrorSchema,
      meta: withPlatformCsrf(),
      select: normalizePlatformProfileMutation,
    })
  )
}

/**
 * Replace the account password.
 *
 * The API runs this inside one transaction that bumps `token_version` (killing
 * every access token the account has issued) and re-issues the caller's own
 * pair, so a success means every *other* device was signed out. Callers must
 * treat `revokedSessionCount` as real state change and refresh anything that
 * renders the device list. Packaged clients get the rotated tokens in the body;
 * the platform client's response interceptor stores them, so nothing else here
 * has to know about bearer mode.
 */
export function changePlatformPassword(input: PlatformPasswordChangeInput) {
  const submission = platformPasswordChangeInputSchema.parse(input)
  return platformApiClient.Post(
    platformApiPath("/me/password"),
    submission,
    parsed(platformPasswordChangeResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function getPlatformSessionDevices() {
  return platformApiClient.Get(
    platformApiPath("/me/sessions"),
    parsed(platformSessionListResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

export function revokePlatformSessionDevice(sessionId: string) {
  const id = platformSessionIdSchema.parse(sessionId)
  return platformApiClient.Delete(
    platformApiPath(`/me/sessions/${encodeURIComponent(id)}`),
    undefined,
    parsed(platformSessionRevocationResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

/** Sign out every device except the one making the request. */
export function revokeOtherPlatformSessions() {
  return platformApiClient.Delete(
    platformApiPath("/me/sessions"),
    undefined,
    parsed(platformSessionRevocationResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function getPlatformOAuthLinks() {
  return platformApiClient.Get(
    platformApiPath("/me/oauth-links"),
    parsed(platformOAuthLinkListResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformAuth(),
    })
  )
}

/**
 * Unlink a provider. Whether a given link may be removed is decided by the
 * server (`PlatformOAuthLink.removable`): the guard also weighs whether the
 * remaining providers are still `enabled`, which this client cannot see.
 */
export function unlinkPlatformOAuthLink(provider: string) {
  const code = platformOAuthLinkParamsSchema.shape.provider.parse(provider)
  return platformApiClient.Delete(
    platformApiPath(`/me/oauth-links/${encodeURIComponent(code)}`),
    undefined,
    parsed(platformOAuthUnlinkResponseSchema, {
      errorSchema: platformAccountSecurityErrorSchema,
      meta: withPlatformCsrf(),
    })
  )
}

export function logoutPlatform() {
  return platformApiClient.Post(
    platformAuthPath("/logout"),
    undefined,
    parsed(successFlagSchema, {
      errorSchema: platformHttpErrorSchema,
      meta: withPlatformCsrf({ authRole: "logout" }),
    })
  )
}
