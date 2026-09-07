import { z } from "zod";
import { successEnvelope } from "../common.js";

const utf8Encoder = new TextEncoder();

function unicodeLength(value: string, minimum: number, maximum: number) {
  const length = Array.from(value).length;
  return length >= minimum && length <= maximum;
}

function normalizedPlatformEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    /[\u0000-\u0020\u007f]/.test(normalized)
  ) {
    return false;
  }
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator !== normalized.indexOf("@")) return false;
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  return (
    local.length <= 64 &&
    domain.length <= 255 &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) &&
    domain.includes(".") &&
    !domain.includes("..") &&
    domain
      .split(".")
      .every(
        (label) =>
          Boolean(label) &&
          label.length <= 63 &&
          !label.startsWith("-") &&
          !label.endsWith("-"),
      )
  );
}

export const platformOAuthProviderCodeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z][a-z0-9-]*$/);

export const platformOAuthProviderCodeRequestSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(platformOAuthProviderCodeSchema);

export const platformOAuthProviderIconSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const platformOAuthProviderIconRequestSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(platformOAuthProviderIconSchema);

export const platformOAuthButtonColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i);

export const platformOAuthButtonColorRequestSchema = z
  .string()
  .trim()
  .pipe(platformOAuthButtonColorSchema)
  .transform((value) => value.toLowerCase());

export const platformLoginEmailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value.length <= 254 && /^\S+@\S+\.\S+$/.test(value));

export const platformRegistrationEmailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine(normalizedPlatformEmail);

export const platformLoginPasswordSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => unicodeLength(value, 1, 128))
  .refine((value) => utf8Encoder.encode(value).byteLength <= 1024);

export const platformPasswordSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => unicodeLength(value, 8, 128))
  .refine((value) => utf8Encoder.encode(value).byteLength <= 72);

export const platformLoginRequestSchema = z
  .object({
    email: platformLoginEmailSchema,
    password: platformLoginPasswordSchema,
  })
  .strict();

export const platformRegistrationVerificationRequestSchema = z
  .object({ email: platformRegistrationEmailSchema })
  .strict();

export const platformRegisterRequestSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    displayName: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => unicodeLength(value, 1, 80)),
    email: platformRegistrationEmailSchema,
    password: platformPasswordSchema,
  })
  .strict();

export const platformPasswordResetRequestSchema =
  platformRegistrationVerificationRequestSchema;

export const platformPasswordResetSubmissionSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    email: platformRegistrationEmailSchema,
    password: platformPasswordSchema,
  })
  .strict();

const platformProfileTimestampRequestSchema = z
  .number({ invalid_type_error: "expectedUpdatedAt 必须是非负整数" })
  .int("expectedUpdatedAt 必须是非负整数")
  .safe("expectedUpdatedAt 必须是非负整数")
  .nonnegative("expectedUpdatedAt 必须是非负整数");

const platformProfileTextRequestSchema = (
  field: string,
  maximum: number,
  required = false,
) =>
  z
    .string({ invalid_type_error: `${field} 必须是字符串` })
    .transform((value) => value.trim())
    .superRefine((value, context) => {
      if ((required && !value) || value.length > maximum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} 长度无效`,
        });
      }
    });

export const platformProfileUpdateRequestSchema = z
  .object({
    bio: platformProfileTextRequestSchema("bio", 2000),
    displayName: platformProfileTextRequestSchema("displayName", 80, true),
    expectedUpdatedAt: platformProfileTimestampRequestSchema,
    homeCity: platformProfileTextRequestSchema("homeCity", 100)
      .nullable()
      .transform((value) => value || null),
  }, { invalid_type_error: "请求体必须是对象" })
  .strict("请求体包含未知字段");

export const platformAvatarRemovalRequestSchema = z
  .object(
    { expectedUpdatedAt: platformProfileTimestampRequestSchema },
    { invalid_type_error: "请求体必须是对象" },
  )
  .strict("请求体包含未知字段");

export const platformProfileAvatarQuerySchema = z
  .object({ v: z.string().optional() })
  .strip();

export const platformAuthErrorSchema = z
  .object({ success: z.literal(false), code: z.string().min(1) })
  .strict();

export const platformRetryableAuthErrorSchema = platformAuthErrorSchema
  .extend({ retryAfterSeconds: z.number().int().positive() })
  .strict();

export const platformMiddlewareErrorSchema = z
  .object({ error: z.string().min(1) })
  .strict();

export const platformMutationRateLimitResponseSchema = z
  .object({ success: z.literal(false), code: z.literal("PLATFORM_RATE_LIMITED") })
  .strict();

export const platformHttpErrorSchema = z.union([
  platformAuthErrorSchema,
  platformRetryableAuthErrorSchema,
  platformMutationRateLimitResponseSchema,
  platformMiddlewareErrorSchema,
]);

export const platformProfileErrorSchema = platformAuthErrorSchema
  .extend({
    message: z.string().optional(),
    updatedAt: z.number().int().safe().nonnegative().optional(),
  })
  .strict();

export const platformProfileHttpErrorSchema = z.union([
  platformProfileErrorSchema,
  platformMiddlewareErrorSchema,
]);

export const platformOAuthProviderSchema = z
  .object({
    code: platformOAuthProviderCodeSchema,
    displayName: z.string().min(1).max(80),
    icon: platformOAuthProviderIconSchema,
    buttonColor: platformOAuthButtonColorSchema,
  })
  .strict();

export const platformOAuthProvidersResponseSchema = successEnvelope({
  providers: z.array(platformOAuthProviderSchema).max(30),
}).strict();

// Public OAuth routes redirect unknown provider paths to the login screen.
// The handler, rather than request validation, preserves that redirect contract.
export const platformOAuthProviderParamsSchema = z
  .object({ provider: z.string() })
  .strict();

export const platformOAuthStartQuerySchema = z
  .object({ returnPath: z.string().optional() })
  .strip();

// OAuth providers may attach vendor-specific callback fields. Preserve them so
// the callback remains compatible with their evolving error payloads.
export const platformOAuthCallbackQuerySchema = z
  .object({
    code: z.string().optional(),
    error: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough();

export const platformAccountSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["active", "restricted", "suspended", "deleted"]),
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
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
}).strict();

export const platformRegistrationVerificationResponseSchema = successEnvelope({
  retryAfterSeconds: z.number().int().positive(),
}).strict();

export const platformProfileResponseSchema = successEnvelope({
  account: platformAccountSchema,
  profile: platformProfileSchema,
  capabilities: z.object({ fudabaWrite: z.boolean() }).strict(),
}).strict();

export const platformProfileMutationResponseSchema = successEnvelope({
  profile: platformProfileSchema,
}).strict();

export const passwordResetIssueResponseSchema = successEnvelope({
  sent: z.literal(true),
  retryAfterSeconds: z.number().int().positive().optional(),
}).strict();

export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;
export type PlatformRegisterRequest = z.infer<
  typeof platformRegisterRequestSchema
>;
export type PlatformAuthError = z.infer<typeof platformAuthErrorSchema>;
export type PlatformRetryableAuthError = z.infer<
  typeof platformRetryableAuthErrorSchema
>;
export type PlatformProfileError = z.infer<typeof platformProfileErrorSchema>;
export type PlatformProfileHttpError = z.infer<
  typeof platformProfileHttpErrorSchema
>;
export type PlatformOAuthProvider = z.infer<typeof platformOAuthProviderSchema>;
export type PlatformOAuthProviderParams = z.infer<
  typeof platformOAuthProviderParamsSchema
>;
export type PlatformOAuthStartQuery = z.infer<typeof platformOAuthStartQuerySchema>;
export type PlatformOAuthCallbackQuery = z.infer<
  typeof platformOAuthCallbackQuerySchema
>;
export type PlatformMutationRateLimitResponse = z.infer<
  typeof platformMutationRateLimitResponseSchema
>;
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
export type PlatformAccountStatus = z.infer<
  typeof platformAccountSchema
>["status"];
export type PasswordResetIssueResponse = z.infer<
  typeof passwordResetIssueResponseSchema
>;
