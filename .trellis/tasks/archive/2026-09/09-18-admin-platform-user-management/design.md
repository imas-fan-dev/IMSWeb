# 管理端平台用户帐号管理 · 技术设计

任务：`.trellis/tasks/09-18-admin-platform-user-management`（PRD 见 `prd.md`）。
上游子任务：`.trellis/tasks/09-18-account-oauth-email-binding`（唯一依赖是它的末位凭据判定不得被本任务改坏；本任务复用既有 `deleteOAuthIdentity`，不重复实现）。

已拍板的产品前提（直接采用）：动作集 = 检索/查看 + 禁用/启用 + 强制下线 + 触发密码重置 + 解绑 OAuth provider（受末位凭据保护）；不做删除帐号，不做管理端改邮箱；不改 `backoffice_accounts`；每个处置动作写审计；响应绝不泄露 `token_hash` / `previous_token_hash` / `csrf_hash`。

---

## 1. 现状与约束

### 1.1 后台域与路由范式

- 后台只有三类能力：`admin-accounts`、`backoffice-auth`、`audit`。注册点在 `apps/api/src/app.ts:267-268`（`registerPlatformAccountSecurityRoutes`、`registerAdminAccountRoutes`）与 `:278`（`registerAuditRoutes`）。域目录受 `apps/api/scripts/checks/hono-architecture.js:559-580` 的分类表约束。
- 最完整的管理端路由范式在 `apps/api/src/domains/admin/admin-accounts/routes.ts:25-57`：`backofficeAuth → opOnly → superAdminOnly → [backofficeCsrf] → validator → handler`，路径全部走 `adminApiPath()`。
- handler 从 context 取操作者：`const actor = c.get('backofficeUser')!`（`apps/api/src/domains/admin/admin-accounts/handlers/delete-admin-account.ts:18`）。
- 角色门实现：`requireOp`（`apps/api/src/middleware/hono-auth.ts:172-178`，只看 token）、`requireSuperAdmin`（`:202-222`，查库确认 `dept==='op' && admin_role==='super_admin'`）、`protectBackofficeCsrf`（`:224-252`，GET/HEAD/OPTIONS 与 Bearer 跳过）。

### 1.2 审计

- `writeAudit(c, action, target)` 在 `apps/api/src/domains/admin/audit/write-audit.ts:5-22`，`await` 但整段 `try/catch` 吞异常，失败只 `console.error`。
- 表名是 `logs`，字段只有 `id/username/producername/action/target/ip/time`（`apps/api/migrations/postgresql/0001_initial_compatibility.sql:30-38`）。没有 result 列，`action` 是自由字符串，没有 CHECK 枚举。
- 读端契约只投影这六个字段（`apps/api/src/domains/admin/audit/response.ts:36-48`、`packages/contracts/src/admin.ts:148-157`）。

### 1.3 平台帐号仓储

- 状态枚举 `PlatformAccountStatus = active | restricted | suspended | deleted`（`apps/api/src/ports/repositories/platform.ts:9-14`），DB CHECK 绑定 `deleted_at`：`CHECK ((status='deleted') = (deleted_at IS NOT NULL))`（`apps/api/migrations/postgresql/0020_platform_accounts.sql:13`）。禁用写 `suspended`，不碰 `deleted_at`。
- 端口 `PlatformAccountRepository` 在 `apps/api/src/ports/repositories/platform.ts:310`。没有分页检索，没有任何 `SET status=`，没有不带 `keepSessionId` 的批量吊销。
- 可复用不改的：`listOAuthIdentitiesByAccount`（port:324 / impl `platform-account-repository.ts:575`，投影已剥离 `provider_subject`）、`deleteOAuthIdentity`（port:333 / impl:604，末位凭据判定写在 DELETE 的 WHERE 里）、`findEmailCredentialByAccountId`（port:355 / impl:1161）、`completePasswordReset`（port:349）。
- 事务与串行：`private serializeWrite`（impl:308）是实例级写串行队列，`database.batch([...])` 是同一批次（多语句原子提交）。`updatePasswordForAccount` 用 `EXISTS(...)` fence 保证批次内「前一步已生效」，可照抄（impl:1204-1240）。
- 现状两条 `UPDATE platform_accounts SET token_version=token_version+1`：`completePasswordReset`（impl:1059-1071）与 `updatePasswordForAccount`（impl:1227-1240）。没有任何 `SET status=`。

### 1.4 强制下线的两个机制

- `token_version` 是 access token 立即失效的开关：`authenticatePlatformRequest` 比对 `identity.account.token_version !== claims.tokenVersion` 即吊销该会话并回 401（`apps/api/src/middleware/hono-auth.ts:97-111`）；refresh token 也内嵌版本（`apps/api/src/domains/identity/platform-auth/contracts/session.ts:110-121`）。
- 吊销 refresh 会话只覆盖 refresh 通道。要被「立即失效」，必须同时 bump `token_version`，否则 access token 在 15 分钟 TTL 内仍可用（`PLATFORM_ACCESS_TOKEN_TTL_SECONDS`）。

### 1.5 密码重置签发逻辑不可复用

- 发信逻辑内联在 `apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts:34-139`：读冷却 → 生成码 → `enqueuePasswordReset` → 写冷却 → 回 202/429/503。仓储侧不需要新方法，但这段必须先抽成函数，管理端才能调用。

### 1.6 Web 现状

- 分页检索范式：`apps/web/app/pages/admin/cards/index.tsx:52-110`（`useSearchParams` + `useEffect` + `changePage`），上一页/下一页在 `:375-400`。没有 `Pagination` / `DataTable` 组件。
- 危险确认：`useConfirmAction`（`apps/web/app/pages/admin/hooks/use-confirm-action.ts`）+ `ConfirmActionDialog`（`apps/web/app/components/shared/confirm-action-dialog.tsx`）。
- 页头/面板/空态：`~/components/admin/admin-ui`（`AdminPageHeader` / `AdminPanel` / `AdminEmptyState`）。
- super_admin 页内兜底：`apps/web/app/pages/admin/accounts/index.tsx:378-417`。
- 路由登记只需三处：`apps/web/app/route-metadata.ts:437-443` 附近插 descriptor、建页面文件、`apps/web/app/layouts/admin-layout.tsx:143-164` 加导航项（`superOnly` 过滤在 `:456`）。`routes.ts` 与 SPA fallback 自动接管（`apps/web/app/routes.ts:38-45`）。
- 路由清单数量被断言：`apps/web/tests/unit/routes.test.ts:64` 固定 51 条。

### 1.7 契约约束

- zod 只在 `packages/contracts` 内声明；应用侧只能 `@imsweb/contracts/z`。请求 schema 默认 strict，响应 schema 精确（不 coerce / transform / default / strip）。
- 新模块要同步四处：源文件、`packages/contracts/package.json` 的 `exports`、`packages/contracts/src/index.ts` 的 camelCase 命名空间、`packages/contracts/README.md` 的模块清单。另有 `packages/contracts/entrypoints.json`（由 `scripts/check-entrypoints.mjs` 校验）。
- 管理端分页照抄 `packages/contracts/src/namecards.ts:62-65` 的 `successEnvelope({ data, pageInfo: numberedPageInfoSchema })`（`packages/contracts/src/common.ts:73-79`）。
- 错误联合照抄 `packages/contracts/src/platform/admin-email.ts:77-95`，`platformMiddlewareErrorSchema` 从兄弟核心模块 `./index.js` 取（`packages/contracts/src/platform/index.ts:187`）。

---

## 2. 方案选择与取舍

### 决策 A：审计「结果」怎么表达 → 不迁移，恒定动作词表 + 结构化 target，权威结果另存 `platform_security_events`

选项：

1. 给 `logs` 加 `result TEXT` 列。
2. 把结果编进 `action` / `target` 字符串（零迁移）。

结论：**选 2**。

理由：

- 「可检索」不依赖新列。给 5 个处置动作定义模块级字符串常量（`禁用平台用户` / `启用平台用户` / `强制下线平台用户` / `触发平台用户密码重置` / `解绑平台用户 OAuth`），并按 `logs.action` 查询即可精确命中；`target` 采用稳定形式 `platform_user=<id>;result=<token>`，结果作为可枚举 token 出现（`suspended` / `reactivated` / `sessions_revoked` / `reset_queued` / `oauth_unlinked` / `oauth_unlink_refused_last_credential`），不做 JSON 编码，避免 `listRecentAuditLogs` 的 `SELECT *` 语义变复杂。
- 真正结构化的结果写进 `platform_security_events`：`deleteOAuthIdentity`（impl:604）和新的 `setPlatformAccountStatus` / `forceLogoutPlatformAccount` 在业务事务内写 `event_type` + `metadata_json`。帐号侧「发生了什么」可结构化查询，`logs` 只承担「谁操作的」。
- 加列要跨 5 处：迁移、`AuditLogInput`（port:85-90）、`audit-repository.ts:11-28`、`audit/response.ts:36-48`、`adminAuditLogSchema`（`packages/contracts/src/admin.ts:148-157`），还要动 32 个现有 `writeAudit` 调用点的测试。为一个对现有调用永远为 NULL 的字段付这个代价不合理。
- 已知代价：`writeAudit` 吞异常，所以 `logs` 只能尽力而为。AR7 的「结果」由 `platform_security_events` 的事务写入兜底，`logs` 是操作者轨迹。这个取舍写进注释，若将来审计报表成为硬需求，再单独评估加列。
- 噪声控制：只在动作被接受或按策略拒绝时写 `logs`；404 / 参数非法 / 冲突（`REVISION_CONFLICT`）/ 冷却不写，满足 AC9。

### 决策 B：权限粒度 → 读与写统一 `super_admin`

选项：

1. 读 `op`、写 `super_admin`（两级）。
2. 全部 `backofficeAuth → opOnly → superAdminOnly`（与 `admin-accounts` 一致）。

结论：**选 2**。

理由：

- 读接口暴露全量用户 PII（邮箱、OAuth provider、登录时间）与批量翻页能力，等于一个全网用户导出口。`op` 是普通运营身份，把整库读取交给它超范围。
- 现有两个同类管理端能力的读接口都在 `super_admin`：`admin-accounts` 的列表（`admin-accounts/routes.ts:25-30`）和平台 OAuth/邮件配置的 GET（`email-settings/routes.ts:14`）。保持一致，不引入新的权限语义。
- 两级方案需要先定义「读角色」并同步导航可见性与前端兜底，PRD 没有这个要求，属于自造范围。
- `requireSuperAdmin` 每次查库（`hono-auth.ts:202-222`）的成本与同类路由相同，不是新增性能类别。`opOnly` 在这条链里被 `superAdminOnly` 的 `dept==='op'` 覆盖，属于冗余，但保留它可与 `admin-accounts` 逐字对齐，减少读者困惑。

写操作在链尾追加 `backofficeCsrf`。

### 其他取舍

- 新建 API 域 `admin/platform-users`，不并入 `admin-accounts`。后者管理 `backoffice_accounts`，ID 是 `number`；前者管理 `platform_accounts`，ID 是 `string`，仓储、状态机、错误码完全不同。合并会让两套「账号」类型撞名。
- 契约落在 `packages/contracts/src/platform/admin-users.ts`，前缀 `adminPlatformUser*`，与 `admin-email.ts` 的 `adminPlatformEmail*` 对称。不并入根 `admin.ts`（那里是 `backoffice_accounts` 语义，且违反多来源域 public 先于 admin 的直觉）。
- 「详情」不新增独立读方法：详情就是对 ID 的精确检索，直接复用 `listPlatformAccountsForAdmin({ field: 'id', limit: 1 })`，减少一套 SQL。会话只回计数，不回会话行，从源头消除 hash 泄漏面。
- OAuth 链接的 `removable` 复用身份域已有的 `platformOAuthLinkViews`（`apps/api/src/domains/identity/platform-account-security/oauth-links/oauth-link-view.ts`）与其自带的判定。不复制谓词，否则会和 `deleteOAuthIdentity` 的 DELETE 守卫产生漂移（该文件注释已把它标成同源双生子）。跨域引用是允许的（同类先例：多个域引用 `domains/admin/audit/write-audit`）。
- 详情走列表页内对话框，不加第二条 Web 路由。PRD 只要求「查看详情」，列表页已有大部分字段，缺的只有 OAuth 链接列表。
- 状态变更用 `expectedUpdatedAt` 乐观锁，与 `UpdatePlatformProfileTextInput`（port:205-214）和 `adminPlatformEmailConfigurationWriteRequestSchema` 一致，对外表现是 `REVISION_CONFLICT`。

---

## 3. 边界与契约

文件：`packages/contracts/src/platform/admin-users.ts`（新建）。
导入来源：`successEnvelope` / `numberedPageInfoSchema` / `strictRequestObject` 来自 `../common.js`；`platformMiddlewareErrorSchema` / `platformOAuthProviderCodeSchema` / `platformRetryableAuthErrorSchema` 来自 `./index.js`；`platformOAuthLinkSchema` 来自 `./account-security.js`；`z` 来自 `../z.js`。

### 3.1 请求 schema（全部 strict）

| schema | 形状 |
| --- | --- |
| `adminPlatformUserIdParamsSchema` | `{ id: z.string().trim().min(1).max(128) }`（对齐 DB 的 `length(id) BETWEEN 1 AND 128`） |
| `adminPlatformUserOAuthProviderParamsSchema` | `{ id, provider: platformOAuthProviderCodeSchema }` |
| `adminPlatformUserListQuerySchema` | `{ query?: string.trim().min(1).max(320), field?: enum('id','email','display_name'), page?: /^\d+$/, pageSize?: /^\d+$/ }` |
| `adminPlatformUserStatusRequestSchema` | `{ status: enum('active','suspended'), expectedUpdatedAt: int().safe().nonnegative() }` |

查询串保留字符串形态，整数与默认值由域内 request 模块处理（`data-and-errors.md` 要求业务 coercion 归域内）。邮箱检索的大小写归一也在域内。

### 3.2 响应 schema（全部精确）

| schema | 形状 |
| --- | --- |
| `adminPlatformUserAccountStatusSchema` | `enum('active','restricted','suspended','deleted')`，管理端可见四值 |
| `adminPlatformUserSchema` | `{ id, status, displayName, email: string\|null, hasPassword: boolean, activeSessionCount: int, lastLoginAt: int\|null, createdAt, updatedAt }` |
| `adminPlatformUserListSchema` | `successEnvelope({ users: array(adminPlatformUserSchema).max(50), pageInfo: numberedPageInfoSchema })` |
| `adminPlatformUserDetailSchema` | `adminPlatformUserSchema.extend({ oauthLinks: array(platformOAuthLinkSchema).max(64) })` |
| `adminPlatformUserDetailResponseSchema` | `successEnvelope({ user: adminPlatformUserDetailSchema })` |
| `adminPlatformUserStatusResponseSchema` | `successEnvelope({ user: adminPlatformUserSchema })` |
| `adminPlatformUserSessionRevocationResponseSchema` | `successEnvelope({ revokedSessionCount: int.nonnegative() })` |
| `adminPlatformUserPasswordResetResponseSchema` | `successEnvelope({ queued: literal(true), retryAfterSeconds: int.min(1).max(600) })` |
| `adminPlatformUserOAuthUnlinkResponseSchema` | `successEnvelope({ provider: platformOAuthProviderCodeSchema })` |

`email` / `lastLoginAt` 用 `null` 表达缺失。响应里没有 `token_version`、`deleted_at`，也没有任何 hash 字段。

### 3.3 错误 schema

| schema | 内容 |
| --- | --- |
| `adminPlatformUserErrorSchema` | `{ success?: false, message: string }`，通用 message 形 |
| `adminPlatformUserNotFoundErrorSchema` | `{ success: false, code: 'PLATFORM_USER_NOT_FOUND' }` |
| `adminPlatformUserConflictErrorSchema` | `{ success: false, code: 'REVISION_CONFLICT', user: adminPlatformUserSchema }` |
| `adminPlatformUserStatusUnsupportedErrorSchema` | `{ success: false, code: 'PLATFORM_USER_STATUS_UNSUPPORTED' }` |
| `adminPlatformUserOAuthLinkNotFoundErrorSchema` | `{ success: false, code: 'PLATFORM_OAUTH_LINK_NOT_FOUND' }` |
| `adminPlatformUserLastLoginMethodErrorSchema` | `{ success: false, code: 'PLATFORM_OAUTH_LAST_LOGIN_METHOD' }` |
| `adminPlatformUserPasswordResetUnavailableErrorSchema` | `{ success: false, code: 'PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE' }` |
| `adminPlatformUserSuspendedErrorSchema` | `{ success: false, code: 'PLATFORM_USER_SUSPENDED' }` |
| `adminPlatformUserHttpErrorSchema` | `union(上面全部 + platformRetryableAuthErrorSchema + platformMiddlewareErrorSchema)` |

`platformRetryableAuthErrorSchema`（`platform/index.ts:183-185`）覆盖密码重置冷却的 429 `{ success: false, code: 'PLATFORM_PASSWORD_RESET_COOLDOWN', retryAfterSeconds }`。

### 3.4 导出同步点

1. `packages/contracts/src/platform/admin-users.ts`（新建）。
2. `packages/contracts/package.json` 的 `exports` 加 `"./platform/admin-users"`，与 `"./platform/admin-email"` 同构。
3. `packages/contracts/src/index.ts` 加 `export * as platformAdminUsers from "./platform/admin-users.js"`。
4. `packages/contracts/entrypoints.json` 加 `{ "subpath": "./platform/admin-users", "source": "src/platform/admin-users.ts", "namespace": "platformAdminUsers", "runtime": "schema" }`。
5. `packages/contracts/README.md` 的 `platform/` 段加一行 `admin-users.ts`。
6. `apps/web/app/lib/api/endpoints/index.ts` 加 `export * from "./platform/admin-users"`。

---

## 4. 端点清单

前缀 `adminApiPath('/platform/users')` → `/api/admin/platform/users`。路径不加新的 prefix builder，`/platform/users` 属于 `adminApiPath` 下的业务后缀（与 `adminApiPath('/accounts')` 同理），`adminApiPath` 已在 Web 允许的 path builder 集合内（`scripts/check-source-rules.mjs:24-43`）。

| # | 方法 + 路径 | 中间件链 | 请求 | 成功响应 | 错误 |
| --- | --- | --- | --- | --- | --- |
| C1 | `GET /api/admin/platform/users` | `backofficeAuth, opOnly, superAdminOnly, querySchemaValidator(listQuery)` | `?query&field&page&pageSize` | 200 `adminPlatformUserListSchema` | 400 `{error}`；401/403 |
| C2 | `GET /api/admin/platform/users/:id` | `backofficeAuth, opOnly, superAdminOnly, paramSchemaValidator(idParams)` | 路径 id | 200 `adminPlatformUserDetailResponseSchema` | 404 `PLATFORM_USER_NOT_FOUND`；400；401/403 |
| C3 | `PUT /api/admin/platform/users/:id/status` | `+ backofficeCsrf + jsonSchemaValidator(statusRequest)` | `{ status, expectedUpdatedAt }` | 200 `adminPlatformUserStatusResponseSchema` | 404；409 `REVISION_CONFLICT`（附最新 user）；409 `PLATFORM_USER_STATUS_UNSUPPORTED`；400；401/403 |
| C4 | `DELETE /api/admin/platform/users/:id/sessions` | `+ backofficeCsrf + paramSchemaValidator(idParams)` | 路径 id | 200 `adminPlatformUserSessionRevocationResponseSchema`（幂等，重复执行 `revokedSessionCount: 0`） | 404；400；401/403 |
| C5 | `POST /api/admin/platform/users/:id/password-reset` | `+ backofficeCsrf + paramSchemaValidator(idParams)` | 路径 id | 202 `adminPlatformUserPasswordResetResponseSchema` | 404；409 `PLATFORM_USER_SUSPENDED`；409 `PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE`；429 冷却；503 服务不可用；400；401/403 |
| C6 | `DELETE /api/admin/platform/users/:id/oauth-links/:provider` | `+ backofficeCsrf + paramSchemaValidator(providerParams)` | 路径 id + provider | 200 `adminPlatformUserOAuthUnlinkResponseSchema` | 404 `PLATFORM_OAUTH_LINK_NOT_FOUND`；409 `PLATFORM_OAUTH_LAST_LOGIN_METHOD`；400；401/403 |

语义说明：

- C3 的 `active` 只允许从 `suspended` 转；`restricted` 是平台风控态，管理端不得清成 `active`，回 `PLATFORM_USER_STATUS_UNSUPPORTED`。`deleted` 帐号不在检索范围（见下），因此不会走到这里。
- C3 幂等：目标状态等于当前状态时不写库、不 bump、不写审计，直接回 200 + 当前记录。
- C4 幂等：第二次调用 `revokedSessionCount: 0`，仍 bump `token_version`（无副作用）。
- C5 只对 `active` / `restricted` 放行，`suspended` 要求先启用（`completePasswordReset` 只接受 `IN ('active','restricted')`，impl:1002-1008）。无邮箱凭据的帐号回 `PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE`。
- C6 的 `provider` 与 `auth.oauth.unlinked` 事件由 `deleteOAuthIdentity` 事务内写（impl:604-692），管理端再补一条 `logs`。
- 所有列表与检索都排除 `deleted_at IS NOT NULL` 的帐号。

审计动作与结果 token：

| 端点 | `action` | `target` 的 result |
| --- | --- | --- |
| C3 禁用 | `禁用平台用户` | `suspended` |
| C3 启用 | `启用平台用户` | `reactivated` |
| C4 | `强制下线平台用户` | `sessions_revoked` |
| C5 | `触发平台用户密码重置` | `reset_queued` |
| C6 成功 | `解绑平台用户 OAuth` | `oauth_unlinked` |
| C6 末位凭据拒绝 | `解绑平台用户 OAuth` | `oauth_unlink_refused_last_credential` |

---

## 5. 仓库层

落点：`apps/api/src/ports/repositories/platform.ts`（接口与记录类型）+ `apps/api/src/infra/db/repositories/platform-account-repository.ts`（SQL）。所有写方法用 `this.serializeWrite`，写与审计事件放同一 `this.database.batch([...])`。

### 5.1 新记录与类型

```ts
export type PlatformAccountAdminSearchField = 'id' | 'email' | 'display_name';

export interface PlatformAccountAdminRecord {
    id: string;
    status: PlatformAccountStatus;
    display_name: string;
    normalized_email: string | null;
    has_password: boolean;
    active_session_count: number;
    last_login_at: number | null;
    created_at: number;
    updated_at: number;
}
```

### 5.2 `listPlatformAccountsForAdmin`

```ts
listPlatformAccountsForAdmin(input: {
    field: PlatformAccountAdminSearchField;
    query: string | null;
    limit: number;      // 1..50，由域适配器夹紧
    offset: number;
    activeAt: number;   // 与 listRefreshSessionsByAccount 一致，由调用方给时钟
}): Promise<PlatformAccountAdminRecord[]>;
```

SQL 要点：

- FROM `platform_accounts accounts` JOIN `platform_profiles profiles` LEFT JOIN `platform_email_credentials credential`。
- `has_password` = `credential.account_id IS NOT NULL`；`normalized_email` 取 credential 列；绝不 SELECT `password_hash` / `salt` / `parameters_json`。
- `active_session_count` = 子查询 `COUNT(*) FROM platform_refresh_sessions WHERE account_id=accounts.id AND revoked_at IS NULL AND expires_at > ?`。
- `last_login_at` = 子查询 `MAX(COALESCE(last_seen_at, created_at)) FROM platform_refresh_sessions WHERE account_id=accounts.id`。
- 过滤：`accounts.deleted_at IS NULL` 恒定；`field='id'` → `accounts.id = ?`；`field='email'` → `credential.normalized_email = ?`（调用方已小写归一）；`field='display_name'` → `profiles.display_name ILIKE ? ESCAPE '\'`，通配符 `%` `_` `\` 由域内纯函数转义。
- 排序 `ORDER BY accounts.created_at DESC, accounts.id ASC`，`LIMIT ? OFFSET ?`。
- 不返回会话行，因此投影里根本没有 `token_hash` / `previous_token_hash` / `csrf_hash` 可以泄漏。

### 5.3 `countPlatformAccountsForAdmin`

```ts
countPlatformAccountsForAdmin(input: {
    field: PlatformAccountAdminSearchField;
    query: string | null;
}): Promise<number>;
```

与 5.2 同 FROM/WHERE 的 `COUNT(*)`。分页页信息由 handler 计算：`totalPages = Math.ceil(total / pageSize)`，`hasNextPage = page < totalPages`。

### 5.4 `setPlatformAccountStatus`

```ts
setPlatformAccountStatus(input: {
    accountId: string;
    status: 'active' | 'suspended';
    expectedUpdatedAt: number;
    updatedAt: number;
    event: PlatformSecurityEventInput;   // event.accountId === accountId
}): Promise<
    | { status: 'saved'; changed: boolean; account: PlatformAccountAdminRecord }
    | { status: 'not-found' }
    | { status: 'conflict'; account: PlatformAccountAdminRecord }
    | { status: 'unsupported'; account: PlatformAccountAdminRecord }
>;
```

事务内步骤（`serializeWrite` + 单次 `database.batch`）：

1. 读当前行（含 `updated_at`、`status`、`deleted_at`）。无行或 `deleted_at` 非空 → `not-found`。
2. `expectedUpdatedAt !== updated_at` → 读最新投影，回 `conflict`。
3. 当前状态等于目标 → 读投影，回 `saved` + `changed: false`。
4. 目标 `active` 而当前 `restricted` → 读投影，回 `unsupported`。
5. 批次（仅 `changed` 时）：
   a. `INSERT INTO platform_security_events ... SELECT ... WHERE EXISTS (SELECT 1 FROM platform_accounts WHERE id=? AND updated_at=?)`，事件类型同下。
   b. `UPDATE platform_accounts SET status=?, token_version = token_version + CASE WHEN ?='suspended' THEN 1 ELSE 0 END, updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL AND status IN (...)`。`deleted_at` 不动。
   c. 目标 `suspended` 时才有的 `UPDATE platform_refresh_sessions SET revoked_at=?, updated_at=? WHERE account_id=? AND revoked_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM platform_accounts WHERE id=? AND status='suspended' AND updated_at=?)`。这一步的 fence 抄 `updatePasswordForAccount` 的 `applied` 谓词（impl:1204-1240），保证状态没落到 `suspended` 时不会误撤会话。
6. 回读投影作为返回值（复用 5.2 的投影 SQL，抽成私有方法即可）。

安全事件：`suspended` 用 `auth.account_blocked` + `metadataJson { reason: 'suspended_by_admin' }`；`active` 用 `auth.account.reactivated` + `{ reason: 'reactivated_by_admin' }`。后者需加入 `PlatformSecurityEventType` 联合（port:272-285）；DB 的 `event_type` CHECK 只是正则 `^[a-z][a-z0-9._-]*$`，加值不需要迁移。

### 5.5 `forceLogoutPlatformAccount`

```ts
forceLogoutPlatformAccount(input: {
    accountId: string;
    revokedAt: number;
    event: PlatformSecurityEventInput;
}): Promise<
    | { status: 'saved'; revokedSessionCount: number }
    | { status: 'not-found' }
>;
```

批次：

1. `INSERT INTO platform_security_events ... SELECT ... WHERE EXISTS (SELECT 1 FROM platform_accounts WHERE id=? AND deleted_at IS NULL)`，事件 `auth.session.revoked` + `{ reason: 'revoked_by_admin' }`。
2. `UPDATE platform_accounts SET token_version=token_version+1, updated_at=? WHERE id=? AND deleted_at IS NULL`。
3. `UPDATE platform_refresh_sessions SET revoked_at=?, updated_at=? WHERE account_id=? AND revoked_at IS NULL AND expires_at>? AND EXISTS (SELECT 1 FROM platform_accounts WHERE id=? AND updated_at=?)`。`meta.changes` 即 `revokedSessionCount`。

步骤 2 影响 0 行 → `not-found`。不保留 `keepSession`：管理端没有自己的平台会话。

---

## 6. 数据与迁移

**不新增迁移。** 理由：

- 禁用写既有的 `status='suspended'` 列，启用写 `active`，`deleted_at` 不动，满足 `0020_platform_accounts.sql:13` 的 CHECK。
- 强制下线用既有 `token_version` 与 `platform_refresh_sessions.revoked_at`。
- 状态与强制下线的事件走既有 `platform_security_events`，`event_type` 的正则允许新增值。
- 审计结果按决策 A 编码在既有 `logs.action` / `logs.target`。
- 新查询只读，且天然走 `platform_refresh_sessions_account_idx`（`0020_platform_accounts.sql`）与 `platform_email_credentials_account_idx`。列表检索对 `display_name` 的模糊匹配没有索引，但管理端流量低、结果集由 `LIMIT` 截断，先不加索引；若将来变慢，再单独评估 `pg_trgm`。

因此本任务没有需要回滚的 schema 变更，回滚点仅在代码层。

---

## 7. 关键不变量与并发安全

1. 末位凭据保护不重复实现。C6 原样调用 `deleteOAuthIdentity`，判定留在 DELETE 的 WHERE 里，并发解绑两个 provider 时不会互相看到「还有一个」而双双成功。
2. 禁用与强制下线是「bump `token_version`」与「吊销 refresh 会话」两件事，必须在同一 `database.batch` 内完成。只撤会话会留下 15 分钟内可用的 access token；只 bump 会让 refresh 会话短暂存活到下次访问才被吊销。
3. 谁先谁后不影响正确性，但顺序固定为 **先状态/版本，后撤会话**，且撤会话语句用 `EXISTS(... status=... AND updated_at=...)` fence 挂在状态写入上。这样状态因并发改成别的值而落空时，会话不会被误撤。
4. 登录与禁用竞态：登录先读到 `active` 与旧 `token_version`，随后禁用提交，此时新会话携带旧版本。中间件比对 `token_version` 不一致即吊销并回 401（`hono-auth.ts:97-111`），refresh 侧同样比对（`platformRefreshTokenVersion`）。所以 bump 是竞态的主防线，撤会话是补充。
5. 强制下线只吊销「执行时刻已存在且未过期」的会话。此后用户重新登录会拿到新版本，属于正常重新认证，不违背 AC4。
6. 状态变更用 `expectedUpdatedAt` 乐观锁；冲突回 409 并附最新列表投影，Web 据此刷新。
7. 幂等：同状态重复设置不写库、不 bump、不写审计；重复强制下线返回 `revokedSessionCount: 0`。
8. 检索与详情恒定排除 `deleted_at IS NOT NULL`。列表投影不含任何会话行，详情只回 `activeSessionCount`，`token_hash` / `previous_token_hash` / `csrf_hash` 从源头不在查询里。

---

## 8. 安全与权限、错误与失败模式、可观测性

权限：6 条路由统一 `backofficeAuth → opOnly → superAdminOnly`，写操作追加 `backofficeCsrf`。决策见 §2-B。不做速率限制（与 `admin-accounts` 一致）；触发密码重置复用平台侧已有的 Valkey 冷却，因此有天然的二次限流。

错误矩阵：

| 条件 | 结果 |
| --- | --- |
| 未登录 | 401 `{ success:false, message:'未登录' }`（中间件） |
| 非 op / 非 super_admin | 403 `{ success:false, message:'仅最高管理员可执行此操作' }`（中间件） |
| CSRF 不匹配（cookie 认证的写操作） | 403 `{ success:false, message:'CSRF token invalid' }`（中间件） |
| 请求体 / query / param 不合法 | 400，`{ error }` 或路由级 `errorBody` |
| 目标 ID 不存在或已删除 | 404 `PLATFORM_USER_NOT_FOUND` |
| 状态版本过期 | 409 `REVISION_CONFLICT` + 最新 `user` |
| 激活 `restricted` 帐号 | 409 `PLATFORM_USER_STATUS_UNSUPPORTED` |
| 解绑的 provider 未绑定 | 404 `PLATFORM_OAUTH_LINK_NOT_FOUND` |
| 解绑末位可用凭据 | 409 `PLATFORM_OAUTH_LAST_LOGIN_METHOD` |
| 对 `suspended` 帐号触发重置 | 409 `PLATFORM_USER_SUSPENDED` |
| 帐号无邮箱凭据，触发重置 | 409 `PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE` |
| 重置冷却中 | 429 `PLATFORM_PASSWORD_RESET_COOLDOWN` + `Retry-After` |
| 邮件队列或加密配置不可用 | 503 `PLATFORM_PASSWORD_RESET_UNAVAILABLE` |

失败模式：

- 邮件队列不可用时不写审计、不改任何状态，帐号不受影响。
- 仓储批次任一步失败即整体回滚，因此不存在「状态改了但事件没写」或「事件写了但状态没改」的中间态。`writeAudit` 失败不影响业务响应（既有语义）。
- 模块级 `ADMIN_PLATFORM_USER_ACTIONS` 常量收敛动作词，避免同义不同串。

可观测性：请求级日志由 `apps/api/src/middleware/request-observability.ts` 统一输出，不新增 handler 内 `console.log`。审计走 `logs`，帐号侧事件走 `platform_security_events`。响应绝不包含堆栈、SQL、凭据或对象键（沿用 `data-and-errors.md`）。

---

## 9. 兼容性与回滚、风险清单

兼容性：

- 不改任何现有平台用户端点的行为。唯一动到既有代码的是把密码重置签发逻辑从 handler 抽成函数，公开端点的状态码 / body / `Retry-After` 必须逐字不变，现有 `apps/api/tests/server/platform-email-auth.contract.test.ts` 与 `apps/web/tests/unit/lib/api/endpoints/platform.test.ts` 保持通过即为证据。
- 不改 `backoffice_accounts` 相关代码。
- 新增域目录要求同步 `apps/api/scripts/checks/hono-architecture.js` 的 `domainSections`（`:559-580`）与 `validatedRequestDomains`（`:626-646`）。漏改会让 `check:architecture` 报「domain is not registered in the section taxonomy」。
- 新增 Web 路由会让 `apps/web/tests/unit/routes.test.ts:64` 的 51 变成 52。
- 新增路由后要重跑 `node scripts/contracts/compile-route-inventory.mjs --write` 刷新 `scripts/contracts/current-wire-contract-inventory.json`，否则 `check:rules` 的 freshness 检查失败。

回滚：

- 无迁移可回滚。代码回滚顺序与实施相反：先撤 `app.ts` 的注册（端点立即消失）、再撤回 Web 路由/导航、最后删契约模块与仓储方法。
- 若不重跑 inventory，回滚后也要再 `--write` 一次。

风险清单：

1. 密码重置签发抽取是最容易引入回归的一步。缓解：先抽函数并让公开 handler 逐字等价，跑既有测试；再加管理端调用。
2. `logs` 的 result 编码不可结构化聚合（决策 A 的已知代价）。缓解：结构化的帐号事件写在 `platform_security_events`；动作词表收敛成常量。
3. 审计是尽力而为，极端情况下 `logs` 可能缺一条。缓解：`platform_security_events` 与业务同事务。
4. 检索默认只对 `display_name` 模糊、对 `id` / `email` 精确。如果运营期望邮箱子串匹配，需要产品再确认，届时只改 WHERE，不动契约。
5. `display_name` 的 `ILIKE` 大小写与中文匹配策略在 PostgreSQL 下依赖数据库 collation；当前用默认，无需额外配置。
6. 新增 `auth.account.reactivated` 事件类型要让下游（若有）容忍未知 `event_type`；当前没有消费方。
7. 详情复用列表 SQL，若将来列表投影分叉（例如加上头像），详情会跟着变，属于预期行为。

---

## 实施顺序依赖

1. 契约模块 + 导出同步（其余步骤都依赖它）。
2. 仓储端口与实现（含 `PlatformSecurityEventType` 扩展）。
3. 密码重置签发抽取（`issuePlatformPasswordReset`），保持公开端点行为不变。
4. 新 API 域的 request / response / handlers / routes，并更新 `app.ts` 与架构检查器分类表。
5. Web endpoint 模块与导出。
6. Web 页面、路由 descriptor、导航项。
7. 测试与清单刷新。
