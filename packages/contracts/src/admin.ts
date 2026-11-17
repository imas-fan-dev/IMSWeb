import { z } from "zod"
import {
  errorResponseSchema,
  exactJsonError,
  exactJsonResponse,
  failureMessageResponseSchema,
  legacyStripRequestObject,
  messageErrorResponseSchema,
  successEnvelope,
  successFlagSchema,
} from "./common.js"

export const adminRoleSchema = z.enum(["admin", "super_admin"])

export const adminLoginRequestSchema = legacyStripRequestObject({
  username: z.string(),
  password: z.string(),
})

export const adminCreateAccountRequestSchema = legacyStripRequestObject({
  username: z.unknown().optional(),
  producername: z.unknown().optional(),
  password: z.unknown().optional(),
})

export const adminAccountIdParamsSchema = legacyStripRequestObject({
  id: z.string(),
})

export const adminLoginSuccessResponseSchema = exactJsonResponse({
  success: z.literal(true),
  token: z.string(),
  username: z.string(),
  producername: z.string().nullable(),
  dept: z.string(),
  adminRole: adminRoleSchema.nullable(),
})

export const adminLoginInvalidRequestErrorResponseSchema = exactJsonError({
  success: z.literal(false),
  message: z.literal("用户名或密码格式错误"),
})

export const adminLoginInvalidCredentialsErrorResponseSchema = exactJsonError({
  success: z.literal(false),
  message: z.literal("用户名或密码错误"),
})

export const adminLegacyOperatorLoginErrorResponseSchema = exactJsonError({
  success: z.literal(false),
  message: z.literal("当前账号没有管理工作台权限"),
})

export const adminBackofficeFailureResponseSchema = failureMessageResponseSchema

export const adminLoginErrorResponseSchema = z.union([
  adminLoginInvalidRequestErrorResponseSchema,
  adminLoginInvalidCredentialsErrorResponseSchema,
  adminLegacyOperatorLoginErrorResponseSchema,
  errorResponseSchema,
])

export const adminBackofficeSessionUserSchema = exactJsonResponse({
  id: z.number().int().positive(),
  username: z.string(),
  producername: z.string(),
  dept: z.string(),
  adminRole: adminRoleSchema.nullable().optional(),
  csrfSecret: z.string(),
  jti: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.literal("imsweb").optional(),
  aud: z.literal("ims-backoffice").optional(),
  kind: z.literal("backoffice").optional(),
})

export const adminSessionSchema = successEnvelope({
  user: adminBackofficeSessionUserSchema,
})

export const adminSessionErrorResponseSchema = z.union([
  exactJsonError({ success: z.literal(false), message: z.literal("未登录") }),
  exactJsonError({ success: z.literal(false), message: z.literal("token无效") }),
])

export const adminSessionHttpErrorResponseSchema = z.union([
  adminSessionErrorResponseSchema,
  errorResponseSchema,
])

export const adminRefreshUserSchema = exactJsonResponse({
  id: z.number().int().positive(),
  username: z.string(),
  producername: z.string(),
  dept: z.string(),
  adminRole: adminRoleSchema.nullable(),
})

export const adminRefreshSuccessResponseSchema = successEnvelope({
  user: adminRefreshUserSchema,
})

export const adminRefreshErrorResponseSchema = z.union([
  exactJsonError({ success: z.literal(false), message: z.literal("刷新令牌无效") }),
  exactJsonError({ success: z.literal(false), message: z.literal("刷新令牌已失效") }),
  exactJsonError({ success: z.literal(false), message: z.literal("CSRF token invalid") }),
])

export const adminLogoutSuccessResponseSchema = successFlagSchema

export const adminLogoutErrorResponseSchema = exactJsonError({
  success: z.literal(false),
  message: z.literal("CSRF token invalid"),
})

export const adminLogoutHttpErrorResponseSchema = z.union([
  adminLogoutErrorResponseSchema,
  adminSessionErrorResponseSchema,
  errorResponseSchema,
])

export const adminAccountSchema = exactJsonResponse({
  id: z.number().int().positive(),
  username: z.string(),
  producername: z.string(),
  adminRole: adminRoleSchema,
})

export const adminAccountListSchema = successEnvelope({
  accounts: z.array(adminAccountSchema),
})

export const adminAccountMutationSchema = successEnvelope({
  account: adminAccountSchema,
})

export const adminAccountErrorResponseSchema = failureMessageResponseSchema

export const adminAccountAuthorizationErrorResponseSchema = messageErrorResponseSchema

export const adminAccountEndpointErrorResponseSchema = z.union([
  adminSessionErrorResponseSchema,
  adminAccountAuthorizationErrorResponseSchema,
  adminAccountErrorResponseSchema,
  errorResponseSchema,
])

export const adminAuditLogSchema = exactJsonResponse({
  id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  username: z.string().nullable(),
  producername: z.string().nullable(),
  action: z.string().nullable(),
  target: z.string().nullable(),
  ip: z.string().nullable(),
  time: z.string().nullable(),
})

export const adminAuditLogListSchema = successEnvelope({
  data: z.array(adminAuditLogSchema),
})

export const adminAuditErrorResponseSchema = z.union([
  adminSessionErrorResponseSchema,
  adminAccountAuthorizationErrorResponseSchema,
])

export type AdminRole = z.infer<typeof adminRoleSchema>
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>
export type AdminCreateAccountRequest = z.infer<typeof adminCreateAccountRequestSchema>
export type AdminAccountIdParams = z.infer<typeof adminAccountIdParamsSchema>
export type AdminLoginSuccessResponse = z.infer<typeof adminLoginSuccessResponseSchema>
export type AdminBackofficeFailureResponse = z.infer<
  typeof adminBackofficeFailureResponseSchema
>
export type AdminLoginErrorResponse = z.infer<typeof adminLoginErrorResponseSchema>
export type AdminBackofficeSessionUser = z.infer<typeof adminBackofficeSessionUserSchema>
export type AdminSession = z.infer<typeof adminRefreshUserSchema>
export type AdminSessionResponse = z.infer<typeof adminSessionSchema>
export type AdminSessionErrorResponse = z.infer<typeof adminSessionErrorResponseSchema>
export type AdminSessionHttpErrorResponse = z.infer<
  typeof adminSessionHttpErrorResponseSchema
>
export type AdminRefreshUser = z.infer<typeof adminRefreshUserSchema>
export type AdminRefreshSuccessResponse = z.infer<typeof adminRefreshSuccessResponseSchema>
export type AdminRefreshErrorResponse = z.infer<typeof adminRefreshErrorResponseSchema>
export type AdminLogoutSuccessResponse = z.infer<typeof adminLogoutSuccessResponseSchema>
export type AdminLogoutErrorResponse = z.infer<typeof adminLogoutErrorResponseSchema>
export type AdminLogoutHttpErrorResponse = z.infer<
  typeof adminLogoutHttpErrorResponseSchema
>
export type AdminAccount = z.infer<typeof adminAccountSchema>
export type AdminAccountList = z.infer<typeof adminAccountListSchema>
export type AdminAccountMutation = z.infer<typeof adminAccountMutationSchema>
export type AdminAccountErrorResponse = z.infer<typeof adminAccountErrorResponseSchema>
export type AdminAccountAuthorizationErrorResponse = z.infer<
  typeof adminAccountAuthorizationErrorResponseSchema
>
export type AdminAccountEndpointErrorResponse = z.infer<
  typeof adminAccountEndpointErrorResponseSchema
>
export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>
export type AdminAuditLogList = z.infer<typeof adminAuditLogListSchema>
export type AdminAuditErrorResponse = z.infer<typeof adminAuditErrorResponseSchema>
