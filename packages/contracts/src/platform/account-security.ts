import { z } from "zod"
import { successEnvelope } from "../common.js"

// 已登录账号的安全中心线契约：改密码、登录设备列表与吊销、OAuth 绑定列表与解绑。
// 与 platform/index.ts 的会话/资料契约分开，子路径与文件一一对应。

// 设备列表只投影“这是哪台设备”所需的字段。三个哈希列
// （token_hash / previous_token_hash / csrf_hash）是会话持有者凭据，
// 不在 schema 里；strict() 让任何越界字段在两端都直接解析失败。
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
  .strict()

export const platformSessionListResponseSchema = successEnvelope({
  sessions: z.array(platformSessionDeviceSchema).max(200),
}).strict()

export const platformSessionRevocationResponseSchema = successEnvelope({
  revokedSessionCount: z.number().int().safe().nonnegative(),
}).strict()

// 已绑定的第三方登录。provider_subject 是用户在第三方的内部标识，
// 画界面用不到它，所以它既不在这里，也不在服务端的投影记录里。
export const platformOAuthLinkSchema = z
  .object({
    /** 库内 provider 主键，同时是解绑端点的路径段。 */
    provider: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    /** provider 的展示名，来自 platform_oauth_providers.display_name。 */
    providerName: z.string().min(1).max(80),
    /** provider 当前是否可用于登录；停用的绑定不算一种登录方式。 */
    enabled: z.boolean(),
    /** 用户在该 provider 的显示名与头像，库内以空串表示“没有”。 */
    accountName: z.string().min(1).max(200).nullable(),
    avatarUrl: z.string().min(1).max(2048).nullable(),
    linkedAt: z.number().int().safe().nonnegative(),
    /**
     * 这一条能否被解绑。判据与服务端删除语句里的守卫同源：前端自己重算
     * 必然会漏掉 enabled 这一维，所以由后端直接给出答案。
     */
    removable: z.boolean(),
  })
  .strict()

// 这是「我有哪些登录方式」的完整答案，而不只是第三方绑定列表。密码算一种，
// 所以它和 links 一起返回：服务端为了算 removable 本来就要查凭据，不暴露
// 出来只会逼前端拿 409 当探测手段。
export const platformOAuthLinkListResponseSchema = successEnvelope({
  links: z.array(platformOAuthLinkSchema).max(64),
  /** 账号是否设有邮箱密码。OAuth-only 账号没有，改密码表单对它无意义。 */
  passwordEnabled: z.boolean(),
}).strict()

export const platformOAuthUnlinkResponseSchema = successEnvelope({
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
}).strict()

export const platformPasswordChangeResponseSchema = successEnvelope({
  revokedSessionCount: z.number().int().safe().nonnegative(),
  // Cookie 客户端从 Set-Cookie 拿到轮换后的令牌；打包客户端没有 cookie jar，
  // 只能从响应体取，和登录/刷新的处理一致。
  accessToken: z.string().min(1).optional(),
  refreshToken: z.string().min(1).optional(),
}).strict()

export type PlatformSessionDevice = z.infer<typeof platformSessionDeviceSchema>
export type PlatformSessionListResponse = z.infer<
  typeof platformSessionListResponseSchema
>
export type PlatformSessionRevocationResponse = z.infer<
  typeof platformSessionRevocationResponseSchema
>
export type PlatformPasswordChangeResponse = z.infer<
  typeof platformPasswordChangeResponseSchema
>
export type PlatformOAuthLink = z.infer<typeof platformOAuthLinkSchema>
export type PlatformOAuthLinkListResponse = z.infer<
  typeof platformOAuthLinkListResponseSchema
>
export type PlatformOAuthUnlinkResponse = z.infer<
  typeof platformOAuthUnlinkResponseSchema
>
