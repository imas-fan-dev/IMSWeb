import {
  platformApiPath,
  platformAuthOAuthPath,
  platformAuthPath,
} from "@imsweb/contracts/paths"
import { successFlagSchema } from "@imsweb/contracts/common"
import {
  platformOAuthLinkListResponseSchema,
  platformOAuthUnlinkResponseSchema,
  platformPasswordChangeResponseSchema,
  platformSessionListResponseSchema,
  platformSessionRevocationResponseSchema,
} from "@imsweb/contracts/platform/account-security"
import { passwordResetIssueResponseSchema } from "@imsweb/contracts/platform"
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

import {
  platformOAuthProviderCodeSchema,
  platformOAuthProvidersResponseSchema,
  platformProfileMutationResponseSchema,
  platformProfileResponseSchema,
  platformRegistrationVerificationResponseSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"

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

const utf8Encoder = new TextEncoder()

const platformRegistrationEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320)

export const platformLoginEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .regex(/^\S+@\S+\.\S+$/)

export const platformLoginPasswordSchema = z
  .string()
  .trim()
  .refine((value) => {
    const characters = Array.from(value).length
    return characters >= 1 && characters <= 128
  })
  .refine((value) => utf8Encoder.encode(value).byteLength <= 1024)

export const platformPasswordSchema = z
  .string()
  .trim()
  .min(8)
  .refine((value) => utf8Encoder.encode(value).byteLength <= 72, {
    message: "Password must not exceed 72 UTF-8 bytes",
  })

export const platformLoginInputSchema = z
  .object({
    email: platformLoginEmailSchema,
    password: platformLoginPasswordSchema,
  })
  .strict()

export const platformRegisterInputSchema = z
  .object({
    email: platformRegistrationEmailSchema,
    password: platformPasswordSchema,
    displayName: z.string().trim().min(1).max(80),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict()

export const platformPasswordResetRequestSchema = z
  .object({
    email: platformRegistrationEmailSchema,
  })
  .strict()

export const platformPasswordResetSubmissionSchema = z
  .object({
    email: platformRegistrationEmailSchema,
    code: z.string().regex(/^\d{6}$/),
    password: platformPasswordSchema,
  })
  .strict()

export const platformRegistrationVerificationInputSchema = z
  .object({
    email: platformRegistrationEmailSchema,
  })
  .strict()

export const platformProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    homeCity: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .transform((value) => value || null),
    bio: z.string().trim().max(2000),
    expectedUpdatedAt: z.number().int().safe().nonnegative(),
  })
  .strict()

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

export const platformAvatarRemovalSchema = z
  .object({
    expectedUpdatedAt: z.number().int().safe().nonnegative(),
  })
  .strict()

/**
 * Mirrors the two different normalizations the API applies. The current
 * password is only ever compared against a stored digest, so it takes the
 * lenient login rule: a legacy credential may sit below today's strength floor
 * and its owner must still be able to replace it. The replacement takes the
 * registration rule, which is where the 8-character and 72-byte bcrypt limits
 * live. Sending a request that the server would only reject wastes one of the
 * account's rate-limit slots.
 */
export const platformPasswordChangeInputSchema = z
  .object({
    currentPassword: platformLoginPasswordSchema,
    newPassword: platformPasswordSchema,
  })
  .strict()

// Session ids are server-minted and travel as a path segment; the bounds match
// `parsePlatformSessionId` on the API side.
export const platformSessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))

export type PlatformLoginInput = z.input<typeof platformLoginInputSchema>

export type PlatformRegisterInput = z.input<typeof platformRegisterInputSchema>

export type PlatformPasswordResetRequest = z.input<
  typeof platformPasswordResetRequestSchema
>

export type PlatformPasswordResetSubmission = z.input<
  typeof platformPasswordResetSubmissionSchema
>

export type PlatformRegistrationVerificationInput = z.input<
  typeof platformRegistrationVerificationInputSchema
>

export type PlatformProfileUpdate = z.input<typeof platformProfileUpdateSchema>

export type PlatformAvatarUpload = z.input<typeof platformAvatarUploadSchema>

export type PlatformPasswordChangeInput = z.input<
  typeof platformPasswordChangeInputSchema
>

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
      meta: withPlatformAuth({ authRole: "login" }),
    })
  )
}

export function getPlatformSession() {
  return platformApiClient.Get(
    platformAuthPath("/session"),
    parsed(platformSessionSchema, {
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
      meta: withPlatformAuth({ authRole: "login" }),
      select: normalizePlatformSession,
    })
  )
}

export function getPlatformProfile() {
  return platformApiClient.Get(
    platformApiPath("/me"),
    parsed(platformProfileResponseSchema, {
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
      meta: withPlatformCsrf(),
    })
  )
}

export function getPlatformSessionDevices() {
  return platformApiClient.Get(
    platformApiPath("/me/sessions"),
    parsed(platformSessionListResponseSchema, {
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
      meta: withPlatformCsrf(),
    })
  )
}

export function getPlatformOAuthLinks() {
  return platformApiClient.Get(
    platformApiPath("/me/oauth-links"),
    parsed(platformOAuthLinkListResponseSchema, {
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
  const code = platformOAuthProviderCodeSchema.parse(provider)
  return platformApiClient.Delete(
    platformApiPath(`/me/oauth-links/${encodeURIComponent(code)}`),
    undefined,
    parsed(platformOAuthUnlinkResponseSchema, {
      meta: withPlatformCsrf(),
    })
  )
}

export function logoutPlatform() {
  return platformApiClient.Post(
    platformAuthPath("/logout"),
    undefined,
    parsed(successFlagSchema, {
      meta: withPlatformCsrf({ authRole: "logout" }),
    })
  )
}
