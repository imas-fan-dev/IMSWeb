import {
  exchangePath,
  platformApiPath,
  platformAuthOAuthPath,
  platformAuthPath,
} from "@imsweb/contracts/paths"
import { successFlagSchema } from "@imsweb/contracts/common"
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
  platformOAuthProvidersResponseSchema,
  platformProfileMutationResponseSchema,
  platformProfileResponseSchema,
  platformRegistrationVerificationResponseSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"

export {
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
    exchangePath("/uploads/avatar"),
    form,
    parsed(platformProfileMutationResponseSchema, {
      meta: withPlatformCsrf(),
      select: normalizePlatformProfileMutation,
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
