import { z } from "zod";
import { successEnvelope } from "../common.js";
import {
  platformOAuthButtonColorRequestSchema,
  platformOAuthButtonColorSchema,
  platformOAuthProviderCodeSchema,
  platformOAuthProviderIconRequestSchema,
  platformOAuthProviderIconSchema,
  platformMiddlewareErrorSchema,
} from "./index.js";

export const platformOAuthTokenAuthMethodSchema = z.enum([
  "client_secret_post",
  "client_secret_basic",
]);

export const platformOAuthProfilePathSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/)
  .refine(
    (value) =>
      !value
        .split(".")
        .some((segment) =>
          ["__proto__", "prototype", "constructor"].includes(segment),
        ),
  );

const platformOAuthRequiredTextRequestSchema = (maximum: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1).max(maximum));

const platformOAuthOptionalTextRequestSchema = (maximum: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(maximum))
    .optional()
    .transform((value) => value || undefined);

const platformOAuthNullableProfilePathRequestSchema = z
  .string()
  .transform((value) => value.trim())
  .nullable()
  .optional()
  .transform((value) => value || null)
  .pipe(platformOAuthProfilePathSchema.nullable());

const platformOAuthScopesRequestSchema = z
  .array(
    z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1).max(120)),
  )
  .max(30)
  .superRefine((scopes, context) => {
    if (scopes.some((scope) => /\s/.test(scope))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid OAuth scope",
      });
    }
    if (new Set(scopes).size !== scopes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate OAuth scope",
      });
    }
  });

export const platformOAuthProviderWriteRequestSchema = z
  .object({
    authorizationEndpoint: platformOAuthRequiredTextRequestSchema(2048),
    buttonColor: platformOAuthButtonColorRequestSchema,
    clientId: platformOAuthOptionalTextRequestSchema(512),
    clientSecret: platformOAuthOptionalTextRequestSchema(2048),
    displayName: platformOAuthRequiredTextRequestSchema(80),
    enabled: z.boolean(),
    icon: platformOAuthProviderIconRequestSchema,
    pkceEnabled: z.boolean(),
    profileAvatarUrlPath: platformOAuthNullableProfilePathRequestSchema,
    profileDisplayNameFallbackPath:
      platformOAuthNullableProfilePathRequestSchema,
    profileDisplayNamePath: z
      .string()
      .transform((value) => value.trim())
      .pipe(platformOAuthProfilePathSchema),
    profileSubjectPath: z
      .string()
      .transform((value) => value.trim())
      .pipe(platformOAuthProfilePathSchema),
    redirectUri: platformOAuthOptionalTextRequestSchema(2048),
    scopes: platformOAuthScopesRequestSchema,
    tokenAuthMethod: platformOAuthTokenAuthMethodSchema,
    tokenEndpoint: platformOAuthRequiredTextRequestSchema(2048),
    userInfoEndpoint: platformOAuthRequiredTextRequestSchema(2048),
  })
  .strict();

export const platformOAuthProviderCreateRequestSchema =
  platformOAuthProviderWriteRequestSchema
    .extend({
      code: platformOAuthProviderCodeSchema,
    })
    .strict();

export const platformOAuthProviderUpdateRequestSchema =
  platformOAuthProviderWriteRequestSchema
    .extend({
      expectedUpdatedAt: z.number().int().safe().nonnegative(),
    })
    .strict();

export const platformOAuthProviderDeleteRequestSchema = z
  .object({ expectedUpdatedAt: z.number().int().safe().nonnegative() })
  .strict();

export const platformOAuthAdminProviderParamsSchema = z
  .object({ provider: platformOAuthProviderCodeSchema })
  .strict();

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
    scopes: z.array(z.string().min(1).max(120)).max(30),
    tokenAuthMethod: platformOAuthTokenAuthMethodSchema,
    pkceEnabled: z.boolean(),
    profileSubjectPath: platformOAuthProfilePathSchema,
    profileDisplayNamePath: platformOAuthProfilePathSchema,
    profileDisplayNameFallbackPath: platformOAuthProfilePathSchema.nullable(),
    profileAvatarUrlPath: platformOAuthProfilePathSchema.nullable(),
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const platformOAuthAdminErrorSchema = z
  .object({ success: z.literal(false).optional(), message: z.string() })
  .strict();

export const platformOAuthAdminConflictErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("REVISION_CONFLICT"),
    provider: platformOAuthAdminProviderSchema,
  })
  .strict();

export const platformOAuthAdminHttpErrorSchema = z.union([
  platformOAuthAdminErrorSchema,
  platformOAuthAdminConflictErrorSchema,
  platformMiddlewareErrorSchema,
]);

export const platformOAuthAdminProviderListSchema = successEnvelope({
  providers: z.array(platformOAuthAdminProviderSchema).max(30),
}).strict();

export const platformOAuthAdminProviderMutationSchema = successEnvelope({
  provider: platformOAuthAdminProviderSchema,
}).strict();

export const platformOAuthAdminProviderDeleteSchema = successEnvelope({
  deletedCode: platformOAuthProviderCodeSchema,
}).strict();

export type PlatformOAuthAdminProviderParams = z.infer<
  typeof platformOAuthAdminProviderParamsSchema
>;
export type PlatformOAuthProviderWriteRequest = z.infer<
  typeof platformOAuthProviderWriteRequestSchema
>;
export type PlatformOAuthProviderCreateRequest = z.infer<
  typeof platformOAuthProviderCreateRequestSchema
>;
export type PlatformOAuthProviderUpdateRequest = z.infer<
  typeof platformOAuthProviderUpdateRequestSchema
>;
export type PlatformOAuthTokenAuthMethod = z.infer<
  typeof platformOAuthTokenAuthMethodSchema
>;
export type PlatformOAuthAdminProvider = z.infer<
  typeof platformOAuthAdminProviderSchema
>;
export type PlatformOAuthAdminProviderList = z.infer<
  typeof platformOAuthAdminProviderListSchema
>;
export type PlatformOAuthAdminProviderMutation = z.infer<
  typeof platformOAuthAdminProviderMutationSchema
>;
export type PlatformOAuthAdminProviderDelete = z.infer<
  typeof platformOAuthAdminProviderDeleteSchema
>;
export type PlatformOAuthAdminError = z.infer<
  typeof platformOAuthAdminErrorSchema
>;
export type PlatformOAuthAdminConflictError = z.infer<
  typeof platformOAuthAdminConflictErrorSchema
>;
export type PlatformOAuthAdminHttpError = z.infer<
  typeof platformOAuthAdminHttpErrorSchema
>;
