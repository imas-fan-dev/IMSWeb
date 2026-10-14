# 归档核对（2026-09-19）

方式：只读 agent 逐条把 9 条验收项对照当前代码与测试。7 条有证据，AC5 与 AC9 未勾选，原因见下。
未执行测试套件，也未跑 PostgreSQL 仓储套件。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC1 | `platform-account-repository.ts:adminAccountFilter`（id / email / display_name）+ `listPlatformAccountsForAdmin`；`admin-platform-users.contract.test.ts` › "platform-user list paginates and searches by id, email and display name"；`platform-account-admin-repository.test.ts` 同名用例 |
| AC2 | 列表投影含 `has_password` / `active_session_count` / `last_login_at`；`admin-platform-users.contract.test.ts` › "platform-user detail surfaces OAuth links and 404s for unknown ids" |
| AC3 | `setPlatformAccountStatus` 在同一批里递增 token version 并清扫 refresh session；`platform-auth/contracts/session.ts:213` 状态门；测试 "suspending an account bumps the token version and revokes live sessions atomically" |
| AC4 | `forceLogoutPlatformAccount`；测试 "force logout revokes sessions and is idempotent" |
| AC6 | `handlers/unlink-platform-user-oauth.ts` → `deleteOAuthIdentity`；测试 "OAuth unlinking honours the last-credential guard"；`platform-account-admin-repository.test.ts` › "the last-credential guard still refuses unlinking an OAuth-only account" |
| AC7 | `write-audit.ts` 从 `backofficeUser` 取操作人；`audit-actions.ts`；契约测试在 480 / 534 / 596 / 622 / 638 行断言五个动作的 action 与 target |
| AC8 | `response.ts:toAdminPlatformUser` 显式映射；契约测试 414 行断言原始 JSON 不含 `token_hash` / `previous_token_hash` / `csrf_hash` / `password_hash`；仓储测试 242 行同向 |

## 未勾选

| AC | 状态 | 说明 |
| --- | --- | --- |
| AC5 | 部分 | `handlers/trigger-platform-user-password-reset.ts` 调用共享的 `issuePlatformPasswordReset`，发码→改密的链路在 `platform-email-auth.contract.test.ts`（约 675-705 行）有测试，但没有用例从管理端端点走到改密完成 |
| AC9 | 部分 | 严格校验与 404 / 409 错误码有测试（"platform-user request validation stays strict"），但没有用例断言这些失败路径的 audit 数组为空。代码满足——每个错误返回都在 `writeAudit` 之前 |

## 其他

- `adminAccountFilter` 的 `ILIKE` 在契约测试里只由假实现覆盖，真实 SQL 由 PostgreSQL 仓储套件钉住，本轮未运行。
- `implement.md` 第 7 步「浏览器手工走查 `/admin/platform/users`」未执行，其余未勾选项都是记录性条目。
- 无 TODO / stub 标记，无 `.skip` / `.todo` / `xfail`。
