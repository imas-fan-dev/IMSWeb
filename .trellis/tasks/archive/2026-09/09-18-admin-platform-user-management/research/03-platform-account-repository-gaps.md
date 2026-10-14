# 03 平台帐号仓储缺什么

调研范围：`apps/api/src/ports/repositories/platform.ts`、`apps/api/src/infra/db/repositories/platform-account-repository.ts`、`apps/api/migrations/postgresql/0020_platform_accounts.sql`、`apps/api/src/middleware/hono-auth.ts`、`apps/api/src/domains/identity/platform-auth/contracts/session.ts`。

**[事实]** = 源码可读；**[推断]** = 建议。

---

## 1. `PlatformAccountRepository` 方法全表

**[事实]** 接口声明在 `apps/api/src/ports/repositories/platform.ts:310`，并在 `:310` 行 `extends PlatformOAuthProviderStore`（`apps/api/src/ports/oauth.ts:62-82`，提供 4 个 OAuth provider 配置方法）。

平台帐号/会话相关方法（行号取自 port 文件）：

| 行 | 方法 |
| --- | --- |
| 311 | `createAccountWithProfile(input: NewPlatformAccountInput)` |
| 314 | `createOAuthState(input)` |
| 315 | `consumeOAuthState(stateHash, providerCode, consumedAt)` |
| 320 | `findOAuthIdentity(providerCode, providerSubject)` |
| 324 | `listOAuthIdentitiesByAccount(accountId)` |
| 333 | `deleteOAuthIdentity(input: DeletePlatformOAuthIdentityInput)` |
| 336 | `createOAuthAccount(input)` |
| 339 | `findAccountById(id)` |
| 340 | `findAccountWithProfileById(id)` |
| 343 | `createEmailAccount(input)` |
| 346 | `createVerifiedEmailAccount(input)` |
| 349 | `completePasswordReset(input)` |
| 352 | `findEmailIdentity(normalizedEmail)` |
| 355 | `findEmailCredentialByAccountId(accountId)` |
| 358 | `updatePasswordForAccount(input)` |
| 361 | `upgradeEmailCredentialToBcrypt(input)` |
| 370 | `updateProfileTextForOwner(input)` |
| 373 | `updateProfileAvatarForOwner(input)` |
| 376 | `createRefreshSession(input)` |
| 379 | `findRefreshSessionById(id)` |
| 382 | `findRefreshSessionByTokenHash(tokenHash)` |
| 387 | `listRefreshSessionsByAccount(accountId, activeAt)` |
| 391 | `rotateRefreshSession(input)` |
| 401 | `revokeRefreshSession(input)` |
| 407 | `revokeAllRefreshSessionsExcept(input)` |
| 410 | `revokeRefreshSessionForReplay(input)` |
| 417 | `deleteExpiredRefreshSessions(now)` |

**[事实]** **没有**任何以邮箱、用户名、ID 为条件的账号列表/检索方法；**没有**任何修改 `platform_accounts.status` 的方法；**没有**不带 `keepSessionId` 的批量吊销方法。

---

## 2. 相关记录类型

**[事实]** 全部在 `apps/api/src/ports/repositories/platform.ts`：

- `PlatformAccountStatus = "active" | "restricted" | "suspended" | "deleted"`（:9-14）。
- `PlatformAccountRecord { id, status, token_version, created_at, updated_at, deleted_at }`（:15-24）。
- `PlatformProfileRecord { account_id, display_name, avatar_object_key, avatar_external_url, home_city, bio, updated_at }`（:26-34）。
- `PlatformAccountWithProfile { account, profile }`（:34-37）。
- `PlatformEmailCredentialRecord`（:42-51，含 `password_hash`）。
- `PlatformEmailIdentity extends PlatformAccountWithProfile { credential }`（:52-54）。
- `PlatformOAuthIdentity extends PlatformAccountWithProfile { oauth }`（:84-95，含 `provider_subject`）。
- `PlatformOAuthLinkRecord`（:106-116，安全投影，**不含 `provider_subject`**，含 `provider_label/provider_enabled`）。
- `PlatformRefreshSessionRecord`（:239-253，**含 `token_hash`/`previous_token_hash`/`csrf_hash`**）。
- `PlatformSecurityEventType` 枚举（:272-285，10 个值，全是 `auth.*` 前缀）。
- `PlatformSecurityEventInput`（:287-297）。
- `DeletePlatformOAuthIdentityResult = { status: 'deleted' | 'not-found' | 'last-login-method' }`（:122-125）。
- `UpdatePlatformPasswordResult = saved | conflict | unavailable`（:220-223）。

**[事实]** **平台账号没有独立 username 字段**。最接近的是 `platform_profiles.display_name`（`0020_platform_accounts.sql:20-24`）；`normalized_email` 在 `platform_email_credentials` 表（:113-127）。因此 PRD 的「按用户名检索」在本仓储层只能映射为 `display_name`。

---

## 3. 关键实现确认

- `ACCOUNT_COLUMNS = 'id, status, token_version, created_at, updated_at, deleted_at'`（`platform-account-repository.ts:41-42`）。
- `findAccountById`：`SELECT ${ACCOUNT_COLUMNS} FROM platform_accounts WHERE id=?`（:960-966）。只返回 account，不含 profile、email。
- `findAccountWithProfileById`：JOIN `platform_profiles`，返回 account+profile，**不含 email**（:968-988）。
- `listOAuthIdentitiesByAccount`：JOIN `platform_oauth_providers`，投影掉 `provider_subject`，`ORDER BY created_at, provider_code`，`LIMIT 64`（:575-602；常量 `OAUTH_LINK_LIST_LIMIT = 64` 在 :48）。
- `createVerifiedEmailAccount`：事务内先消费验证码、再 INSERT account + profile + credential，靠 `isEmailConflict` 处理 email 冲突，最后回读 `findAccountWithProfileById`（:821-959）。
- `findEmailCredentialByAccountId`：`SELECT ${EMAIL_CREDENTIAL_COLUMNS} ... WHERE account_id=?`（:1161-1170）。返回 `password_hash`，**不可直接回给 Web**。
- `findEmailIdentity(normalizedEmail)`：JOIN account+profile+credential，返回含 `password_hash` 与 `salt` 的完整行（:1132-1159）。
- `listRefreshSessionsByAccount(accountId, activeAt)`：`WHERE account_id=? AND revoked_at IS NULL AND expires_at>?`，`ORDER BY COALESCE(last_seen_at, created_at) DESC`，`LIMIT 200`（:1498-1512；`REFRESH_SESSION_LIST_LIMIT = 200` 在 :46）。返回行**含 `token_hash`**。
- `revokeAllRefreshSessionsExcept`：`WHERE account_id=? AND id<>? AND revoked_at IS NULL AND expires_at>?`，事务内先插 `platform_security_events` 再 UPDATE，返回吊销条数（:1606-1646）。
- `revokeRefreshSession`：`WHERE id=? AND account_id=? AND revoked_at IS NULL`，同样先事件后 UPDATE（:1574-1604）。

---

## 4. 逐项缺口

### 4.1 按邮箱/用户名/ID 检索分页 —— **缺**

**[事实]** 无任何检索/列表方法。最接近的 `findEmailIdentity` 只支持精确邮箱且单条，且会带出 `password_hash`。

**[推断]** 需要新增（建议命名）：

- `listPlatformAccountsForAdmin(input: { query: string; field: 'id' | 'email' | 'display_name'; limit: number; offset: number })`
- `countPlatformAccountsForAdmin(input: { query: string; field: 'id' | 'email' | 'display_name' })`

投影需含：`id, status, display_name, normalized_email(nullable), has_password, created_at, updated_at, last_seen_at(nullable), active_session_count, oauth_provider_count`。查询路径：
  - `field='id'` → `platform_accounts.id = ?`（前缀/精确由产品定）。
  - `field='email'` → `EXISTS (SELECT 1 FROM platform_email_credentials c WHERE c.account_id=a.id AND c.normalized_email=?)` 或 `ILIKE %q%`（需产品确认是否模糊）。
  - `field='display_name'` → `platform_profiles.display_name ILIKE %q%`（大小写与中文匹配策略需确认）。
  - 排序需稳定（建议 `ORDER BY created_at DESC, id`）。

**[事实]** 无 `username` 列，检索应明确写成 display_name。

### 4.2 禁用/启用帐号 —— **缺**

**[事实]** 全仓库只有两处 `UPDATE platform_accounts`，都是 `SET token_version=token_version+1`（`completePasswordReset` 的 :1059-1071、`updatePasswordForAccount` 的 :1227-1240），**没有任何 `SET status=`**。因此禁用/启用必须新增方法。

**[推断]** 建议 `setPlatformAccountStatus(input: { accountId; status: 'active' | 'suspended'; expectedUpdatedAt?: number; updatedAt: number })`，返回 `{ status: 'saved' | 'not-found' | 'conflict' }`。启用时只允许从 `suspended` → `active`（`restricted` 是平台侧风控态，管理端不应越权改动，需产品确认）。`deleted` 不可由管理端设置（PRD 明确排除删除）。

**[推断]** 用 `updated_at` 做乐观锁（与 profile/password 更新一致：`expectedUpdatedAt` 模式见 port:205-214 `UpdatePlatformProfileTextInput`）。

### 4.3 吊销该用户全部会话 —— **半缺**

**[事实]** `revokeAllRefreshSessionsExcept` 存在，但强制要求 `keepSessionId`，SQL 是 `id<>?`。管理端没有「自己的平台会话」可保留。

**[推断]** 两条路：
  1. 新增 `revokeAllRefreshSessions(input: { accountId; revokedAt; event })`，语义更直白。
  2. 复用 `revokeAllRefreshSessionsExcept`，传一个不可能存在的 `keepSessionId`（如空串，SQL 里 `id<>''` 命中所有真实行）。可行但语义 hack，不建议。

**[事实]** 仅吊销 refresh 会话不等于收回已签发的 access token。真正「强制下线」需要同时让 access token 失效，手段是 **bump `token_version`**（见 §5）。PRD AC4 要求「全部会话立即失效」，所以禁用/强制下线至少要覆盖 `token_version` 或 `revoked_at` 两者之一，建议同时。

### 4.4 触发密码重置 —— **仓储无缺口，但服务层逻辑不可复用**

**[事实]** 现有发信逻辑内联在 `apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts:49-186`（`handlePlatformPasswordResetVerification`），依赖 `services(c).platformEmailDeliveryQueue`、`platformEmailJobPayloadCipher`、`platformEmailResendPolicy`、cooldown cache。仓储侧只负责 `completePasswordReset`（消费码并改密，port:349，impl:990-1130）。

**[推断]** 需要把「校验收件人存在 → 生成码 → 加 cooldown → enqueue」抽出成一个可复用函数（例如 `issuePlatformPasswordReset(c, normalizedEmail)`），管理端 handler 调用它，避免复制粘贴。仓储**不需要**新方法。

**[事实]** `completePasswordReset` 只接受 `accounts.status IN ('active','restricted')`（impl:1002-1008）；被 `suspended` 的账号即使收到码也无法完成重置。如果管理端「触发重置」要对 suspended 账号生效，需要产品确认顺序（先启用再触发，或改 SQL）。

### 4.5 解绑 OAuth —— **不缺**

**[事实]** `deleteOAuthIdentity` 已实现「末位凭据保护」：DELETE 的 WHERE 里内联 `EXISTS(email credential) OR EXISTS(另一个 enabled provider link)`，返回 `last-login-method`（port:122-125、impl:604-692）。PRD AR6 正是这个语义。

**[推断]** 管理端直接复用即可，只需构造 `PlatformSecurityEventInput`（可用 `platformSecurityEvent(c, accountId, 'auth.oauth.unlinked', 'unlinked_by_admin')`，见 `platform-auth/contracts/session.ts:153-167`）。注意它写的是 `platform_security_events`，管理端 `logs` 审计仍需另写。

### 4.6 详情所需字段 —— **部分缺**

| 详情字段 | 现状 |
| --- | --- |
| 账号状态 | `findAccountById` / `findAccountWithProfileById` 已有 |
| 显示名 | `findAccountWithProfileById` 已有 |
| 邮箱 | **缺**（上述两方法都不带 email；`findEmailIdentity` 带 email 但含 `password_hash`，需新投影或安全 view） |
| `hasPassword` | 可由 `findEmailCredentialByAccountId`（:1161）非空判断，但会拿到 hash；建议加 `hasPlatformPassword(accountId): Promise<boolean>` 或让列表 SQL 直接 `EXISTS(...)` 投影 |
| OAuth 绑定列表 | `listOAuthIdentitiesByAccount`（:575）已有，且已剥离 `provider_subject` |
| 活跃会话数 | 可 `listRefreshSessionsByAccount(...).length`，但会拉出 200 行含 `token_hash`。建议新增 `countActivePlatformRefreshSessions(accountId, activeAt): Promise<number>` |
| 最近登录 | **缺**。`platform_accounts` 无 last_login 列；`platform_refresh_sessions` 有 `created_at`/`last_seen_at`；`platform_security_events` 有 `auth.session.created` 但无查询方法。建议新增 `findLastPlatformLoginAt(accountId): Promise<number \| null>` 或并入列表 SQL 的聚合 |

### 4.7 AR8 保密要求

**[事实]** `PlatformRefreshSessionRecord` 含 `token_hash`/`previous_token_hash`/`csrf_hash`（port:239-253）。已有一个安全投影 `platformSessionDeviceView` 明确剥离这三个字段（`apps/api/src/domains/identity/platform-account-security/sessions/session-device-view.ts:8-25`）。

**[推断]** 管理端详情若返回会话列表，必须复用同一个 view 或只返回 count，绝不能直接序列化 `PlatformRefreshSessionRecord`。响应契约应 strict，防止未来字段泄漏。

---

## 5. `PlatformAccountStatus` 与 `status` vs `deleted_at`

**[事实]** 取值 `active | restricted | suspended | deleted`（port:9-14；DB CHECK `0020_platform_accounts.sql:5-7`）。语义分布：

- `active`、`restricted` 允许登录/刷新：`rotateRefreshSession` 的 SQL 限定 `status IN ('active','restricted')`（impl:1438, 1534）；`completePasswordReset` 同样限定（impl:1002-1008）。
- `updatePasswordForAccount` 只接受 `status='active' AND deleted_at IS NULL`（impl:1205-1212）。
- `suspended`/`deleted` 被鉴权中间件拦下：`authenticatePlatformRequest` 对 `suspended` 回 403 `PLATFORM_ACCOUNT_SUSPENDED`，对 `deleted` 回 403 `PLATFORM_ACCOUNT_UNAVAILABLE`，并顺手吊销当前 refresh session（`hono-auth.ts:113-124`）。
- DB 强耦合：`CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))`（`0020_platform_accounts.sql:13`）。

**[推断]** **禁用应写 `status='suspended'`，不要碰 `deleted_at`**。理由：`deleted_at` 与 `deleted` 状态被 CHECK 绑定；`deleted` 在中间件里语义是「不可用/已删除」，而 PRD 明确排除删除。启用则 `suspended → active`。

**[事实]** 平台会话契约 `platformAccountSchema.status` 已含四值（`packages/contracts/src/platform/index.ts:247-253`），但公开会话只承诺 `active|restricted`（`platform-auth/contracts/session.ts:180-184` 注释与转换）。管理端契约可以完整暴露四值。

---

## 6. `token_version` 的作用

**[事实]** 链路：

1. 列定义 `token_version INTEGER NOT NULL DEFAULT 0 CHECK (>= 0)`（`0020_platform_accounts.sql:8`）。
2. access token claims 携带 `tokenVersion`；refresh token 字符串嵌入版本：`v1.<version>.<hex>`（`platform-auth/contracts/session.ts:110-121`）。
3. 每次平台鉴权都比对：`identity.account.token_version !== claims.tokenVersion` → 事务外立即 `revokeRefreshSession(..., reason='token_version_changed')`、清 cookie、回 401 `PLATFORM_SESSION_INVALID`（`hono-auth.ts:97-111`）。
4. refresh 时也比对：`platformRefreshTokenVersion(refreshToken) !== identity.account.token_version` → 拒绝并吊销（`sessions/handlers/refresh.ts:66-75`）。
5. 只有两条路径 bump：`completePasswordReset`（impl:1059-1071）与 `updatePasswordForAccount`（impl:1227-1240）。注释明确写「bumps `token_version` so every issued access token dies」（port:200-208）。

**[推断]** `token_version` **正是「吊销全部 access token」的实现机制**，与「吊销全部 refresh session」互补。管理端「强制下线」= bump token_version + `revokeAllRefreshSessions`。若只做后者，已被轮换出的 access token 在 15 分钟 TTL 内仍可用（`PLATFORM_ACCESS_TOKEN_TTL_SECONDS = 15*60`，`session.ts:23`），不满足 AC4「立即失效」。禁用 `suspended` 时则可考虑同时 bump，使既有 access token 立即失效（中间件在下次请求即拒）。

**[推断]** 需要一个仓储方法把「改状态」与「bump 版本 / 吊销会话」放进同一事务，否则会出现「已禁用但 access token 还能用一会儿」的窗口。可设计成 `setPlatformAccountStatus` 内可选 `revokeSessions: boolean`，或独立 `suspendPlatformAccount(input)`。
