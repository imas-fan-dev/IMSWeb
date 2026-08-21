import { z } from "zod"
import { successEnvelope } from "../common.js"

export const platformOAuthProviderSchema = z
  .object({
    code: z.enum(["google", "github"]),
    displayName: z.string().min(1).max(80),
    icon: z.enum(["google", "github"]),
  })
  .strict()

export const platformOAuthProvidersResponseSchema = successEnvelope({
    providers: z.array(platformOAuthProviderSchema),
  })
  .strict()

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
  })
  .strict()

export const platformRegistrationVerificationResponseSchema = successEnvelope({
    retryAfterSeconds: z.number().int().positive(),
  })
  .strict()

export const platformProfileResponseSchema = successEnvelope({
    account: platformAccountSchema,
    profile: platformProfileSchema,
    capabilities: z
      .object({
        fudabaWrite: z.boolean(),
      })
      .strict(),
  })
  .strict()

export const platformProfileMutationResponseSchema = successEnvelope({
    profile: platformProfileSchema,
  })
  .strict()


export type PlatformOAuthProvider = z.infer<typeof platformOAuthProviderSchema>
export type PlatformOAuthProvidersResponse = z.infer<typeof platformOAuthProvidersResponseSchema>
export type PlatformSession = z.infer<typeof platformSessionSchema>
export type PlatformProfile = z.infer<typeof platformProfileSchema>
export type PlatformRegistrationVerificationResponse = z.infer<typeof platformRegistrationVerificationResponseSchema>
export type PlatformProfileResponse = z.infer<typeof platformProfileResponseSchema>
export type PlatformProfileMutationResponse = z.infer<typeof platformProfileMutationResponseSchema>

export const passwordResetIssueResponseSchema = successEnvelope({
  sent: z.literal(true),
  retryAfterSeconds: z.number().int().positive().optional(),
})

export type PasswordResetIssueResponse = z.infer<
  typeof passwordResetIssueResponseSchema
>
