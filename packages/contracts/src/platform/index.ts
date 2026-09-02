import { z } from "zod"
import { successEnvelope } from "../common.js"

export const platformOAuthProviderCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9-]*$/)

export const platformOAuthProviderIconSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const platformOAuthButtonColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((value) => value.toLowerCase())

export const platformOAuthProviderSchema = z
  .object({
    code: platformOAuthProviderCodeSchema,
    displayName: z.string().min(1).max(80),
    icon: platformOAuthProviderIconSchema,
    buttonColor: platformOAuthButtonColorSchema,
  })
  .strict()

export const platformOAuthProvidersResponseSchema = successEnvelope({
  providers: z.array(platformOAuthProviderSchema).max(30),
}).strict()

export const platformAccountSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["active", "restricted"]),
  })
  .strict()

export const platformSessionProfileSchema = z
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

export const platformSessionSchema = successEnvelope({
  account: platformAccountSchema,
  profile: platformSessionProfileSchema,
  // Browser sessions use httpOnly cookies. Packaged mobile clients opt into
  // bearer mode and receive tokens because their WebView has no shared jar.
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
}).strict()

export const platformRegistrationVerificationResponseSchema = successEnvelope({
  retryAfterSeconds: z.number().int().positive(),
}).strict()

export const platformProfileResponseSchema = successEnvelope({
  account: platformAccountSchema,
  profile: platformProfileSchema,
  capabilities: z
    .object({
      fudabaWrite: z.boolean(),
    })
    .strict(),
}).strict()

export const platformProfileMutationResponseSchema = successEnvelope({
  profile: platformProfileSchema,
}).strict()

export type PlatformOAuthProvider = z.infer<typeof platformOAuthProviderSchema>
export type PlatformOAuthProvidersResponse = z.infer<
  typeof platformOAuthProvidersResponseSchema
>
export type PlatformSession = z.infer<typeof platformSessionSchema>
export type PlatformProfile = z.infer<typeof platformProfileSchema>
export type PlatformRegistrationVerificationResponse = z.infer<
  typeof platformRegistrationVerificationResponseSchema
>
export type PlatformProfileResponse = z.infer<
  typeof platformProfileResponseSchema
>
export type PlatformProfileMutationResponse = z.infer<
  typeof platformProfileMutationResponseSchema
>

export type PlatformAccountStatus = z.infer<
  typeof platformAccountSchema
>["status"]

export const passwordResetIssueResponseSchema = successEnvelope({
  sent: z.literal(true),
  retryAfterSeconds: z.number().int().positive().optional(),
})

export type PasswordResetIssueResponse = z.infer<
  typeof passwordResetIssueResponseSchema
>
