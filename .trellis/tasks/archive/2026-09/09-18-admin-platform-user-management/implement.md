# 管理端平台用户帐号管理 · 实施计划

配合 `design.md`。顺序：契约 → 仓储 → 密码重置抽取 → API 域与路由 → Web endpoint → Web 页面 → 测试与清单刷新。
除测试与清单刷新外，每步都给出产出物与即时验证命令。不要跨步合并提交。

全程禁止：修改 `backoffice_accounts` 相关代码、新增迁移、在响应里出现 `token_hash` / `previous_token_hash` / `csrf_hash`。

---

## 0. 预检

从仓库根目录执行：

```sh
git status --short
node --version           # >= 22.13.0
pnpm --version           # >= 11.10.0
pnpm install --frozen-lockfile
pnpm run check:rules     # 确认起点干净
```

若 `check:rules` 在起点就不干净，先停下确认不是自己引入的。

---

## 1. 契约模块

产出物：

- 新建 `packages/contracts/src/platform/admin-users.ts`。按 `design.md` §3 定义全部 schema 与 `z.infer` 类型。参考 `packages/contracts/src/platform/admin-email.ts` 的文件结构与导入写法。
- 编辑 `packages/contracts/package.json`：在 `exports` 的 `"./platform/admin-email"` 之后加 `"./platform/admin-users"`，三段（`types` / `require` / `default`）都指向 `./dist/platform/admin-users.*`。
- 编辑 `packages/contracts/src/index.ts`：在 `platformAdminEmail` 之后加 `export * as platformAdminUsers from "./platform/admin-users.js"`。
- 编辑 `packages/contracts/entrypoints.json`：在 `./platform/admin-email` 记录之后加 `{ "subpath": "./platform/admin-users", "source": "src/platform/admin-users.ts", "namespace": "platformAdminUsers", "runtime": "schema" }`。
- 编辑 `packages/contracts/README.md`：在 `platform/` 段补 `admin-users.ts` 一行说明。

即时验证：

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/contracts run check:entrypoints
```

`build` 会跑 `check-entrypoints.mjs`，缺 `exports`、`index.ts` 命名空间或 `entrypoints.json` 任一都会失败。

---

## 2. 仓储端口与实现

产出物：

- 编辑 `apps/api/src/ports/repositories/platform.ts`：
  - 加 `PlatformAccountAdminSearchField`、`PlatformAccountAdminRecord`、`ListPlatformAccountsForAdminInput`、`CountPlatformAccountsForAdminInput`、`SetPlatformAccountStatusInput` / `SetPlatformAccountStatusResult`、`ForceLogoutPlatformAccountInput` / `ForceLogoutPlatformAccountResult`。类型形状见 `design.md` §5。
  - 在 `PlatformAccountRepository` 接口里加四个方法：`listPlatformAccountsForAdmin`、`countPlatformAccountsForAdmin`、`setPlatformAccountStatus`、`forceLogoutPlatformAccount`。
  - 在 `PlatformSecurityEventType` 联合里加 `"auth.account.reactivated"`。
- 编辑 `apps/api/src/ports/repositories/index.ts`（或该域导出聚合处）：确认新类型可从 `@/ports/repositories` 取到。若该 barrel 是显式列举，则补对应导出。
- 编辑 `apps/api/src/infra/db/repositories/platform-account-repository.ts`：
  - 私有 SQL/投影方法：一个生成管理员投影 `SELECT`（含 `active_session_count` 与 `last_login_at` 子查询）、一个生成检索 `WHERE`（含 `deleted_at IS NULL` 与三字段分支）、一个 `escapeLikePattern` 纯函数。
  - 四个公开方法。`setPlatformAccountStatus` 与 `forceLogoutPlatformAccount` 用 `this.serializeWrite` + `this.database.batch([...])`，撤会话语句用 `EXISTS(...)` fence 挂在状态/版本写入上，照抄 `updatePasswordForAccount` 的 `applied` 谓词（`platform-account-repository.ts:1204-1240`）。投影里不出现 `password_hash` / `salt` / `parameters_json` / 任何 `token_hash` / `csrf_hash`。
  - 实现参考：`deleteOAuthIdentity`（`:604`）的事务内事件写、`revokeAllRefreshSessionsExcept`（`:1606`）的批量撤会话语句、`listRefreshSessionsByAccount`（`:1498`）的子查询与时钟入参写法。

即时验证：

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
```

新增 PostgreSQL 测试（下一步跑）：

- 新建 `apps/api/tests/server/platform-account-admin-repository.test.ts`，用 `apps/api/tests/server/platform-oauth-unlink-repository.test.ts` 的 `postgresTest` + `createPostgresTestHarness` 模式。
- 覆盖：`field='id'`/`'email'`/`'display_name'` 三种命中；无匹配回空数组；`deleted` 帐号被排除；列表投影不含 hash 与密码字段；`setPlatformAccountStatus` 的 saved / conflict / unsupported / not-found 与 `changed=false` 幂等；禁用后 `token_version` +1 且未过期会话 `revoked_at` 非空；冲突时不会撤会话；`forceLogoutPlatformAccount` 的计数与重复执行归零；末位凭据路径仍由 `deleteOAuthIdentity` 拒绝。

```sh
pnpm --filter @imsweb/api run test:server
```

---

## 3. 抽取密码重置签发

产出物：

- 新建 `apps/api/src/domains/identity/platform-auth/password-reset/issue-password-reset.ts`：从 `handlePlatformPasswordResetVerification`（`apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts:34-139`）搬出签发逻辑，导出 `issuePlatformPasswordReset(c, normalizedEmail): Promise<IssuePlatformPasswordResetResult>`，结果三态 `queued` / `cooldown` / `unavailable` 并带 `retryAfterSeconds`。函数只返回结果，不设 `Retry-After` 头、不 `c.json`。
- 编辑 `reset-password.ts`：`handlePlatformPasswordResetVerification` 变成薄封装，调用新函数后按现有状态码、body 与 `Retry-After` 回 202 / 429 / 503。行为逐字不变。

即时验证：

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/web run test:unit -- platform.test.ts
```

既有 `apps/api/tests/server/platform-email-auth.contract.test.ts` 与 `apps/web/tests/unit/lib/api/endpoints/platform.test.ts` 必须全绿。这一步是本任务最容易回归的地方，绿了再往下。

---

## 4. 新 API 域与路由

产出物：

- 新建 `apps/api/src/domains/admin/platform-users/`：
  - `request.ts`：`AdminPlatformUserListQuery` 域内类型 + `normalizeAdminPlatformUserListQuery`（解析整数、夹紧 `pageSize<=50` 与 `page>=1`、`field` 缺省为 `display_name`、邮箱查询小写 trim）。参数与状态请求沿用契约 schema 输出，可不再加适配器。
  - `response.ts`：contracts 类型别名 + `toAdminPlatformUser(record)` + `toAdminPlatformUserDetail(record, links)`。详情链接用 `platformOAuthLinkViews(links, record.has_password)`（`apps/api/src/domains/identity/platform-account-security/oauth-links/oauth-link-view.ts`）。
  - `audit-actions.ts`：`ADMIN_PLATFORM_USER_ACTIONS` 常量（`禁用平台用户` / `启用平台用户` / `强制下线平台用户` / `触发平台用户密码重置` / `解绑平台用户 OAuth`）+ `platformUserAuditTarget(accountId, result)`。
  - `handlers/`：`list-platform-users.ts`、`get-platform-user.ts`、`update-platform-user-status.ts`、`revoke-platform-user-sessions.ts`、`trigger-platform-user-password-reset.ts`、`unlink-platform-user-oauth.ts`。每个 handler 用 `ValidatedRequestContext`，从 `c.get('backofficeUser')` 取操作者，处置成功后 `await writeAudit(c, action, target)`。
  - `routes.ts`：`registerAdminPlatformUserRoutes(app: ImsHonoApp): void`，6 条路由，中间件链与路径见 `design.md` §4。契约 schema 只在 validator 行 value-import，其余位置 type-only。
- 编辑 `apps/api/src/app.ts`：在 `:268` 的 `registerAdminAccountRoutes(app);` 之后加 import 与 `registerAdminPlatformUserRoutes(app);`。
- 编辑 `apps/api/scripts/checks/hono-architecture.js`：`domainSections` 的 `"admin"` 数组加 `"platform-users"`；`validatedRequestDomains` 集合加 `"platform-users"`。

即时验证：

```sh
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
```

新增契约测试：

- 新建 `apps/api/tests/server/admin-platform-users.contract.test.ts`，参考 `apps/api/tests/server/platform-email-settings-contract.test.ts`：用 `createWikiFixture` + 伪造 `backofficeAuth` / `platformAccountRepository`，用 `readContractJson` 做原始 JSON 与 schema 解析结果深比对。
- 覆盖：未登录 401、非 super_admin 403、CSRF 缺失 403；列表分页与三种检索；详情含 `oauthLinks`；状态变更 200 与 `REVISION_CONFLICT`；重复强制下线返回 0；末位凭据 409；非法 body / 未知字段 400；404 `PLATFORM_USER_NOT_FOUND`；响应原始 JSON 不含 `token_hash` / `previous_token_hash` / `csrf_hash` / `password_hash`。

```sh
pnpm --filter @imsweb/api run test:server
```

刷新路由清单：

```sh
node scripts/contracts/compile-route-inventory.mjs --write
```

---

## 5. Web endpoint 模块

产出物：

- 新建 `apps/web/app/lib/api/endpoints/platform/admin-users.ts`：`getAdminPlatformUsers` / `getAdminPlatformUser` / `updateAdminPlatformUserStatus` / `revokeAdminPlatformUserSessions` / `triggerAdminPlatformUserPasswordReset` / `unlinkAdminPlatformUserOAuth`。路径用 `adminApiPath("/platform/users")` + 后缀。读用 `withBackofficeAuth()`，写用 `withBackofficeCsrf()`，每个都传 `parsed(successSchema, { errorSchema: adminPlatformUserHttpErrorSchema, meta })`。列表用 `params`，只放入有值的查询键。参考 `apps/web/app/lib/api/endpoints/platform/admin.ts` 与 `endpoints/admin.ts:404-414`。
- 编辑 `apps/web/app/lib/api/endpoints/index.ts`：加 `export * from "./platform/admin-users"`。

即时验证：

```sh
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run lint
```

新增 endpoint 单测：

- 新建 `apps/web/tests/unit/lib/api/endpoints/platform-admin-users.test.ts`，参考 `apps/web/tests/unit/lib/api/endpoints/platform-admin-email.test.ts`。断言路径、方法、CSRF 头、请求体，以及 `parsed(...)` 接受合法响应、拒绝含 hash 字段或多余字段的响应。

```sh
pnpm --filter @imsweb/web run test:unit -- platform-admin-users
```

---

## 6. Web 页面与路由

产出物：

- 新建 `apps/web/app/pages/admin/platform-users/index.tsx`：页头（`AdminPageHeader`）、检索表单（输入 + field 选择 + 提交写回 `?query&field&page`）、表格（手写 shadcn 列）、分页控件（照抄 `apps/web/app/pages/admin/cards/index.tsx:52-110` 与 `:375-400`）、三态（Skeleton / destructive Alert / `AdminEmptyState`）。动作按钮按 `status` 显示禁用或启用，另有强制下线、触发重置（无邮箱凭据时禁用）、详情。
- 新建 `apps/web/app/pages/admin/platform-users/user-detail-dialog.tsx`：打开时按 id 拉详情，展示基础字段与 OAuth 链接列表；`removable === false` 的解绑按钮禁用并给出文案。
- 处置动作统一走 `useConfirmAction` + `ConfirmActionDialog`；末位凭据 409 要 catch 并 toast 可区分信息。
- 页内权限兜底：`adminSession.adminRole !== "super_admin"` 时渲染「仅最高管理员可访问」Alert，照抄 `apps/web/app/pages/admin/accounts/index.tsx:378-417`。
- 编辑 `apps/web/app/route-metadata.ts`：在 `platform/email` 块（`:437-443`）之后插 `route("platform/users", "pages/admin/platform-users/index.tsx", "admin", WEB_TARGET, "spa")`。
- 编辑 `apps/web/app/layouts/admin-layout.tsx`：在邮件服务项（`:157-164`）之后加导航项 `{ to: "/admin/platform/users", label: "平台用户", description: "C 端帐号检索与处置", icon: UsersRoundIcon, accent: "bg-franchise-cg", superOnly: true }`。`UsersRoundIcon` 已在该文件导入（`:27`）。
- 不要改 `apps/web/app/routes.ts`，也不要手工登记 SPA fallback。
- 更新 `apps/web/tests/unit/routes.test.ts:64` 的路由数量 51 → 52。

即时验证：

```sh
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm run test:web-routing
```

新增页面单测：

- 新建 `apps/web/tests/unit/pages/admin/platform-users/admin-platform-users-page.test.tsx`：权限兜底、检索写回 URL、上一页/下一页 disabled 条件、动作按钮按状态显隐、末位凭据拒绝的提示。

---

## 7. 收尾清单与门禁

```sh
# 契约一致性
pnpm --filter @imsweb/contracts run build

# 路由清单必须与源码同步
node scripts/contracts/compile-route-inventory.mjs --write
node scripts/contracts/compile-route-inventory.mjs

# 静态与边界
pnpm run check:rules
pnpm run check:boundaries
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck

# 测试
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test
pnpm --filter @imsweb/web run test:unit
pnpm run test:web-routing

# 跨 workspace 总门禁
pnpm run check
pnpm run test
```

浏览器验证（本地环境按 `docs/development/ai-environment.md`）：

```sh
pnpm run dev:doctor
pnpm dev
```

然后在 `/admin/platform/users` 手动走一遍：按邮箱搜到用户、打开详情、禁用后确认该用户请求被拒、启用、强制下线、触发重置、解绑末位凭据应被拒。

---

## 8. 评审闸门与回滚点

闸门 1（第 1 步后）：契约 `build` 与 `check:entrypoints` 通过，且 `package.json` / `index.ts` / `entrypoints.json` / `README.md` 四处同时更新。回滚：删除新文件、还原四处编辑。

闸门 2（第 2 步后）：`check:architecture` 通过，仓储 PostgreSQL 测试全绿。回滚：还原 port 与 impl，删除新测试文件。此时还没接路由，系统行为不变。

闸门 3（第 3 步后）：公开密码重置的既有 API 与 Web 测试全绿。这是行为等价性的硬闸门，未绿不许继续。回滚：还原 `reset-password.ts`，删除新文件。

闸门 4（第 4 步后）：新端点契约测试全绿，`--write` 后的路由清单可重复生成。回滚：撤 `app.ts` 注册、还原架构检查器分类表、删除新域目录与契约测试。此回滚会让端点立即不可达，其余功能不受影响。

闸门 5（第 6 步后）：Web 单测、`test:web-routing`、`pnpm run check` 与 `pnpm run test` 全绿。回滚：撤导航项与 route descriptor、删除页面目录、还原路由数量断言。

无数据库迁移，因此没有数据层回滚点；所有回滚都是代码还原。
