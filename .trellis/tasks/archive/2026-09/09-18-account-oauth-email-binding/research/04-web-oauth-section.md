# 04 - Web 端 OAuth 区块与端点的现状

调研范围：`apps/web/app/pages/account/security/oauth-link-section.tsx`、
`account-security-model.ts`、`account-security-page.tsx`、
`apps/web/app/lib/api/endpoints/platform/index.ts`、`apps/web/app/lib/api/parsed.ts`、
`apps/web/app/pages/account/components/account-auth-form.tsx`（对照）。

---

## 1. 现有 OAuth 区块怎么工作

`[事实]` `OAuthLinkSection`（`oauth-link-section.tsx:28`）：

- 挂载时 `getPlatformOAuthLinks().send()`（`:51-67`），结果 `setLinks(result.links)`（`:55`）。
- 同时把 `result.passwordEnabled` 通过 `onLoginMethodsLoaded` 上报给父组件（`:59`）。
- 渲染分支（`:120-154`）：loading（`:122`）→ loadFailed（`:130`）→
  `entries.length === 0`（`:145`，纯文本 empty 提示）→ 列表。
- 每一行渲染 provider 名、`disabledBadge`、账号名、绑定时间（`:157-192`）。
- 解绑按钮 `disabled={readOnly || !link.removable || pendingProvider !== null}`（`:199-203`），
  `onClick={() => void unlink(link)}`（`:205`）。
- unlink 成功/失败后 `setReloadToken` 重读列表（`:83-88`），不本地 patch。

`[事实]` **关键缺口：区块只知道「已绑定」的 provider。**
它没有任何地方调用 `getPlatformOAuthProviders()`，也不持有 enabled provider 列表，
所以现在无法渲染「未绑定（可绑定）」的行。空状态（`:145`）也只是文案，没有绑定入口。

`[事实]` 对照：登录表单 `account-auth-form.tsx` 才使用 provider 列表——
`account-auth-form.tsx:134` 调 `getPlatformOAuthProviders()`，`:880-910` 渲染 provider 按钮，
链接指向 `platformAuthOAuthPath('/${provider.code}/start?returnPath=...')`（`:892-894`）。

---

## 2. 错误如何映射为文案

`[事实]` `account-security-model.ts` 的谓词统一匹配 `status + code`（`model.ts:11-13`）：

- `isCurrentPasswordInvalid`（`:23`，403 `PLATFORM_PASSWORD_CURRENT_INVALID`）
- `isPasswordInputInvalid`（`:27`、400）
- `isPasswordUnchanged`（`:31`、400）
- `isPasswordUnavailable`（`:41`、409）
- `isPasswordConflict`（`:45`、409）
- `isLastLoginMethod`（`:52`、409 `PLATFORM_OAUTH_LAST_LOGIN_METHOD`）
- `isSessionNotFound`（`:56`、404）
- `isOAuthLinkNotFound`（`:58`、404 `PLATFORM_OAUTH_LINK_NOT_FOUND`）
- `isRateLimited`（`:66`、任意 429）

`[事实]` 区块里的映射（`oauth-link-section.tsx:88-96`）：
`isLastLoginMethod` → `oauth.lastLoginMethod`；
`isOAuthLinkNotFound` → `oauth.notFound`；
`isRateLimited` → `password.rateLimited`（复用密码分区的限流文案）；
else → `oauth.unlinkFailed`。

`[事实]` 成功反馈用 `oauth.unlinked`（`:81-85`）。

---

## 3. `parsed(...)` 契约校验在端点上怎么用

`[事实]` `parsed`（`apps/web/app/lib/api/parsed.ts:47`）用共享 schema `safeParse`，
并额外做 `hasExactJsonStructure` 精确结构检查（`:72-80`），失败抛
`ApiError({kind:'contract', code:'CONTRACT_VIOLATION'})`；同时在 meta 里打 `parsed: true`（`:53-57`）。

`[事实]` account-security 相关端点的写法：

| 端点 | 位置 | schema | meta |
| --- | --- | --- | --- |
| `getPlatformOAuthLinks` | `index.ts:337-345` | `platformOAuthLinkListResponseSchema` | `withPlatformAuth()` |
| `unlinkPlatformOAuthLink` | `index.ts:352-362` | `platformOAuthUnlinkResponseSchema` | `withPlatformCsrf()` |
| `changePlatformPassword` | `index.ts:291-300` | `platformPasswordChangeResponseSchema` | `withPlatformCsrf()` |
| `getPlatformSessionDevices` | `index.ts:302-310` | `platformSessionListResponseSchema` | `withPlatformAuth()` |

`[事实]` error schema 统一用 `platformAccountSecurityErrorSchema`
（`index.ts:25` 导入；它等于 `platformHttpErrorSchema`，见
`packages/contracts/src/platform/account-security.ts:47`）。

`[事实]` 写操作先做 zod `.parse`（如 `unlinkPlatformOAuthLink` 里
`platformOAuthLinkParamsSchema.shape.provider.parse(provider)`，`index.ts:353`），
再交给 `parsed` 校验响应。

`[事实]` 这些端点由 `apps/web/app/lib/api/index.ts:2` 的 `export * from "./endpoints"` 对外导出。

---

## 4. 现有契约 schema

`[事实]` `packages/contracts/src/platform/account-security.ts`：

- `platformOAuthLinkRouteParamsSchema`（`:39-41`）—— 不 trim 的路径参数，用于「空格必须是 missing link」。
- `platformOAuthLinkParamsSchema`（`:43-45`）—— 严格 provider code。
- `platformOAuthLinkSchema`（`:69-79`）—— `{provider, providerName, enabled, accountName,
  avatarUrl, linkedAt, removable}`，`.strict()`。
- `platformOAuthLinkListResponseSchema`（`:81-84`）—— `successEnvelope({links, passwordEnabled})`。
- `platformOAuthUnlinkResponseSchema`（`:86-88`）—— `successEnvelope({provider})`。
- `platformPasswordChangeRequestSchema`（`:9-20`）—— 已含 `currentPassword`（PRD ER5 要用的模式）。

`[事实]` 路径前缀来自 `packages/contracts/src/paths.ts`：
`platformApiPath()`（`:48`）用于 `/me/*`，`platformAuthOAuthPath()`（`:56`）用于 `/api/platform/auth/oauth/*`。

---

## 5. 新增绑定入口需要改哪些文件

### 必改（既有事实 + 推断）

| 文件 | 改动 |
| --- | --- |
| `packages/contracts/src/platform/account-security.ts` | 新增绑定相关请求/响应 schema（strict / 精确），如 `platformOAuthLinkStartResponseSchema` 或 `platformOAuthLinkResponseSchema`；若走重定向，可能只需错误码常量 |
| `apps/api/src/domains/identity/platform-account-security/oauth-links/routes.ts` | 新增绑定 start / callback 路由，挂 `platformAuth + activePlatformMutation + platformCsrf + platformOAuthLinkRateLimit`（PRD ER10） |
| `apps/api/src/domains/identity/platform-account-security/oauth-links/handlers/*` | 新增绑定 handler（start 与 callback） |
| `apps/api/src/domains/identity/platform-account-security/oauth-links/request.ts` | 若新增路径/查询参数校验 |
| `apps/api/src/infra/db/repositories/platform-account-repository.ts` | 新增 `createOAuthLinkState` / `consumeOAuthLinkState` / `createOAuthIdentityForAccount` |
| `apps/api/src/ports/repositories/platform.ts` | 对应入参/结果类型；`NewPlatformOAuthStateInput` 的 intent 联合 |
| `apps/web/app/lib/api/endpoints/platform/index.ts` | 新增绑定端点函数 + 在 `:63-73` 附近补齐 re-export |
| `apps/web/app/pages/account/security/oauth-link-section.tsx` | 拉取 enabled provider 列表并与 `links` 做差集，渲染「未绑定（可绑定）」行；新增绑定按钮与错误映射 |
| `apps/web/app/pages/account/security/account-security-model.ts` | 新增绑定错误谓词（如 `isOAuthIdentityConflict`、`isEmailConflict`） |
| `apps/web/app/i18n/resources.ts` | zh + en 两个 locale 的 `platformAccount.security.oauth` 新增键 |

### 可能不改（推断）

- `packages/contracts/src/paths.ts`：如果绑定 start 复用
  `platformAuthOAuthPath('/:provider/start')` 或 `platformApiPath('/me/oauth-links')`，
  则不需要新前缀。`[推断]` 更干净的做法是新增一个 `/me/oauth-links/:provider/start`，
  因为它天然带会话且复用账号安全的中间件链；此时路径可继续用 `platformApiPath` 拼装，
  无需改 `paths.ts`。

### 绑定 callback 的位置问题（推断）

`[事实]` 现有 callback 是匿名的 `GET /api/platform/auth/oauth/:provider/callback`，
且 handler 直接建会话。绑定回调有两种落法：

1. **复用同一 callback 路由**，在 handler 内按 state 的 `intent` 分流：
   `login` 走原逻辑，`link` 走新逻辑（读 `linking_account_id`、不建会话）。
   好处是 provider 只需配置一个 redirect URI；坏处是公共 handler 职责变复杂。
2. **新增独立 callback 路由**，但这要求每个 provider 配置两个 redirect URI，
   与 `platform_oauth_providers.redirect_uri` 单列（`20260818010000_platform_oauth_configuration.sql:10-11`）冲突。

`[推断]` 方案 1 更现实：provider 只登记一个回调地址，绑定与登录共用回调，
靠 state 的 `intent`/`linking_account_id` 区分。

---

## 6. 页面装配

`[事实]` `account-security-page.tsx:177-180` 渲染 `<OAuthLinkSection readOnly={...}
onLoginMethodsLoaded={...} />`。`readOnly` 来自
`platform.status === "restricted"`（`:150`）。受限账号可以看列表但不能写
（`:150-153` 注释：domain 内每个写操作都过 `activePlatformMutation`，会被拒）。

`[推断]` 新增绑定入口时，未绑定行的绑定按钮也应受同一 `readOnly` 约束。
