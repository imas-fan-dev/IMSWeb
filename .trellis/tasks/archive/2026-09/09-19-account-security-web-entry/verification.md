# 归档核对（2026-09-19）

方式：只读 agent 逐条把 6 条验收项对照当前代码与测试，全部有证据。未执行测试套件。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC1 | 入口在 `apps/web/app/components/platform/platform-account-menu.tsx:188`；e2e `apps/web/tests/e2e/platform-session-header.spec.ts` › "authenticated header offers account security"；单测 "links a signed-in account to account security" |
| AC2 | 复用 `platformAccount.security.title`，与 `account-me-page.tsx:319` 同键，图标同为 `ShieldCheckIcon`；单测断言名称为 `帐号安全` 且为 `lucide-shield-check` |
| AC3 | 匿名分支为 `platform.status === "anonymous"`（`:87`）；e2e 匿名用例断言 `toHaveCount(0)`；单测 "keeps account security out of the anonymous menu" |
| AC4 | `account-me-page.tsx:319` 与 `app-tab-model.ts:135` 未被 `d4e222ef` 触碰 |
| AC5 | `d4e222ef` 改动清单：spec md、任务文件、`platform-account-menu.tsx`、两个测试文件。无 `route-metadata.ts`，无 `packages/contracts`，无清单 JSON |
| AC6 | 单测新增两个用例，e2e 在既有文件里补了两个方向 |

## 前提复核

`/account/security` 的 delivery 仍为 `prerender`，targets 仍含 `web`（`route-metadata.ts:141-151`），AC1 的门禁条件成立。
入口控件复用 `Menu.Item`，与「我的名片」「退出登录」同构，未引入新组件或新文案键。
