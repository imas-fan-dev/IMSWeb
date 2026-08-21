import { z } from "zod"
import { successEnvelope } from "../common.js"

export const platformOAuthAdminProviderSchema = z
  .object({
    code: z.enum(["google", "github"]),
    displayName: z.string().min(1).max(80),
    icon: z.enum(["google", "github"]),
    enabled: z.boolean(),
    configured: z.boolean(),
    clientIdMasked: z.string().nullable(),
    redirectUri: z.string().nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()

export const platformOAuthAdminProviderListSchema = successEnvelope({
    providers: z.array(platformOAuthAdminProviderSchema),
  })
  .strict()

export const platformOAuthAdminProviderMutationSchema = successEnvelope({
    provider: platformOAuthAdminProviderSchema,
  })
  .strict()

export type PlatformOAuthAdminProvider = z.infer<
  typeof platformOAuthAdminProviderSchema
>

export type PlatformOAuthAdminProviderList = z.infer<
  typeof platformOAuthAdminProviderListSchema
>
