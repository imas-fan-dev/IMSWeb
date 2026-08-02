import { z } from "zod"

import { readCookie } from "../cookies"
import { platformApiClient } from "../platform-client"
import { PLATFORM_CSRF_COOKIE_NAME } from "../request"
import { withPlatformAuth, withPlatformCsrf } from "../types"

const platformAccountSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["active", "restricted"]),
  })
  .strict()

const platformSessionProfileSchema = z
  .object({
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    homeCity: z.string().nullable(),
    bio: z.string(),
  })
  .strict()

export const platformProfileSchema = platformSessionProfileSchema
  .extend({
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict()

export const platformSessionSchema = z
  .object({
    success: z.literal(true),
    account: platformAccountSchema,
    profile: platformSessionProfileSchema,
  })
  .strict()

export const platformProfileResponseSchema = z
  .object({
    success: z.literal(true),
    account: platformAccountSchema,
    profile: platformProfileSchema,
    capabilities: z
      .object({
        fudabaWrite: z.boolean(),
      })
      .strict(),
  })
  .strict()

export const platformProfileMutationResponseSchema = z
  .object({
    success: z.literal(true),
    profile: platformProfileSchema,
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

export type PlatformSession = z.infer<typeof platformSessionSchema>
export type PlatformProfile = z.infer<typeof platformProfileSchema>
export type PlatformProfileResponse = z.infer<
  typeof platformProfileResponseSchema
>
export type PlatformProfileMutationResponse = z.infer<
  typeof platformProfileMutationResponseSchema
>
export type PlatformProfileUpdate = z.input<typeof platformProfileUpdateSchema>
export type PlatformAvatarUpload = z.input<typeof platformAvatarUploadSchema>

export function hasPlatformSessionHint() {
  return Boolean(readCookie(PLATFORM_CSRF_COOKIE_NAME))
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
