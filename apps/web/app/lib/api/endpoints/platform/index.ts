import { z } from "@imsweb/contracts/z"

import { readCookie } from "../../cookies"
import { platformApiClient } from "../../platform-client"
import { PLATFORM_CSRF_COOKIE_NAME } from "../../request"
import { withPlatformAuth, withPlatformCsrf } from "../../types"

import {
  platformOAuthProvidersResponseSchema,
  platformProfileMutationResponseSchema,
  platformProfileResponseSchema,
  platformRegistrationVerificationResponseSchema,
  platformSessionSchema,
} from "@imsweb/contracts/platform"

export * from "@imsweb/contracts/platform"

import type {
  PlatformOAuthProvidersResponse,
  PlatformProfileMutationResponse,
  PlatformProfileResponse,
  PlatformRegistrationVerificationResponse,
  PlatformSession,
} from "@imsweb/contracts/platform"

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

export function hasPlatformSessionHint() {
  return Boolean(readCookie(PLATFORM_CSRF_COOKIE_NAME))
}

export function getPlatformOAuthProviders() {
  return platformApiClient.Get<PlatformOAuthProvidersResponse, unknown>(
    "/api/platform/auth/oauth/providers",
    {
      meta: withPlatformAuth({ authRole: "login" }),
      transform: (payload) =>
        platformOAuthProvidersResponseSchema.parse(payload),
    }
  )
}

export function sendPlatformPasswordResetVerificationCode(
  input: PlatformPasswordResetRequest
) {
  const submission = platformPasswordResetRequestSchema.parse(input)
  return platformApiClient.Post<
    { success: true; sent: true; retryAfterSeconds?: number },
    unknown
  >("/api/platform/auth/password-reset/verification-code", submission, {
    meta: withPlatformAuth({ authRole: "login" }),
  })
}

export function resetPlatformPassword(input: PlatformPasswordResetSubmission) {
  const submission = platformPasswordResetSubmissionSchema.parse(input)
  return platformApiClient.Post<{ success: true }, unknown>(
    "/api/platform/auth/password-reset",
    submission,
    {
      meta: withPlatformAuth({ authRole: "login" }),
    }
  )
}

export function getPlatformSession() {
  return platformApiClient.Get<PlatformSession, unknown>(
    "/api/platform/auth/session",
    {
      meta: withPlatformAuth(),
      transform: (payload) => platformSessionSchema.parse(payload),
    }
  )
}

export function loginPlatform(input: PlatformLoginInput) {
  const submission = platformLoginInputSchema.parse(input)
  return platformApiClient.Post<PlatformSession, unknown>(
    "/api/platform/auth/login",
    submission,
    {
      meta: withPlatformAuth({ authRole: "login" }),
      transform: (payload) => platformSessionSchema.parse(payload),
    }
  )
}

export function sendPlatformRegistrationVerificationCode(
  input: PlatformRegistrationVerificationInput
) {
  const submission = platformRegistrationVerificationInputSchema.parse(input)
  return platformApiClient.Post<
    PlatformRegistrationVerificationResponse,
    unknown
  >("/api/platform/auth/register/verification-code", submission, {
    meta: withPlatformAuth({ authRole: "login" }),
    transform: (payload) =>
      platformRegistrationVerificationResponseSchema.parse(payload),
  })
}

export function registerPlatform(input: PlatformRegisterInput) {
  const submission = platformRegisterInputSchema.parse(input)
  return platformApiClient.Post<PlatformSession, unknown>(
    "/api/platform/auth/register",
    submission,
    {
      meta: withPlatformAuth({ authRole: "login" }),
      transform: (payload) => platformSessionSchema.parse(payload),
    }
  )
}

export function getPlatformProfile() {
  return platformApiClient.Get<PlatformProfileResponse, unknown>(
    "/api/platform/me",
    {
      meta: withPlatformAuth(),
      transform: (payload) => platformProfileResponseSchema.parse(payload),
    }
  )
}

export function updatePlatformProfile(input: PlatformProfileUpdate) {
  const submission = platformProfileUpdateSchema.parse(input)
  return platformApiClient.Put<PlatformProfileMutationResponse, unknown>(
    "/api/platform/me",
    submission,
    {
      meta: withPlatformCsrf(),
      transform: (payload) =>
        platformProfileMutationResponseSchema.parse(payload),
    }
  )
}

export function uploadPlatformAvatar(input: PlatformAvatarUpload) {
  const upload = platformAvatarUploadSchema.parse(input)
  const form = new FormData()
  form.append("image", upload.image)
  form.append("expectedUpdatedAt", String(upload.expectedUpdatedAt))
  return platformApiClient.Put<PlatformProfileMutationResponse, unknown>(
    "/api/community/exchange/uploads/avatar",
    form,
    {
      meta: withPlatformCsrf(),
      transform: (payload) =>
        platformProfileMutationResponseSchema.parse(payload),
    }
  )
}

export function logoutPlatform() {
  return platformApiClient.Post<{ success: true }, unknown>(
    "/api/platform/auth/logout",
    undefined,
    {
      meta: withPlatformCsrf({ authRole: "logout" }),
    }
  )
}
