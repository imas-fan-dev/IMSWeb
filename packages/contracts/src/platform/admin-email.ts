import { successEnvelope } from "../common.js";
import { platformMiddlewareErrorSchema } from "./index.js";
import { z } from "../z.js";

const utf8Encoder = new TextEncoder();

export const adminPlatformEmailSecuritySchema = z.enum(["tls", "starttls"]);

const adminPlatformEmailHostRequestSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(1)
      .max(253)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        "SMTP host must be a public domain name",
      ),
  );

const adminPlatformEmailAddressRequestSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email().max(320));

const adminPlatformEmailOptionalUsernameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(512))
  .optional();

const adminPlatformEmailOptionalPasswordSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => utf8Encoder.encode(value).byteLength <= 4096,
    "SMTP password must be at most 4096 UTF-8 bytes",
  )
  .optional();

export const adminPlatformEmailConfigurationWriteRequestSchema = z
  .object({
    enabled: z.boolean(),
    host: adminPlatformEmailHostRequestSchema,
    port: z.number().int().min(1).max(65535),
    security: adminPlatformEmailSecuritySchema,
    username: adminPlatformEmailOptionalUsernameSchema,
    password: adminPlatformEmailOptionalPasswordSchema,
    fromAddress: adminPlatformEmailAddressRequestSchema,
    fromName: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(100)),
    resendCooldownSeconds: z.number().int().min(30).max(600),
    expectedUpdatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const adminPlatformEmailConfigurationTestRequestSchema =
  adminPlatformEmailConfigurationWriteRequestSchema
    .extend({ recipient: adminPlatformEmailAddressRequestSchema })
    .strict();

export const adminPlatformEmailSettingsSchema = z
  .object({
    enabled: z.boolean(),
    configured: z.boolean(),
    host: z.string().max(253),
    port: z.number().int().min(1).max(65535),
    security: adminPlatformEmailSecuritySchema,
    usernameMasked: z.string().nullable(),
    passwordConfigured: z.boolean(),
    fromAddress: z.string().max(320),
    fromName: z.string().max(100),
    resendCooldownSeconds: z.number().int().min(30).max(600),
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const adminPlatformEmailErrorSchema = z
  .object({ success: z.literal(false).optional(), message: z.string() })
  .strict();

export const adminPlatformEmailConflictErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("REVISION_CONFLICT"),
    settings: adminPlatformEmailSettingsSchema,
  })
  .strict();

export const adminPlatformEmailHttpErrorSchema = z.union([
  adminPlatformEmailErrorSchema,
  adminPlatformEmailConflictErrorSchema,
  platformMiddlewareErrorSchema,
]);

export const adminPlatformEmailSettingsResponseSchema = successEnvelope({
  settings: adminPlatformEmailSettingsSchema,
}).strict();

export const adminPlatformEmailMutationResponseSchema = successEnvelope({
  settings: adminPlatformEmailSettingsSchema,
}).strict();

export const adminPlatformEmailTestResponseSchema = successEnvelope({
  deliveredTo: z.string().email().max(320),
}).strict();

export type AdminPlatformEmailSecurity = z.infer<
  typeof adminPlatformEmailSecuritySchema
>;
export type AdminPlatformEmailConfigurationWriteRequest = z.infer<
  typeof adminPlatformEmailConfigurationWriteRequestSchema
>;
export type AdminPlatformEmailConfigurationTestRequest = z.infer<
  typeof adminPlatformEmailConfigurationTestRequestSchema
>;
export type AdminPlatformEmailSettings = z.infer<
  typeof adminPlatformEmailSettingsSchema
>;
export type AdminPlatformEmailSettingsResponse = z.infer<
  typeof adminPlatformEmailSettingsResponseSchema
>;
export type AdminPlatformEmailMutationResponse = z.infer<
  typeof adminPlatformEmailMutationResponseSchema
>;
export type AdminPlatformEmailTestResponse = z.infer<
  typeof adminPlatformEmailTestResponseSchema
>;
export type AdminPlatformEmailHttpError = z.infer<
  typeof adminPlatformEmailHttpErrorSchema
>;
