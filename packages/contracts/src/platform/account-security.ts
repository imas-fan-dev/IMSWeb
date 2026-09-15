import { z } from "zod";
import { successEnvelope } from "../common.js";
import {
  platformHttpErrorSchema,
  platformLoginPasswordSchema,
  platformOAuthProviderCodeSchema,
} from "./index.js";

export const platformPasswordChangeRequestSchema = z
  .object({
    currentPassword: platformLoginPasswordSchema,
    newPassword: z
      .string()
      .transform((value) => value.trim())
      .refine((value: string) => {
        const length = Array.from(value).length;
        return length >= 8 && length <= 128;
      })
      .refine((value) => new TextEncoder().encode(value).byteLength <= 72),
  })
  .strict();

export const platformSessionRouteParamsSchema = z
  .object({ id: z.string() })
  .strict();

export const platformSessionParamsSchema = z
  .object({
    id: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(128))
      .refine((value: string) => !/[\u0000-\u001f\u007f]/.test(value)),
  })
  .strict();

// Account-security routes intentionally do not trim provider path segments.
// A surrounding space must remain a missing link rather than naming a provider.
export const platformOAuthLinkRouteParamsSchema = z
  .object({ provider: z.string() })
  .strict();

export const platformOAuthLinkParamsSchema = z
  .object({ provider: platformOAuthProviderCodeSchema })
  .strict();

export const platformAccountSecurityErrorSchema = platformHttpErrorSchema;

export const platformSessionDeviceSchema = z
  .object({
    id: z.string().min(1),
    current: z.boolean(),
    userAgent: z.string().nullable(),
    ipAddress: z.string().nullable(),
    createdAt: z.number().int().safe().nonnegative(),
    lastSeenAt: z.number().int().safe().nonnegative().nullable(),
    expiresAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const platformSessionListResponseSchema = successEnvelope({
  sessions: z.array(platformSessionDeviceSchema).max(200),
}).strict();

export const platformSessionRevocationResponseSchema = successEnvelope({
  revokedSessionCount: z.number().int().safe().nonnegative(),
}).strict();

export const platformOAuthLinkSchema = z
  .object({
    provider: platformOAuthProviderCodeSchema,
    providerName: z.string().min(1).max(80),
    enabled: z.boolean(),
    accountName: z.string().min(1).max(200).nullable(),
    avatarUrl: z.string().min(1).max(2048).nullable(),
    linkedAt: z.number().int().safe().nonnegative(),
    removable: z.boolean(),
  })
  .strict();

export const platformOAuthLinkListResponseSchema = successEnvelope({
  links: z.array(platformOAuthLinkSchema).max(64),
  passwordEnabled: z.boolean(),
}).strict();

export const platformOAuthUnlinkResponseSchema = successEnvelope({
  provider: platformOAuthProviderCodeSchema,
}).strict();

export const platformPasswordChangeResponseSchema = successEnvelope({
  revokedSessionCount: z.number().int().safe().nonnegative(),
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
}).strict();

export type PlatformPasswordChangeRequest = z.infer<
  typeof platformPasswordChangeRequestSchema
>;
export type PlatformSessionRouteParams = z.infer<
  typeof platformSessionRouteParamsSchema
>;
export type PlatformSessionParams = z.infer<typeof platformSessionParamsSchema>;
export type PlatformOAuthLinkRouteParams = z.infer<
  typeof platformOAuthLinkRouteParamsSchema
>;
export type PlatformOAuthLinkParams = z.infer<
  typeof platformOAuthLinkParamsSchema
>;
export type PlatformSessionDevice = z.infer<typeof platformSessionDeviceSchema>;
export type PlatformSessionListResponse = z.infer<
  typeof platformSessionListResponseSchema
>;
export type PlatformSessionRevocationResponse = z.infer<
  typeof platformSessionRevocationResponseSchema
>;
export type PlatformPasswordChangeResponse = z.infer<
  typeof platformPasswordChangeResponseSchema
>;
export type PlatformOAuthLink = z.infer<typeof platformOAuthLinkSchema>;
export type PlatformOAuthLinkListResponse = z.infer<
  typeof platformOAuthLinkListResponseSchema
>;
export type PlatformOAuthUnlinkResponse = z.infer<
  typeof platformOAuthUnlinkResponseSchema
>;
