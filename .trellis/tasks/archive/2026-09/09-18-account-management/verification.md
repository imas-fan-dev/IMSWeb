# 归档核对（2026-09-19）

方式：三个只读 agent 逐条把验收项对照当前代码与测试。未执行完整测试套件，也未做真机 / 设备构建。
勾选表示该条在代码与测试中有证据；未勾选表示证据不足或依赖真机。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC1 / AC1a | `platform-oauth-unlink-repository.test.ts`；`platform-oauth-callback-branches.test.ts` › "re-linking the same subject to the same account is idempotent"、"a subject owned by another account is refused without a write" |
| AC2 / AC2a | `platform-email-binding.contract.test.ts` › "changing an email preserves the password hash and every live session" |
| AC3 | `platform-account-management-repository.test.ts` › "two concurrent binds for one account produce exactly one credential"、"two unlinks cannot strip every login method" |
| AC4 / AC4a / AC4b / AC5 | `apps/web/tests/unit/pages/account/session-device-model.test.ts`；`account-security-page.test.tsx` 的未知档与后缀区分用例 |
| AC6 | `platformSessionDeviceSchema`（`packages/contracts/src/platform/account-security.ts:51`）无字段增删 |
| AC7 / AC8 / AC9 / AC10 | `admin-platform-users.contract.test.ts` › "platform-user list paginates and searches…"、"status changes are optimistic-locked and audited"、"force logout revokes sessions and is idempotent"、"OAuth unlinking honours the last-credential guard" |
| AC8 | 既有会话失效由 `platform-auth/contracts/session.ts:213` 的状态门与 token version 递增后清扫 refresh session 断言，不经「禁用后发起请求」的端到端用例 |
| AC12 | `platform-oauth-callback-branches.test.ts` › "login + web keeps the original callback redirect and sets the session cookies"；`app-oauth-sign-in.spec.ts` |

## 未勾选

| AC | 说明 |
| --- | --- |
| AC11 | 「移动 Web 与 Tauri app 内均可发起并回到原界面」的 app 半段只有单测模拟与 Playwright 的 app target 模拟，真机前台唤起未验证；细节见子任务 `09-18-oauth-login-mobile-adaptation/verification.md` |

## 文档

路由清单是最新的（`compile-route-inventory.mjs` 无 diff），`docs/development/tauri-mobile.md:321-334` 已更新 app 返回通道。
但 `docs/architecture/platform-account-security.md` 没有提到 `imsweb://` 或 app 返回通道，父任务在这条流程上的文档权威源仍缺一段。
