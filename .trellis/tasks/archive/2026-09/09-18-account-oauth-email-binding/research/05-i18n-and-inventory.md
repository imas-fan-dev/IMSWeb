# 05 - i18n 结构与可复用/需新增清单

范围：`apps/web/app/i18n/resources.ts`。末段汇总全部调研。
标记：`[事实]` = 代码；`[推断]` = 判断。

## 1. i18n 结构

`[事实]` `resources.ts`：`export const resources = {`（`:4`）→ locale
`"zh-CN"`（`:5`）/ `en`（`:407`）→ namespace `common`（`:6`）等；
`platformAccount` zh `:97` / en `:499`；`platformAccount.security` zh `:236` / en `:649`；
`platformAccount.security.oauth` zh `:292` / en `:710`。
另有 `platformAuth.oauth`（zh `:377` / en `:798`），那是登录/注册页文案。
**所有 key 必须两个 locale 都有**，zh 块在前、en 块在后，键名逐字对应。

`[事实]` 现有 `platformAccount.security.oauth` 键：
`title`（第三方帐号）、`description`（已绑定的第三方登录方式。）、
`loading`（正在载入第三方帐号）、`empty`（还没有绑定任何第三方帐号。）、
`loadFailed`（第三方帐号载入失败，请重试。）、`linkedAtLabel`（绑定时间）、
`disabledBadge`（已停用）、`unlink`（解绑）、`unlinking`（正在解绑）、
`unlinkLabel`（解绑 {{provider}}）、`unlinked`（{{provider}} 已解绑。）、
`unlinkFailed`（解绑失败，请稍后重试。）、`notFound`（该绑定已经不存在。）、
`lastLoginMethod`（末位凭据提示）、`lastLoginMethodHint`（唯一可用的登录方式，无法解绑）。
插值只有 `{{provider}}`；`sessions` 分区用 `{{count}}` / `{{device}}`。

## 2. 新增绑定文案规则

`[推断]`：
1. 位置放 `platformAccount.security.oauth.*`，不是 `platformAuth.oauth.*`。
2. camelCase，与 `unlink / unlinking / unlinkLabel / unlinked / unlinkFailed` 对称：
   建议 `link` / `linking` / `linkLabel` / `linked` / `linkFailed` /
   `alreadyLinked` / `identityConflict` / `unavailable`。
3. zh 与 en 各写一处，顺序对齐 zh 块。
4. 优先复用既有：目标邮箱占用可复用 `platformAuth.emailRegistered`（zh `:373` / en `:794`）；
   限流复用 `platformAccount.security.password.rateLimited`（zh `:261` / en `:679`）；
   末位凭据复用 `oauth.lastLoginMethod`。需要更具体文案再在 `oauth` 下新增。

## 3. 可复用函数清单（全链路）

OAuth 侧：
`listProviders`（`infra/oauth/platform-oauth-client.ts:194`）、
`createAuthorizationUrl`（`:307`）、`exchangeAuthorizationCode`（`:354`）、
`findOAuthIdentity`（`platform-account-repository.ts:541`）、
`listOAuthIdentitiesByAccount`（`:575`）、`deleteOAuthIdentity`（`:604`）、
模块私有的 `createPkcePair`（`oauth-login.ts:41`）/`hashValue`（`:36`）/
`safeReturnPath`（`:22`）/`configuredProvider`（`:58`）、
`platformSecurityEvent`（`contracts/session.ts`）、
state 表 `platform_oauth_states`（`0020:70`，已含 `intent='link'` 与 `linking_account_id`）。

邮箱侧：
`createPlatformEmailVerificationCode`（`email-verification.ts:4`）、
`createPlatformEmailDeliveryIdentityToken`（`contracts/email-delivery.ts:3`）、
`platformEmailJobPayloadCipher.encrypt`（端口 `ports/email-delivery.ts:44`）、
`queue.enqueueRegistration`（`:89`）、
`read/mark/clearPlatformEmailVerificationCooldown`（`email-verification-cache.ts:59/:92/:116`）、
`withBoundedCacheOperation`（`utils/cache/bounded-operation`）、
`matchesCurrentPlatformPassword`（`password/current-password.ts:16`，PRD ER5 换绑要用的二次校验）、
私有 `isEmailConflict`（`platform-account-repository.ts:169`）、
`findEmailCredentialByAccountId`（`:1161`）、
`createVerifiedEmailAccount`（`:821`，「消费码 + 写凭据」事务模板）。

Web 侧：
`getPlatformOAuthProviders`（`endpoints/platform/index.ts:140`，未绑定 provider 来源）、
`getPlatformOAuthLinks`（`:337`）、`unlinkPlatformOAuthLink`（`:352`）、
`parsed`（`lib/api/parsed.ts:47`）、`withPlatformAuth` / `withPlatformCsrf`（`lib/api/types.ts`）、
`platformOAuthLinkViews`（`oauth-links/oauth-link-view.ts:43`）、
`platformAuthOAuthPath` / `platformApiPath`（`contracts/src/paths.ts:56 / 48`）、
`platformAuth` / `activePlatformMutation` / `platformCsrf`
（`middleware/hono-auth.ts:297/:306/:305`）、
`platformOAuthLinkRateLimit`（`middleware/platform-mutation-limit.ts:40`）、
`platformPasswordRateLimit`（`:36`）。

## 4. 需要新增的清单

契约 `packages/contracts/src/platform/account-security.ts`：
OAuth 绑定请求/响应 schema（若走 GET start + 重定向可能只需错误码）；
邮箱绑定/换绑 schema（补绑 `{email, code, newPassword}`，换绑 `{email, code, currentPassword}`）；
精确响应、不 transform；新错误码 `PLATFORM_OAUTH_LINK_ALREADY_BOUND`、
`PLATFORM_OAUTH_IDENTITY_CONFLICT`、`PLATFORM_EMAIL_CONFLICT`、
`PLATFORM_EMAIL_VERIFICATION_INVALID`（`[推断]`）。

仓储（`platform-account-repository.ts` + `ports/repositories/platform.ts`）：
`createOAuthLinkState`、`consumeOAuthLinkState`、
`createOAuthIdentityForAccount`（只插 identity，区分两类冲突）、
`createVerifiedEmailCredentialForAccount`、`migrateEmailCredentialForAccount`；
把 `isEmailConflict` 扩展到 `platform_email_credentials_account_id_key`；
`NewPlatformOAuthStateInput.intent` 扩为 `"login" | "link"`（`platform.ts:160-168`）。
（`[事实]` 现有 UPDATE 均不写 `normalized_email`，见 `03-repository-primitives.md`。）

API 域/handler：
OAuth 绑定 start handler（带 `platformAuth`）、绑定 callback handler
（`[推断]` 建议复用匿名 callback 按 state `intent` 分流，避免两个 redirect URI）、
邮箱验证码发送 handler、邮箱绑定/换绑提交 handler、
新 hash 域 `hashPlatformEmailBindingCode`（前缀如 `'platform-email-binding\0'`）、
新 `PlatformSecurityEventType`（现有见 `ports/repositories/platform.ts:272-282`，无绑定项）。

可选（若新增邮件 purpose）：
`PlatformEmailDeliveryPurpose` 加项（`ports/email-delivery.ts:3`）；
两条 migration 的 purpose CHECK（`20260913120000_...sql:61-63`、`20260913130000_...sql:14`）；
`PlatformEmailJobPayload` 联合、payload 白名单（`platform-email-job-payload.ts:36/:60/:74`）；
SMTP 文案（`platform-email-service.ts:472-478`）。
`[推断]` 时间有限时可先用 registration purpose + 新 hash 域，代价是邮件主题不准确、共享冷却桶。

Web：
`endpoints/platform/index.ts` 新端点 + re-export；
`oauth-link-section.tsx` 拉 `getPlatformOAuthProviders()` 与 `links` 求差集、渲染未绑定行与绑定按钮、
受 `readOnly` 约束；`account-security-model.ts` 新错误谓词；
新增邮箱区块（复用 `password-section.tsx` 表单与错误映射模式）；
`resources.ts` zh + en 新键。

## 5. 明确「不存在」的实现

`[事实]` 不存在，勿假设已有：`createOAuthIdentity`（只插 identity）；
OAuth 绑定 start/callback；`intent='link'` 的任何写入或消费；
改写 `platform_email_credentials.normalized_email` 的 SQL；
给已有账号插 credential 的原语；邮箱绑定用途的 hash 域；
`platformAccount.security.email` i18n 分区；绑定专用队列/purpose。

## 6. 结论摘要

- `[事实]` OAuth 绑定可复用 provider 配置、PKCE/state 机制、
  `exchangeAuthorizationCode`、`findOAuthIdentity`，以及表里已备的 `intent`/`linking_account_id`；
  但 state 创建/消费与 identity 写入三条原语必须新增，且须避开登录专用的
  `createOAuthAccount` 与 `establishPlatformSession`。
- `[事实]` 邮箱验证码机制可复用，关键是独立 hash 域 + 「消费码 + 写已有账号凭据」原语；
  `isEmailConflict` 可借但需暴露并覆盖 `account_id` 唯一约束。
- `[事实]` 换绑保留密码 hash 没有现成原语：`normalized_email` 是 PK，现有 UPDATE 都不碰它。
- `[事实]` Web OAuth 区块目前只渲染已绑定项，新增绑定必须引入 `getPlatformOAuthProviders()` 求差集。
- `[推断]` 最省改动的 OAuth 回调方案是共用现有匿名 callback，按 state `intent` 分流。
