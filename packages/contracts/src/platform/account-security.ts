import { z } from "zod";
import { successEnvelope } from "../common.js";
import {
  platformHttpErrorSchema,
  platformLoginPasswordSchema,
  platformOAuthProviderCodeSchema,
  platformPasswordSchema,
  platformRegistrationEmailSchema,
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

// The link-start route binds the caller's session to the provider round trip.
// It accepts no client input, so the strict empty object rejects stray query keys.
export const platformOAuthLinkStartQuerySchema = z.object({}).strict();

// The binding code shares platform_email_verification_codes with registration,
// so the request shape mirrors registration verification while the hash domain
// keeps the two code spaces disjoint server-side.
export const platformEmailVerificationCodeRequestSchema = z
  .object({ email: platformRegistrationEmailSchema })
  .strict();

export const platformEmailVerificationCodeResponseSchema = successEnvelope({
  queued: z.literal(true),
  retryAfterSeconds: z.number().int().min(1).max(600),
}).strict();

export const platformEmailCredentialResponseSchema = successEnvelope({
  email: z.string().min(3).max(320).nullable(),
}).strict();

// Binding provisions the account's first email credential, so it carries a new password.
export const platformEmailBindRequestSchema = z
  .object({
    email: platformRegistrationEmailSchema,
    code: z.string().regex(/^\d{6}$/),
    newPassword: platformPasswordSchema,
  })
  .strict();

// Changing an existing credential keeps the stored password hash, so it re-proves
// ownership with the current password instead of setting a new one.
export const platformEmailChangeRequestSchema = z
  .object({
    email: platformRegistrationEmailSchema,
    code: z.string().regex(/^\d{6}$/),
    currentPassword: platformLoginPasswordSchema,
  })
  .strict();

export const platformEmailBindingResponseSchema = successEnvelope({
  email: z.string().min(3).max(320),
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
export type PlatformOAuthLinkStartQuery = z.infer<
  typeof platformOAuthLinkStartQuerySchema
>;
export type PlatformEmailVerificationCodeRequest = z.infer<
  typeof platformEmailVerificationCodeRequestSchema
>;
export type PlatformEmailVerificationCodeResponse = z.infer<
  typeof platformEmailVerificationCodeResponseSchema
>;
export type PlatformEmailCredentialResponse = z.infer<
  typeof platformEmailCredentialResponseSchema
>;
export type PlatformEmailBindRequest = z.infer<
  typeof platformEmailBindRequestSchema
>;
export type PlatformEmailChangeRequest = z.infer<
  typeof platformEmailChangeRequestSchema
>;
export type PlatformEmailBindingResponse = z.infer<
  typeof platformEmailBindingResponseSchema
>;
