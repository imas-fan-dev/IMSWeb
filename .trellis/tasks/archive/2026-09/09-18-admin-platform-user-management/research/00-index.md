# 管理端平台用户管理 · 调研索引

任务：`.trellis/tasks/09-18-admin-platform-user-management`（PRD 见 `../prd.md`）。
分篇：`01-admin-auth-and-routing.md`、`02-audit-write-pattern.md`、`03-platform-account-repository-gaps.md`、`04-admin-page-patterns.md`、`05-admin-contracts-pattern.md`、`06-admin-route-registration.md`。

标注约定：**[事实]** = 源码直接可读；**[推断]** = 我的归纳或建议。

---

## 关键结论速览

**[事实]**

- 管理端路由范式：`registerXxxRoutes(app)` + `adminApiPath()` + 中间件链 `backofficeAuth → opOnly → superAdminOnly → [backofficeCsrf] → validator → handler`（`apps/api/src/domains/admin/admin-accounts/routes.ts:25-57`；`apps/api/src/app.ts:262-278`）。
- 审计表叫 `logs`，字段仅 `id/username/producername/action/target/ip/time`，无枚举、无 result 列；`writeAudit(c, action, target)` 尽力而为、吞异常（`apps/api/src/domains/admin/audit/write-audit.ts:5-22`；`apps/api/migrations/postgresql/0001_initial_compatibility.sql:30-38`）。
- 平台帐号仓储**没有**检索/列表方法，**没有**改 `status` 的方法，**没有**不带 keepSession 的批量吊销方法（`apps/api/src/ports/repositories/platform.ts:310-418`）。
- `PlatformAccountStatus = active | restricted | suspended | deleted`；禁用应写 `status='suspended'`，不碰 `deleted_at`（`0020_platform_accounts.sql:5-13`）。
- `token_version` 是「让全部 access token 立即失效」的机制（`apps/api/src/middleware/hono-auth.ts:97-111`）；「吊销 refresh 会话」是另一半。
- 管理端页面无 DataTable、无 Pagination 组件；表格与分页都要手写（`apps/web/app/pages/admin/accounts/index.tsx`、`apps/web/app/pages/admin/cards/index.tsx:228-400`）。
- 契约 admin 前缀 + strict 请求 + `numberedPageInfoSchema` 分页；新增 schema 需三处同步（`packages/contracts/README.md:40-46, 76-84`）。
- 新增 admin 页面只需改 `route-metadata.ts` + 建页面 + 加 `admin-layout.tsx` 导航；`routes.ts` 与 SPA fallback 自动覆盖（`apps/web/app/routes.ts:33-45`；`route-metadata.ts:460-489`）。

**[事实] 不存在**：`platform-users` / `platformUsers` / `admin/platform/users` 检索、`listPlatformAccounts`、`searchPlatformAccounts`、`findAccountByEmail`、`findAccountByUsername` 在 `apps` / `packages` 下均无命中。

---

## A. 需要新增的仓储方法

落点：`apps/api/src/ports/repositories/platform.ts`（`PlatformAccountRepository`，:310）+ `apps/api/src/infra/db/repositories/platform-account-repository.ts`。

| # | 方法（建议签名） | 用途 | 依据 |
| --- | --- | --- | --- |
| A1 | `listPlatformAccountsForAdmin(input: { query; field: 'id'\|'email'\|'display_name'; limit; offset })` | 按 ID / 邮箱 / 显示名分页检索；投影含 `id, status, display_name, normalized_email, has_password, created_at, updated_at, last_seen_at, active_session_count`，**不含任何 token/csrf hash** | `03-...md` §4.1；无现有方法 |
| A2 | `countPlatformAccountsForAdmin(input)` | 与 A1 同条件的总数，供 `numberedPageInfoSchema` | 同上 |
| A3 | `setPlatformAccountStatus(input: { accountId; status: 'active'\|'suspended'; expectedUpdatedAt?; updatedAt })` | 禁用/启用；事务内可选 bump `token_version` + 吊销会话 | `03-...md` §4.2；全仓库无 `SET status=` |
| A4 | `revokeAllRefreshSessions(input: { accountId; revokedAt; event })` | 强制下线（管理端无自己的会话可保留） | `03-...md` §4.3；现有仅 `revokeAllRefreshSessionsExcept`（port:407） |
| A5 | `countActivePlatformRefreshSessions(accountId, activeAt): Promise<number>` | 详情「活跃会话数」，避免拉出含 `token_hash` 的 200 行 | `03-...md` §4.6；`listRefreshSessionsByAccount` 会带 hash |
| A6 | `findLastPlatformLoginAt(accountId): Promise<number \| null>`（或并入 A1 聚合） | 详情「最近登录」 | `03-...md` §4.6；无 last_login 列/方法 |
| A7 | `findPlatformAccountAdminDetail(accountId)`（或给 A1 行带 `normalized_email`） | 详情需要 email + profile 同时出现且不含 `password_hash` | `03-...md` §4.6；`findEmailIdentity` 带 hash，`findAccountWithProfileById` 无 email |

**复用即可，不要新增**：`deleteOAuthIdentity`（已含末位凭据保护，port:333 / impl:604）、`findEmailCredentialByAccountId`（判 `hasPassword`，impl:1161，注意别外泄 hash）、`listOAuthIdentitiesByAccount`（port:324 / impl:575）、`completePasswordReset`（port:349）。

**需要重构（非仓储）**：把 `handlePlatformPasswordResetVerification` 内联的「生成码 + cooldown + enqueue」抽成可复用函数供管理端调用（`apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts:49-186`）。

---

## B. 需要新增的契约 schema

落点（建议）：新建 `packages/contracts/src/platform/admin-users.ts`，前缀 `adminPlatformUser*`（与 `platform/admin-email.ts` 的 `adminPlatformEmail*` 对称）。

| # | schema | 说明 |
| --- | --- | --- |
| B1 | `adminPlatformUserIdParamsSchema` | `strictRequestObject({ id })` |
| B2 | `adminPlatformUserListQuerySchema` | `strictRequestObject({ query, field, page, pageSize })` |
| B3 | `adminPlatformUserSchema` | 列表行：`id, status, displayName, email(nullable), hasPassword, createdAt, updatedAt, activeSessionCount, lastSeenAt(nullable)` |
| B4 | `adminPlatformUserListSchema` | `successEnvelope({ users: array, pageInfo: numberedPageInfoSchema }).strict()` |
| B5 | `adminPlatformUserDetailSchema` | 账号 + profile + `hasPassword` + OAuth links + `activeSessionCount` + `lastLoginAt`（**禁止 token/csrf hash**） |
| B6 | `adminPlatformUserDetailResponseSchema` | `successEnvelope({ user: detail }).strict()` |
| B7 | `adminPlatformUserStatusRequestSchema` | `strictRequestObject({ status: 'active'\|'suspended', expectedUpdatedAt })` |
| B8 | `adminPlatformUserOAuthProviderParamsSchema` | `strictRequestObject({ id, provider })` |
| B9 | 处置响应 schema | `adminPlatformUserMutationResponseSchema`（状态变更）、`adminPlatformUserSessionRevocationResponseSchema`（`{ revokedSessionCount }`）、`adminPlatformUserPasswordResetResponseSchema`（`{ queued, retryAfterSeconds }`）、`adminPlatformUserOAuthUnlinkResponseSchema` |
| B10 | 错误 schema | `adminPlatformUserErrorSchema`、`adminPlatformUserConflictErrorSchema`（`REVISION_CONFLICT`）、末位凭据错误（如 `code:'PLATFORM_OAUTH_LAST_LOGIN_METHOD'`）、`adminPlatformUserHttpErrorSchema = union([...B10, platformMiddlewareErrorSchema])` |

**同步改动**：`packages/contracts/package.json` 的 `exports` 加 `"./platform/admin-users"`；`packages/contracts/src/index.ts` 加 `export * as platformAdminUsers`；`entrypoints.json`；对应 endpoint 与 HTTP 一致性测试（`README.md:76-84`）。

---

## C. 需要新增的 API 端点

落点（建议）：新建 `apps/api/src/domains/admin/platform-users/routes.ts` + `handlers/`，前缀 `adminApiPath('/platform/users')`，在 `apps/api/src/app.ts:268`（`registerAdminAccountRoutes`）附近注册 `registerAdminPlatformUserRoutes(app)`。

| # | 端点 | 中间件链 | Handler 职责 |
| --- | --- | --- | --- |
| C1 | `GET /api/admin/platform/users` | `backofficeAuth, opOnly, superAdminOnly` + `querySchemaValidator(B2)` | A1+A2 → B4 |
| C2 | `GET /api/admin/platform/users/:id` | 同上 + `paramSchemaValidator(B1)` | A5+A6+A7 + `listOAuthIdentitiesByAccount` → B5/B6 |
| C3 | `PUT /api/admin/platform/users/:id/status` | + `backofficeCsrf` + `jsonSchemaValidator(B7)` | A3（可选 bump token_version）→ B9；`writeAudit` |
| C4 | `DELETE /api/admin/platform/users/:id/sessions` | + `backofficeCsrf` + `paramSchemaValidator(B1)` | A4 → B9；`writeAudit`；幂等（重复执行返回 0） |
| C5 | `POST /api/admin/platform/users/:id/password-reset` | + `backofficeCsrf` + `paramSchemaValidator(B1)` | 复用抽取后的 issue 函数 → B9；`writeAudit` |
| C6 | `DELETE /api/admin/platform/users/:id/oauth-links/:provider` | + `backofficeCsrf` + `paramSchemaValidator(B8)` | `deleteOAuthIdentity` → B9；末位凭据回 B10 业务错误；`writeAudit` |

**[推断]** 所有处置动作都需 `await writeAudit(c, <动作>, <目标>)`；是否用 `superAdminOnly` 对全部动作一致，需产品确认（现有改他人凭据的接口全部 super_admin）。

---

## D. 需要新增的 Web 页面文件

| # | 文件 | 说明 |
| --- | --- | --- |
| D1 | 新建 `apps/web/app/pages/admin/platform-users/index.tsx` | 检索 + 分页列表 + 处置按钮；照抄 cards 的 URL 参数分页与 `useConfirmAction` |
| D2 | 可选 `apps/web/app/pages/admin/platform-users/user-detail-page.tsx` | 详情页（若不用抽屉/对话框） |
| D3 | 可选 `apps/web/app/pages/admin/platform-users/components/` | 处置对话框、OAuth 绑定列表等 |
| D4 | 新建 `apps/web/app/lib/api/endpoints/platform/admin-users.ts` | `adminApiClient` + `parsed(schema, { errorSchema, meta: withBackofficeAuth()\|withBackofficeCsrf() })` |
| D5 | 编辑 `apps/web/app/lib/api/endpoints/index.ts` | 加 `export * from "./platform/admin-users"` |
| D6 | 编辑 `apps/web/app/route-metadata.ts` | 在 `platform/email`（:437-443）后插 `route("platform/users", "pages/admin/platform-users/index.tsx", "admin", WEB_TARGET, "spa")` |
| D7 | 编辑 `apps/web/app/layouts/admin-layout.tsx` | `navigation` 数组（:52-170）加一项，`superOnly: true` |

**[事实]** 无现成 Pagination / DataTable 组件；也不要新增对 `react-router` `Link` / `useNavigate` 的直接使用（用 `NavigationLink` / `useNavigation`，见 `06-...md` §3）。
