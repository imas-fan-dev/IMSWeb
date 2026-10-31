import { z } from "../z.js";
import {
  numberedPageInfoSchema,
  successEnvelope,
  strictRequestObject,
} from "../common.js";
import {
  platformMiddlewareErrorSchema,
  platformOAuthProviderCodeSchema,
  platformRetryableAuthErrorSchema,
} from "./index.js";
import { platformOAuthLinkSchema } from "./account-security.js";

// Admin platform-user management reads and mutates platform_accounts, the
// consumer accounts. It is a separate module from the Backoffice admin-account
// contracts because the two account systems share neither IDs nor status.

export const adminPlatformUserIdParamsSchema = strictRequestObject({
  id: z.string().trim().min(1).max(128),
});

export const adminPlatformUserOAuthProviderParamsSchema = strictRequestObject({
  id: z.string().trim().min(1).max(128),
  provider: platformOAuthProviderCodeSchema,
});

// Query values stay strings; the domain request adapter parses and clamps them.
export const adminPlatformUserListQuerySchema = strictRequestObject({
  query: z.string().trim().min(1).max(320).optional(),
  field: z.enum(["id", "email", "display_name"]).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
});

export const adminPlatformUserStatusRequestSchema = strictRequestObject({
  status: z.enum(["active", "suspended"]),
  expectedUpdatedAt: z.number().int().safe().nonnegative(),
});

export const adminPlatformUserAccountStatusSchema = z.enum([
  "active",
  "restricted",
  "suspended",
  "deleted",
]);

// The projection deliberately omits token_version, deleted_at, and every
// credential hash; sessions surface only as a count.
export const adminPlatformUserSchema = z
  .object({
    id: z.string().min(1),
    status: adminPlatformUserAccountStatusSchema,
    displayName: z.string(),
    email: z.string().min(3).max(320).nullable(),
    hasPassword: z.boolean(),
    activeSessionCount: z.number().int().safe().nonnegative(),
    lastLoginAt: z.number().int().safe().nonnegative().nullable(),
    createdAt: z.number().int().safe().nonnegative(),
    updatedAt: z.number().int().safe().nonnegative(),
  })
  .strict();

export const adminPlatformUserListSchema = successEnvelope({
  users: z.array(adminPlatformUserSchema).max(50),
  pageInfo: numberedPageInfoSchema,
}).strict();

export const adminPlatformUserDetailSchema = adminPlatformUserSchema
  .extend({
    oauthLinks: z.array(platformOAuthLinkSchema).max(64),
  })
  .strict();

export const adminPlatformUserDetailResponseSchema = successEnvelope({
  user: adminPlatformUserDetailSchema,
}).strict();

export const adminPlatformUserStatusResponseSchema = successEnvelope({
  user: adminPlatformUserSchema,
}).strict();

export const adminPlatformUserSessionRevocationResponseSchema = successEnvelope(
  {
    revokedSessionCount: z.number().int().safe().nonnegative(),
  },
).strict();

export const adminPlatformUserPasswordResetResponseSchema = successEnvelope({
  queued: z.literal(true),
  retryAfterSeconds: z.number().int().min(1).max(600),
}).strict();

export const adminPlatformUserOAuthUnlinkResponseSchema = successEnvelope({
  provider: platformOAuthProviderCodeSchema,
}).strict();

export const adminPlatformUserErrorSchema = z
  .object({ success: z.literal(false).optional(), message: z.string() })
  .strict();

export const adminPlatformUserNotFoundErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_USER_NOT_FOUND"),
  })
  .strict();

export const adminPlatformUserConflictErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("REVISION_CONFLICT"),
    user: adminPlatformUserSchema,
  })
  .strict();

export const adminPlatformUserStatusUnsupportedErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_USER_STATUS_UNSUPPORTED"),
  })
  .strict();

export const adminPlatformUserOAuthLinkNotFoundErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_OAUTH_LINK_NOT_FOUND"),
  })
  .strict();

export const adminPlatformUserLastLoginMethodErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_OAUTH_LAST_LOGIN_METHOD"),
  })
  .strict();

export const adminPlatformUserPasswordResetUnavailableErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE"),
  })
  .strict();

export const adminPlatformUserSuspendedErrorSchema = z
  .object({
    success: z.literal(false),
    code: z.literal("PLATFORM_USER_SUSPENDED"),
  })
  .strict();

export const adminPlatformUserHttpErrorSchema = z.union([
  adminPlatformUserErrorSchema,
  adminPlatformUserNotFoundErrorSchema,
  adminPlatformUserConflictErrorSchema,
  adminPlatformUserStatusUnsupportedErrorSchema,
  adminPlatformUserOAuthLinkNotFoundErrorSchema,
  adminPlatformUserLastLoginMethodErrorSchema,
  adminPlatformUserPasswordResetUnavailableErrorSchema,
  adminPlatformUserSuspendedErrorSchema,
  platformRetryableAuthErrorSchema,
  platformMiddlewareErrorSchema,
]);

export type AdminPlatformUserIdParams = z.infer<
  typeof adminPlatformUserIdParamsSchema
>;
export type AdminPlatformUserOAuthProviderParams = z.infer<
  typeof adminPlatformUserOAuthProviderParamsSchema
>;
export type AdminPlatformUserListQuery = z.infer<
  typeof adminPlatformUserListQuerySchema
>;
export type AdminPlatformUserStatusRequest = z.infer<
  typeof adminPlatformUserStatusRequestSchema
>;
export type AdminPlatformUserAccountStatus = z.infer<
  typeof adminPlatformUserAccountStatusSchema
>;
export type AdminPlatformUser = z.infer<typeof adminPlatformUserSchema>;
export type AdminPlatformUserList = z.infer<typeof adminPlatformUserListSchema>;
export type AdminPlatformUserDetail = z.infer<
  typeof adminPlatformUserDetailSchema
>;
export type AdminPlatformUserDetailResponse = z.infer<
  typeof adminPlatformUserDetailResponseSchema
>;
export type AdminPlatformUserStatusResponse = z.infer<
  typeof adminPlatformUserStatusResponseSchema
>;
export type AdminPlatformUserSessionRevocationResponse = z.infer<
  typeof adminPlatformUserSessionRevocationResponseSchema
>;
export type AdminPlatformUserPasswordResetResponse = z.infer<
  typeof adminPlatformUserPasswordResetResponseSchema
>;
export type AdminPlatformUserOAuthUnlinkResponse = z.infer<
  typeof adminPlatformUserOAuthUnlinkResponseSchema
>;
export type AdminPlatformUserError = z.infer<
  typeof adminPlatformUserErrorSchema
>;
export type AdminPlatformUserNotFoundError = z.infer<
  typeof adminPlatformUserNotFoundErrorSchema
>;
export type AdminPlatformUserConflictError = z.infer<
  typeof adminPlatformUserConflictErrorSchema
>;
export type AdminPlatformUserStatusUnsupportedError = z.infer<
  typeof adminPlatformUserStatusUnsupportedErrorSchema
>;
export type AdminPlatformUserOAuthLinkNotFoundError = z.infer<
  typeof adminPlatformUserOAuthLinkNotFoundErrorSchema
>;
export type AdminPlatformUserLastLoginMethodError = z.infer<
  typeof adminPlatformUserLastLoginMethodErrorSchema
>;
export type AdminPlatformUserPasswordResetUnavailableError = z.infer<
  typeof adminPlatformUserPasswordResetUnavailableErrorSchema
>;
export type AdminPlatformUserSuspendedError = z.infer<
  typeof adminPlatformUserSuspendedErrorSchema
>;
export type AdminPlatformUserHttpError = z.infer<
  typeof adminPlatformUserHttpErrorSchema
>;
