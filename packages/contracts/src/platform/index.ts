import { z } from "zod";
import { successEnvelope } from "../common.js";

export const PLATFORM_OAUTH_PROVIDER_CODES = ["google", "github"] as const;
export const platformOAuthProviderCodeSchema = z.enum(
  PLATFORM_OAUTH_PROVIDER_CODES,
);

export const platformOAuthProviderSchema = z
  .object({
    code: platformOAuthProviderCodeSchema,
    displayName: z.string().min(1).max(80),
    icon: platformOAuthProviderCodeSchema,
  })
  .strict()
  .superRefine((provider, context) => {
    if (provider.icon !== provider.code) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OAuth provider icon must match its fixed code",
        path: ["icon"],
      });
    }
  });

export const platformOAuthProvidersResponseSchema = successEnvelope({
  providers: z.array(platformOAuthProviderSchema),
}).strict();

export const platformAccountSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["active", "restricted"]),
  })
  .strict();

export const platformSessionProfileSchema = z
  .object({
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    homeCity: z.string().nullable(),
    bio: z.string(),
  })
  .strict();

export const platformProfileSchema = platformSessionProfileSchema
  .extend({
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const platformSessionSchema = successEnvelope({
  account: platformAccountSchema,
  profile: platformSessionProfileSchema,
  // Only present when the caller opted into token auth with
  // `X-IMS-Auth-Mode: bearer`. Browser clients never ask for it, so their
  // access token stays httpOnly and out of reach of page scripts. The
  // packaged mobile client has no cookie jar and must carry the token itself.
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
}).strict();

export const platformRegistrationVerificationResponseSchema = successEnvelope({
  retryAfterSeconds: z.number().int().positive(),
}).strict();

export const platformProfileResponseSchema = successEnvelope({
  account: platformAccountSchema,
  profile: platformProfileSchema,
  capabilities: z
    .object({
      fudabaWrite: z.boolean(),
    })
    .strict(),
}).strict();

export const platformProfileMutationResponseSchema = successEnvelope({
  profile: platformProfileSchema,
}).strict();

export type PlatformOAuthProvider = z.infer<typeof platformOAuthProviderSchema>;
export type PlatformOAuthProvidersResponse = z.infer<
  typeof platformOAuthProvidersResponseSchema
>;
export type PlatformSession = z.infer<typeof platformSessionSchema>;
export type PlatformProfile = z.infer<typeof platformProfileSchema>;
export type PlatformRegistrationVerificationResponse = z.infer<
  typeof platformRegistrationVerificationResponseSchema
>;
export type PlatformProfileResponse = z.infer<
  typeof platformProfileResponseSchema
>;
export type PlatformProfileMutationResponse = z.infer<
  typeof platformProfileMutationResponseSchema
>;

export const passwordResetIssueResponseSchema = successEnvelope({
  sent: z.literal(true),
  retryAfterSeconds: z.number().int().positive().optional(),
});

export type PasswordResetIssueResponse = z.infer<
  typeof passwordResetIssueResponseSchema
>;
