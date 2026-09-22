# 01 管理端鉴权与路由链

调研范围：`apps/api/src/domains/admin/backoffice-auth/`、`apps/api/src/domains/admin/admin-accounts/`、`apps/api/src/middleware/hono-auth.ts`、`apps/api/src/app.ts`。

标注约定：**[事实]** = 源码直接可读；**[推断]** = 我的归纳或建议，未在源码中承诺。

---

## 1. Hono router 组织方式

**[事实]** 每个功能域导出一个 `registerXxxRoutes(app: ImsHonoApp): void`，在 `apps/api/src/app.ts` 集中按序调用。

- 注册顺序见 `apps/api/src/app.ts:262-278`，后台鉴权与平台鉴权在 262-268，`registerAuditRoutes` 在 278。
- 能力子路由用 `createCapabilityRouter()` 返回 `Hono<AppEnvironment>`，再通过 `app.route(prefix, router)` 挂到固定前缀。定义见 `apps/api/src/routing/capability-router.ts:11-13`。
- 两种写法并存：
  - **扁平直挂**：`registerAdminAccountRoutes` / `registerAuditRoutes` 直接在 `app` 上 `app.get/post/delete(adminApiPath(...), ...)`（`apps/api/src/domains/admin/admin-accounts/routes.ts:25-57`、`apps/api/src/domains/admin/audit/routes.ts:6-8`）。
  - **能力子路由**：`platformOAuthAdminRoutes()` / `platformEmailAdminRoutes()` 用 `createCapabilityRouter()` 注册相对路径，再由 `registerPlatformAuthRoutes` 用 `app.route(adminPlatformAuthOAuthPath(), ...)` 与 `app.route(adminApiPath('/platform/email'), ...)` 挂载（`apps/api/src/domains/identity/platform-auth/routes.ts:19-24`、`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:58-101`、`apps/api/src/domains/identity/platform-auth/email-settings/routes.ts:14-36`）。

**[事实]** URL 前缀只从 `@imsweb/contracts/paths` 取：`adminApiPath('/accounts')`、`adminPlatformAuthOAuthPath('/providers')`。不存在裸字符串前缀（`packages/contracts/src/paths.ts:2-12, 68-84`）。

**[推断]** 新增「平台用户管理」若只有一个能力组，照抄 `admin-accounts/routes.ts` 的扁平写法最省事；若预计会拆成 list/detail/actions 多个子模块，则照抄 `oauth/routes.ts` 的 `createCapabilityRouter` 写法。两者都必须用 `adminApiPath()`。

---

## 2. 管理员身份如何解析到 handler

**[事实]** 中间件把 claims 写进 Hono context，handler 用 `c.get()` 读取；Variables 类型在 `apps/api/src/app.ts:57-63`：

```ts
Variables: RequestIdVariables & {
    backofficeUser?: BackofficeJwtClaims;
    backofficeAuthSource?: "authorization" | "cookie" | "legacy-cookie";
    platformUser?: PlatformJwtClaims;
    platformAccount?: PlatformAccountWithProfile;
    platformAuthSource?: "authorization" | "cookie";
}
```

**[事实]** `authenticateBackofficeRequest` 解析 Bearer 或 cookie，verify 后 `c.set('backofficeUser', claims)`（`apps/api/src/middleware/hono-auth.ts:28-51`）。失败返回 401 `{success:false,message:'未登录'|'token无效'}`。

**[事实]** claims 形状由 `backofficeAccessTokenClaims` 生成：`id, username, producername, dept, adminRole, csrfSecret, jti`（`apps/api/src/domains/admin/backoffice-auth/backoffice-auth-session.ts:196-205`）。`adminRole` 取值 `"admin" | "super_admin"`（`packages/contracts/src/admin.ts:13`、`apps/api/src/ports/repositories/admin.ts:1`）。

**[事实]** `handleCheckBackofficeAuth` 直接回写 `c.get('backofficeUser')!`（`apps/api/src/domains/admin/backoffice-auth/handlers/check-auth.ts:6-11`）。

---

## 3. 角色门：`super_admin` 与 `admin` 差异如何表达

**[事实]** 角色差异由三个可组合中间件表达，全部在 `apps/api/src/middleware/hono-auth.ts`：

| 中间件 | 行 | 判定 | 失败 |
| --- | --- | --- | --- |
| `opOnly` (`requireOp`) | 172-178 | `claims.dept === 'op'`（只看 token，不查库） | `{message:'无权限（仅op可访问）'}` 403 |
| `currentBackofficeOp` (`requireCurrentBackofficeOp`) | 180-200 | 查库确认 `dept === 'op'`，并刷新 context claims | 403 |
| `superAdminOnly` (`requireSuperAdmin`) | 202-222 | 查库确认 `dept === 'op' && admin_role === 'super_admin'`，回写 `adminRole` | `{success:false,message:'仅最高管理员可执行此操作'}` 403 |
| `backofficeCsrf` | 224-252 | 非 GET/HEAD/OPTIONS 且非 Bearer 时校验 header/cookie/claims 三处 CSRF | `{success:false,message:'CSRF token invalid'}` 403 |

**[事实]** 导出别名在 `apps/api/src/middleware/hono-auth.ts:296-305`。

**[事实]** `admin-accounts/routes.ts:25-57` 的挂载范式（最完整，含角色门 + CSRF + 校验器）：

```ts
app.get(adminApiPath('/accounts'),
    backofficeAuth, opOnly, superAdminOnly, handleListAdminAccounts);
app.post(adminApiPath('/accounts'),
    backofficeAuth, opOnly, superAdminOnly, backofficeCsrf,
    jsonSchemaValidator(adminCreateAccountRequestSchema, {...}, normalizeCreateAdminAccountRequest),
    handleCreateAdminAccount);
app.delete(adminApiPath('/accounts/:id'),
    backofficeAuth, opOnly, superAdminOnly, backofficeCsrf,
    paramSchemaValidator(adminAccountIdParamsSchema, {...}, normalizeAdminAccountIdParams),
    handleDeleteAdminAccount);
```

**[事实]** `admin-accounts` 的三条路由全部要求 `super_admin`；`audit` 的路由只要求 `backofficeAuth, opOnly`（`apps/api/src/domains/admin/audit/routes.ts:6-8`）。平台 OAuth/邮件配置路由要求 `backofficeAuth, superAdminOnly`（无 `opOnly`，因为它们是 capability router，`backofficeAuth` 已足够；`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:58-101`、`email-settings/routes.ts:14-36`）。

**[推断]** 「平台用户管理」属于后台管理员直接操作 C 端数据，按 `admin-accounts` 范式加 `backofficeAuth → opOnly → superAdminOnly`，写操作再加 `backofficeCsrf`。是否对所有动作都用 `superAdminOnly` 需要产品确认；现有同类（改他人凭据）全部是 super_admin。

**[事实]** handler 侧读操作人：`const actor = c.get('backofficeUser')!;`（`apps/api/src/domains/admin/admin-accounts/handlers/delete-admin-account.ts:18`）。

---

## 4. 登录链（了解即可，不改造）

**[事实]** `login()` 在 `apps/api/src/domains/admin/backoffice-auth/handlers/login.ts:24-91`：查 `backofficeAuthRepository.findUserByUsername`（:33）→ 校验密码 → 可选 `requiredDepartment` 门（:41-47）→ 签 access token → `createRefreshSession`（:59）→ 直接调 `auditRepository.insertAuditLog` 写 `登录` 记录（:68-75，注意不是走 `writeAudit`）→ set cookies。三个入口 `handleBackofficeLogin` / `handleBackofficeAdminLogin` / `handleCanonicalBackofficeLogin` 在 :93-107。

**[事实]** 后台账号表是 `backoffice_accounts`（`findUserById`/`findUserByUsername` 在 `apps/api/src/ports/repositories/admin.ts:44-58`），与平台用户表 `platform_accounts` 完全分离。两者 ID 类型不同：`BackofficeAccountRecord.id: number`，`PlatformAccountRecord.id: string`（`apps/api/src/ports/repositories/admin.ts:4`、`apps/api/src/ports/repositories/platform.ts:16`）。

---

## 5. 新增管理端路由应照抄的范式

**[推断]** 清单：

1. 新建 `apps/api/src/domains/admin/<capability>/routes.ts`，导出 `registerXxxRoutes(app: ImsHonoApp): void`。
2. 每条路由用 `adminApiPath()`（或领域专用 builder）拼路径，**不写裸前缀**。
3. 中间件链固定顺序：`backofficeAuth → opOnly → superAdminOnly → [backofficeCsrf] → validator → handler`。
4. 请求校验用 `jsonSchemaValidator` / `paramSchemaValidator` / `querySchemaValidator`，并传自定义 `normalizeXxx` 与 `errorBody`（`apps/api/src/middleware/request-validation.ts`）。
5. handler 签名 `Context<AppEnvironment>` 或 `ValidatedRequestContext<AppEnvironment, 'json'|'param'|'query', Input>`（见 `admin-accounts/handlers/*.ts`）。
6. 在 `apps/api/src/app.ts` 的注册区（259-278）加一行 `registerXxxRoutes(app);`，位置与后台域相邻（建议紧跟 `registerAdminAccountRoutes`，`app.ts:268`）。
7. 契约 schema 只 type-only 导入到 handler；value-import 仅允许出现在 routes 的 validator 行（`admin-accounts/routes.ts:1-6` 的注释 `pi-lens-ignore` 亦印证）。

---

## 6. 未发现

**[事实]** grep `platform-users` / `platformUsers` / `admin/platform/users` / `listPlatformAccounts` / `searchPlatformAccounts` / `findAccountByEmail` / `findAccountByUsername` 在 `apps`、`packages` 下无任何命中——管理端平台用户管理端点与契约**不存在**。
