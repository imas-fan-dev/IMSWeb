# 01 - 现有 OAuth 登录全链路

范围：`domains/identity/platform-auth/oauth/`、`infra/oauth/`、
`platform-account-repository.ts`（state/identity）、migration `0020`、`20260818...`、`20260901...`。
标记：`[事实]` 出自代码；`[推断]` 是判断。

## 1. 路由

`[事实]` 公共 OAuth 前缀 `platformAuthOAuthPath()` = `/api/platform/auth/oauth`
（`platform-auth/routes.ts:24`、`packages/contracts/src/paths.ts:6`）；管理端
`/api/admin/platform/auth/oauth`（`routes.ts:25`、`paths.ts:7`）。

`[事实]` 公共路由（`oauth/routes.ts:34-49`），全部匿名、无 `platformAuth`：

| 方法 | 路径 | handler |
| --- | --- | --- |
| GET | `/providers` | `handlePlatformOAuthProviders`（`oauth-login.ts:68`） |
| GET | `/:provider/start` | `handlePlatformOAuthStart`（`:75`） |
| GET | `/:provider/callback` | `handlePlatformOAuthCallback`（`:104`） |

管理端 provider 配置：`oauth/routes.ts:52-91`，走 `backofficeAuth + superAdminOnly + backofficeCsrf`。

## 2. state 的创建与消费

`[事实]` 创建 `handlePlatformOAuthStart`（`oauth-login.ts:75-102`）：
`createPkcePair()`（`:41-50`）生成 state(`randomBytes(32) b64url`)、verifier(`48`)、
challenge(`sha256(verifier)`)；`createOAuthState` 入参（`:86-93`）为
`stateHash: hashValue(state)`（sha256，`:36`）、provider、`intent:'login'`（写死）、
`codeVerifier`、`returnPath`（`safeReturnPath`，`:22-34`）、
`expiresAt = createdAt + OAUTH_STATE_TTL_MS`；TTL 10 分钟（`:15`）。
随后 `createAuthorizationUrl`（`:95`）并 303 重定向。

`[事实]` 仓储 `createOAuthState`（`platform-account-repository.ts:498-521`）batch：
先删过期行，再 INSERT，`linking_account_id` 硬编码 `NULL`（`:508-519`）。
入参类型 `NewPlatformOAuthStateInput`（`ports/repositories/platform.ts:160-168`）
`intent` 字面量只有 `"login"`。

`[事实]` 消费 `consumeOAuthState`（`:524-539`）是
`DELETE ... WHERE state_hash=? AND provider_code=? AND intent='login' AND expires_at>? RETURNING`，
一次性删除，`intent='login'` 写死在 SQL。返回 `PlatformOAuthStateRecord`
（`platform.ts:149-158`）虽含 `intent`/`linking_account_id`，登录路径永远拿不到 `link`。
回调消费：`oauth-login.ts:118-123`，失败重定向 `expired`。

`[事实]` 表 `platform_oauth_states`（`0020_platform_accounts.sql:70-99`）已支持绑定：
`intent IN ('login','link')`、`linking_account_id ... ON DELETE CASCADE`，
且 CHECK 要求 `link → linking_account_id IS NOT NULL`。
但全仓库对 intent 的写入只有 `oauth-login.ts:89` 的 `'login'`，
`linking_account_id` 只出现在 INSERT 字面 `NULL`（`:508`）和 RETURNING（`:534`）。

`[推断]` 绑定无需改表；但 `createOAuthState`/`consumeOAuthState` 不可直接复用
（一个写死 `NULL`，一个写死 `intent='login'`），需新增 link 版或参数化。

## 3. provider 配置来源

`[事实]` 读路径 `services(c).platformOAuth`，实现 `ConfiguredPlatformOAuthClient`
（`infra/oauth/platform-oauth-client.ts:184`）：
`listProviders()`（`:194-206`）只返回 `configuredProvider(row)` 非空者，
产出 `{code, displayName, icon, buttonColor}`；
`configuredProvider`（`:443-490`）要求 `enabled && redirectUri` 且密文可解密；
`findConfiguredProvider`（`:436-441`）按 code 查。

`[事实]` 表 `platform_oauth_providers`：基础列 `0020:34-45`（`code` PK、`display_name`、`enabled`）；
动态列分两条 migration 加：
- `20260818010000_platform_oauth_configuration.sql:3-19`：`client_id_ciphertext`、
  `client_secret_ciphertext`、`redirect_uri`、`updated_at`
- `20260901140000_dynamic_platform_oauth_providers.sql:3-70`：`icon`、`button_color`、
  `authorization_endpoint`、`token_endpoint`、`user_info_endpoint`、`scopes_json`、
  `token_auth_method`、`pkce_enabled`、`profile_*_path`、`sort_order`

`[事实]` 仓储读写：`listOAuthProviderConfigs`（`platform-account-repository.ts:354`）、
`createOAuthProviderConfig`（`:371`）、`updateOAuthProviderConfig`（`:424`）、
`deleteOAuthProviderConfig`（`:475`）。管理端解析在 `oauth/request.ts`，绑定流程不需要。

`[事实]` provider code 是动态的：契约 `platformOAuthProviderCodeSchema`
（`packages/contracts/src/platform/index.ts:46-50`）只约束 `^[a-z][a-z0-9-]*$`，不枚举。

## 4. identity 何时被创建

`[事实]` 唯一创建路径在回调 `oauth-login.ts:130-160`：
`exchangeAuthorizationCode`（`client.ts:354`）→ `findOAuthIdentity(providerCode, subject)`（`:130`）；
若不存在则 `createOAuthAccount`（`:136`）。

`[事实]` `createOAuthAccount`（`platform-account-repository.ts:690-758`）一个 batch 插
`platform_accounts + platform_profiles + platform_oauth_identities`。
**没有独立的 `createOAuthIdentity`**；全仓库仅一处
`INSERT INTO platform_oauth_identities`（`:727`）。

`[事实]` 唯一约束（`0020:47-68`）：`PRIMARY KEY (provider_code, provider_subject)`、
`UNIQUE (account_id, provider_code)`。冲突经 `isOAuthIdentityConflict`（`:185-196`）识别后
返回 `{status:'identity-conflict', identity}`（`:743-750`），否则 `{status:'created', identity}`。
两种状态都带 identity，故 `oauth-login.ts:158-160` 无条件赋值是安全的。

`[事实]` 建会话是登录专用：`establishPlatformSession`（`oauth-login.ts:162`，
`contracts/session.ts`）。绑定不能用。
回调失败统一 `redirectToLogin(c, reason)`（`:52-56`），reason ∈
`unavailable|invalid|denied|expired|failed`，以 `?oauth=` 重定向 `/account/login`。

## 5. 复用结论

可直接复用（既有）：
`listProviders`（`client.ts:194`）、`createAuthorizationUrl`（`:307`）、
`exchangeAuthorizationCode`（`:354`）、`findOAuthIdentity`（repo `:541`）、
`listOAuthIdentitiesByAccount`（`:575`）、`deleteOAuthIdentity`（`:604`）、
state 表结构；`createPkcePair`/`hashValue`/`safeReturnPath`/`configuredProvider`
目前是 `oauth-login.ts` 模块私有，需提取或复制。

登录专用、绑定不可用（既有）：
`createOAuthAccount`（`:690`，会建账号）、`establishPlatformSession`、
`consumeOAuthState`（`:524`，写死 login）、`createOAuthState`（`:498`，写死 NULL）、
`handlePlatformOAuthCallback`（语义是登录）。

需新增（推断）：`createOAuthLinkState`、`consumeOAuthLinkState`、
`createOAuthIdentityForAccount`（只插 identity，区分两类唯一冲突）、
绑定回调 handler（读 `linking_account_id`、不建会话、写安全事件）、
绑定 start 路由（建议挂 `platformAuth + activePlatformMutation + platformCsrf +
platformOAuthLinkRateLimit`，天然拿 `claims.id`）。
`[推断]` 回调建议共用现有匿名 callback，按 state `intent` 分流，避免 provider 配两个 redirect URI。
`[事实]` `listProviders()` 只返回 enabled+configured，绑定入口也应据此过滤。
