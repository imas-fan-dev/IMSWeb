# 归档核对（2026-09-19）

方式：只读 agent 逐条把 11 条验收项对照当前代码与测试，全部有落地证据。未执行完整测试套件。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC1 | `oauth-links/routes.ts`（`GET /oauth-links`）+ `oauth-link-view.ts:removable`；`platform-oauth-callback-branches.test.ts` › "a link state binds the identity…"；`platform-account-security.contract.test.ts` › "a password makes a sole OAuth link removable" |
| AC1a | `platform-account-repository.ts:createOAuthIdentityForAccount`（`already-linked` / `identity-conflict` / `provider-conflict`）；测试 "re-linking the same subject…"、"a subject owned by another account is refused without a session"；`platform-account-management-repository.test.ts` › "a subject owned by another account is refused without a write" |
| AC1b | `oauth-link-branch.ts:handlePlatformOAuthLinkCallback` 只经 `createOAuthIdentityForAccount` 写入；`oauth-login.ts:162` 按 `intent==='link'` 分流；测试断言 `createRefreshSession === 0` 且无 `set-cookie` |
| AC2 | `email/handlers/bind-email-credential.ts`；`platform-account-repository.ts:createVerifiedEmailCredentialForAccount`（以 `consumed_token` 为闸的批处理）；测试 "binding requires a valid code and leaves no credential on failure" |
| AC3 | `email/handlers/change-email-credential.ts:matchesCurrentPlatformPassword`；测试 "changing an email needs the current password and keeps the credential on refusal" |
| AC4 | `migrateEmailCredentialForAccount` 只写 `normalized_email` / `updated_at`；测试 "changing an email preserves the password hash and every live session" |
| AC5 | `isEmailConflict`（`_pkey`）与 `isEmailAccountConflict`；测试 "changing to an address owned by another account is refused without a partial write" |
| AC6 | 末位凭据判定拼接进 `deleteOAuthIdentity` 的 DELETE `WHERE`；测试 "two unlinks cannot strip every login method"、"two concurrent links of one subject resolve to exactly one owner" |
| AC7 | `email/email-binding-code.ts` 使用域分隔符 `platform-email-binding\0`；测试 "the verification code is hashed with the binding domain, not the registration one" |
| AC8 | `packages/contracts/src/platform/account-security.ts` 新 schema 均 `.strict()`，响应为纯 `successEnvelope`；`platform-email-binding.contract.test.ts` › "raw JSON conforms across read, code, and bind" |
| AC9 | `apps/web/app/pages/account/security/oauth-link-section.tsx`（`data-linked`）；`account-security-page.test.tsx:629-680`（未绑定行、`?oauth=link-conflict` 提示） |

## 遗留

- `email/handlers/send-email-binding-code.ts` 复用 `purpose: 'registration'`，绑定邮件文案会读成注册验证码。已记在 `implement.md` 的「待产品确认」，不是隐藏项。
- `implement.md` 里对 `unavailable` 结果变体与 `PLATFORM_ACCOUNT_RESTRICTED` 403 的预测与实现不符：代码返回 `not-found`（映射为 `link-unavailable`）与 `verification-invalid`（400）。属规划漂移，不是缺陷。
- 未执行测试套件；无 TODO / stub 标记，无 `.skip` / `.todo`。
