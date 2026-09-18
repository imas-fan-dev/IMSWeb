# 登录用户绑定与换绑 OAuth / 邮箱

## Goal

已登录的平台用户能在个人档案里自行绑定 OAuth 帐号、建立或迁移邮箱凭据，不需要人工介入。

用户价值：换手机号、换邮箱、想用 Google 登录这些日常诉求有自助出口；同时不给"会话被劫持即帐号被接管"留后门。

## Background

### 现状

**OAuth 侧只有解绑，没有绑定**

`apps/api/src/domains/identity/platform-account-security/oauth-links/` 下有 `list-oauth-links.ts` 与 `unlink-oauth-link.ts`，没有 link/start + callback。契约层 `packages/contracts/src/platform/account-security.ts` 也没有绑定相关的请求/响应 schema。

已解绑保护已建模：`platformOAuthLinkSchema:69` 带 `removable`，`platformOAuthLinkListResponseSchema:81` 带 `passwordEnabled`；`deleteOAuthIdentity` 的注释（`apps/api/src/ports/repositories/platform.ts:327`）明确末位凭据判定写在 DELETE 语句内，避免并发解绑把帐号锁死。绑定侧需要同样的原子性思考。

**邮箱是登录凭据，不是 profile 字段**

邮箱存在 `platform_email_credentials`，`normalized_email` 为主键（全局唯一），同行保存密码 hash 与 `account_id`。仓储有 `isEmailConflict` 判定（`platform-account-repository.ts:174`），但**它只匹配 `_pkey` 约束，不覆盖 `account_id` 唯一约束**，换绑时需要新增一个覆盖后者的判定。另有 `createVerifiedEmailAccount`。

**可复用的既有机制**

- 邮箱验证码：表 `platform_email_verification_codes`（`normalized_email` / `code_hash` / `consumed_token` / `consumed_at` / `delivery_token`），hash 带域分隔符（`platform-auth/registration/email-verification.ts:12` 使用 `'platform-email-registration\0'`）
- 当前密码二次校验：`platformPasswordChangeRequestSchema` 已有 `currentPassword` 模式
- 绑定写入的中间件链：`platformAuth` + `activePlatformMutation` + `platformCsrf` + 限流

**OAuth provider 是动态配置的**

`platformOAuthProviderCodeSchema`（`packages/contracts/src/platform/index.ts:46`）只约束格式 `^[a-z][a-z0-9-]*$`，具体 provider 由管理端 `apps/web/app/pages/admin/platform-oauth/` 配置。绑定能力需要覆盖所有已启用的 provider，不能硬编码列表。

**`platform_oauth_states` 已预留 link 语义**

该表已有 `intent IN ('login','link')` 与 `linking_account_id` 列（`apps/api/migrations/postgresql/0020_platform_accounts.sql:70-99`），但应用层写死了登录语义：`createOAuthState` 固定写 `linking_account_id=NULL`（`platform-account-repository.ts:508`），`consumeOAuthState` 固定按 `intent='login'` 消费（`:532`）。

这意味着 **OAuth 绑定不需要新增存储结构**，只需把这两个函数泛化，并在回调处按 state 的 `intent` 分流。`createAuthorizationUrl`、`exchangeAuthorizationCode`、`findOAuthIdentity` 可直接复用；`createOAuthAccount`（会建整个帐号）与 `establishPlatformSession` 是登录专用，不可复用。目前**不存在**独立的「只建 OAuth 身份、不建帐号」原语。

**邮箱验证码机制可复用，需两个补充**

验证码存 `platform_email_verification_codes`，TTL 10 分钟、5 次尝试、Valkey 限流叠加数据库权威 cooldown。`delivery_token` 保证验证码在 SMTP 受理前不可消费；`consumed_token` 用作写入事务的闸。换绑用途需要：自己的 hash 域分隔符（现有为 `'platform-email-registration\0'`），以及一个「消费验证码 + 写/迁凭据」的仓储原语。

**邮箱迁移缺 SQL**

`normalized_email` 是主键且 `account_id` 唯一（`0020_platform_accounts.sql:128-150`）。现有三处 `UPDATE platform_email_credentials` 只改密码与算法，**从不改 `normalized_email`**；也**不存在**把凭据挂到既有帐号的原语。`isEmailConflict`（`:169`）是私有函数，且只匹配 `_pkey` 约束。所以换绑需要新增仓储方法。

## 已确认的规则

### 邮箱

| 场景 | 校验要求 |
| --- | --- |
| 补绑（帐号尚无邮箱凭据） | 新邮箱验证码 + 设置新密码 |
| 换绑（帐号已有邮箱凭据） | 新邮箱验证码 + 当前密码 |
| 目标邮箱已被占用 | 返回 `email-conflict` 类可区分业务错误 |

### OAuth 身份冲突

| 场景 | 处理 |
| --- | --- |
| 身份已归属其他帐号 | 拒绝绑定，返回可区分业务错误并引导改用该身份登录，不转移任何数据 |
| 身份本就属于当前帐号 | 幂等成功，返回当前链接 |
| 帐号合并 | 明确不做，保持「一个 OAuth 身份唯一归属一个帐号」不变量 |

## Requirements

- ER1 已登录用户可发起 OAuth 绑定，覆盖所有已启用的 provider
- ER1a 绑定请求的 state 以 `intent='link'` 与 `linking_account_id` 写入，回调按 intent 分流
- ER1b 目标身份已归属其他帐号时拒绝绑定且不产生任何写入；目标身份属于当前帐号时幂等返回现有链接
- ER2 OAuth 绑定完成后，`GET /me/oauth-links` 中该 provider 显示为已绑定，`removable` 与实际可解绑性一致
- ER3 已登录用户可补绑邮箱：无邮箱凭据的帐号可建立邮箱+密码凭据
- ER4 已登录用户可换绑邮箱：已有邮箱凭据的帐号可迁移到新邮箱，且保留现有密码 hash
- ER5 换绑要求当前密码校验；补绑要求设置新密码
- ER6 两种邮箱写入都以新邮箱验证码校验通过为前提，校验通过前不落库
- ER7 目标邮箱已被其他帐号占用时返回可区分业务错误
- ER8 任何绑定/换绑路径都不产生零可用登录凭据的帐号状态，并发场景下同样成立
- ER9 新增用途的验证码使用独立域分隔符，不复用注册用途的 hash 域
- ER10 绑定/换绑为写操作，沿用 `platformAuth` + `activePlatformMutation` + `platformCsrf` + 限流中间件链

## Acceptance Criteria

- [ ] AC1 未绑定某 provider 的用户完成绑定后，`GET /me/oauth-links` 返回该 provider，`removable` 与实际可解绑性一致
- [ ] AC1a 绑定已归属其他帐号的 OAuth 身份被拒且无写入；重复绑定自己已绑的 provider 幂等成功；两者均不产生新帐号
- [ ] AC1b 绑定回调不会退化为登录：只写身份与链接，不创建帐号、不重建会话
- [ ] AC2 补绑邮箱在验证码校验通过前不产生 `platform_email_credentials` 行；校验失败返回可区分业务错误
- [ ] AC3 换绑邮箱在当前密码错误时被拒绝，且原邮箱凭据保持不变
- [ ] AC4 换绑成功后可用原密码登录新邮箱，无需重设密码；迁移前已建立的会话不受影响
- [ ] AC5 目标邮箱已被占用时返回 `email-conflict` 类错误，且不产生部分写入
- [ ] AC6 并发解绑与绑定不会产生零凭据帐号：以仓储层原子判定为准，不依赖读-判断-写
- [ ] AC7 新用途验证码的 hash 域与注册用途不同，同一验证码不能跨用途复用
- [ ] AC8 新增请求/响应 schema 落在 `packages/contracts/platform/account-security.ts`，请求 strict、响应精确不做 transform
- [ ] AC9 Web 端 OAuth 区块区分"未绑定（可绑定）"与"已绑定（可解绑）"两种状态，绑定失败有可读反馈

## Out of Scope

- OAuth 身份冲突时的帐号合并（保持一身份一帐号不变量，另行评估）
- 邮箱验证码的发信通道改造
- 存储结构变更（OAuth 绑定走已存在的 `intent` / `linking_account_id` 列）
- 为绑定新建第二个 OAuth 回调路由（优先复用现有匿名回调并按 `intent` 分流，因每个 provider 只配置一个 `redirect_uri`）

## Open Questions

- 无

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
