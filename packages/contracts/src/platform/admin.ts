import { z } from "zod"
import { successEnvelope } from "../common.js"
import {
  platformOAuthButtonColorSchema,
  platformOAuthProviderCodeSchema,
  platformOAuthProviderIconSchema,
} from "./index.js"

export const platformOAuthTokenAuthMethodSchema = z.enum([
  "client_secret_post",
  "client_secret_basic",
])

export const platformOAuthProfilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/)

export const platformOAuthAdminProviderSchema = z
  .object({
    code: platformOAuthProviderCodeSchema,
    displayName: z.string().min(1).max(80),
    icon: platformOAuthProviderIconSchema,
    buttonColor: platformOAuthButtonColorSchema,
    enabled: z.boolean(),
    configured: z.boolean(),
    clientIdMasked: z.string().nullable(),
    redirectUri: z.string().nullable(),
    authorizationEndpoint: z.string().min(1).max(2048),
    tokenEndpoint: z.string().min(1).max(2048),
    userInfoEndpoint: z.string().min(1).max(2048),
    scopes: z.array(z.string().trim().min(1).max(120)).max(30),
    tokenAuthMethod: platformOAuthTokenAuthMethodSchema,
    pkceEnabled: z.boolean(),
    profileSubjectPath: platformOAuthProfilePathSchema,
    profileDisplayNamePath: platformOAuthProfilePathSchema,
    profileDisplayNameFallbackPath: platformOAuthProfilePathSchema.nullable(),
    profileAvatarUrlPath: platformOAuthProfilePathSchema.nullable(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()

export const platformOAuthAdminProviderListSchema = successEnvelope({
  providers: z.array(platformOAuthAdminProviderSchema).max(30),
}).strict()

export const platformOAuthAdminProviderMutationSchema = successEnvelope({
  provider: platformOAuthAdminProviderSchema,
}).strict()

export const platformOAuthAdminProviderDeleteSchema = successEnvelope({
  deletedCode: platformOAuthProviderCodeSchema,
}).strict()

export type PlatformOAuthTokenAuthMethod = z.infer<
  typeof platformOAuthTokenAuthMethodSchema
>

export type PlatformOAuthAdminProvider = z.infer<
  typeof platformOAuthAdminProviderSchema
>

export type PlatformOAuthAdminProviderList = z.infer<
  typeof platformOAuthAdminProviderListSchema
>
