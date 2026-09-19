# 05 管理端契约范式

调研范围：`packages/contracts/src/admin.ts`、`packages/contracts/src/platform/admin.ts`、`packages/contracts/src/platform/admin-email.ts`、`packages/contracts/src/common.ts`、`packages/contracts/src/platform/index.ts`、`packages/contracts/README.md`、`packages/contracts/package.json`、`packages/contracts/src/index.ts`。

**[事实]** = 源码可读；**[推断]** = 建议。

---

## 1. 命名空间组织方式

**[事实]** 包是「平铺优先、获得第二个文件时升级为文件夹」（`README.md:44-46`）。当前结构：

- 根 `src/admin.ts`：后台会话与管理员账号（`README.md:23`）。
- `src/platform/index.ts`：平台公开会话/资料/OAuth 发现/注册验证。
- `src/platform/admin.ts`：超管 OAuth 提供方配置（`README.md:28`）。
- `src/platform/admin-email.ts`：超管 SMTP 邮件服务配置（`README.md:29`）。

**[事实]** 三个入口都要同步：

1. `package.json` 的 `exports` 子路径（`./platform/admin`、`./platform/admin-email`，见 `package.json` 内 `exports`）。
2. `src/index.ts` 的根命名空间 camelCase 聚合：`export * as platformAdmin from "./platform/admin.js"`、`export * as platformAdminEmail from "./platform/admin-email.js"`（`src/index.ts` 第 7-8 行区）。
3. Web 侧 `apps/web/app/lib/api/endpoints/index.ts` 的 `export * from`。

**[事实]** 根 `index.ts` 不做扁平 re-export，只按域聚合（`src/index.ts:1-4` 注释、`README.md:85-95`）。

---

## 2. `admin` 前缀与 public/admin 排序

**[事实]** `README.md:40-42`：多源汇聚域「公开在前、管理在后」，管理员 schema 以 `admin` 前缀区分（举例 `adminRecommendationSchema` vs `recommendationSchema`）。

**[事实]** 实际命名有两种形态，需要按所在文件选：

- 根 `admin.ts`：全部 `admin` 前缀 —— `adminRoleSchema`、`adminLoginRequestSchema`、`adminCreateAccountRequestSchema`、`adminAccountSchema`、`adminAuditLogSchema`…（`admin.ts:13-160`）。
- `platform/admin.ts`：以平台原子名开头、`Admin` 居中 —— `platformOAuthAdminProviderSchema`、`platformOAuthAdminErrorSchema`、`platformOAuthAdminHttpErrorSchema`（`platform/admin.ts:127-166`）。
- `platform/admin-email.ts`：`admin` 前缀 —— `adminPlatformEmailSettingsSchema`、`adminPlatformEmailConfigurationWriteRequestSchema`、`adminPlatformEmailHttpErrorSchema`（`admin-email.ts:17-104`）。

**[推断]** 命名不统一，但 `admin-email.ts` 的 `adminPlatformEmail*` 更符合 README 的「admin 前缀」规则，且能一眼看出属于管理端。平台用户契约建议用 **`adminPlatformUser*`** 前缀（如 `adminPlatformUserSchema`、`adminPlatformUserListQuerySchema`），与 `adminPlatformEmail*` 对称。

**[事实]** 请求 schema 与响应 schema 分列，`export type X = z.infer<...>` 紧跟在 schema 之后（`admin.ts:160-204`、`admin-email.ts:106-136`）。静态类型全部 `z.infer`（响应）或 `z.input`（Web 输入，见 `namecards.ts:87`）。

---

## 3. 分页响应用哪个共享件

**[事实]** 共享件在 `common.ts`：

- `successEnvelope(shape)` → `{ success: true, ...shape }` 且 `.strict()`（`common.ts:66-68`）。
- `numberedPageInfoSchema` = `{ page, pageSize, total, totalPages, hasNextPage }`（`common.ts:73-79`）。
- 另有 `cursorPageInfoSchema`（:70-73）、`snapshotPageInfoSchema`（:75-79）。

**[事实]** 管理端分页范例：名片审核用 `successEnvelope({ data: z.array(adminNamecardSchema), pageInfo: numberedPageInfoSchema })`（`namecards.ts:62-65`），API 侧手工算 `totalPages/hasNextPage`（`domains/community/namecards/moderation/handlers/list-admin-namecards.ts:20-42`）。

**[推断]** 平台用户列表应照此：`successEnvelope({ users: z.array(adminPlatformUserSchema), pageInfo: numberedPageInfoSchema }).strict()`。PRD 的「分页列表」用页码分页而非游标，符合管理端既有习惯。

---

## 4. 请求 schema 的 strict 政策怎么写

**[事实]** 三种显式策略 helper 都在 `common.ts`：

- `strictRequestObject(shape)` → `z.object(shape).strict()`，**新请求默认**（`common.ts:57-59`）。
- `legacyStripRequestObject(shape)` → `.strip()`，保留历史边界（:62-64）。
- `legacyPassthroughRequestObject(shape)` → `.passthrough()`（:66-69）。

**[事实]** 根 `admin.ts` 的请求全是**历史遗留 strip**：`adminLoginRequestSchema` 与 `adminCreateAccountRequestSchema`、`adminAccountIdParamsSchema` 都用 `legacyStripRequestObject`（`admin.ts:17-27`）。`platform/index.ts` 的新请求则直接 `z.object({...}).strict()`（`platform/index.ts:100-125`、`platform/admin.ts:76-102`）。

**[事实]** 响应 schema 全部 `exactJsonResponse` / `exactJsonError` / `successEnvelope`，即 `.strict()` 且不 coerce/transform/default/strip（`common.ts:9-20, 66-68`）。`AGENTS.md` 亦明确「New request schemas default to strict. Response schemas are exact」。

**[推断]** 新增平台用户管理请求 schema **一律用 `strictRequestObject`**（或直接 `z.object({...}).strict()`，与 `platform/admin.ts` 一致）。不要沿用根 `admin.ts` 的 legacy strip，因为这是新边界。

**[事实]** zod 单点封装：包内 `import { z } from "../z.js"` 或 `"zod"`（`platform/admin-email.ts:3`、`platform/admin.ts:1`）；应用侧只能 `@imsweb/contracts/z`（`README.md:74-80`）。Web endpoint 中若需解析，`import { z } from "@imsweb/contracts/z"`（`endpoints/platform/index.ts:29`）。

---

## 5. 错误 schema 的组织方式

**[事实]** 管理端模式（`platform/admin.ts:141-160`）：

- 业务错误 `platformOAuthAdminErrorSchema` = `{ success?: false, message }`。
- 冲突错误 `platformOAuthAdminConflictErrorSchema` = `{ success: false, code: 'REVISION_CONFLICT', provider }`。
- HTTP 错误联合 `platformOAuthAdminHttpErrorSchema` = `union([error, conflict, platformMiddlewareErrorSchema])`，其中 `platformMiddlewareErrorSchema` 来自 `./index.js` 即 `{ error: string.min(1) }`（`platform/index.ts:187-190`）。

**[事实]** `admin-email.ts:77-95` 完全对称，只是把 `provider` 换 `settings`。

**[推断]** 平台用户契约应定义：
- `adminPlatformUserErrorSchema`（message 形）
- `adminPlatformUserConflictErrorSchema`（`REVISION_CONFLICT` + 最新 user/detail）
- 末位凭据拒绝的可区分业务错误（例如 `{ success:false, code:'PLATFORM_OAUTH_LAST_LOGIN_METHOD' }`，对应 `DeletePlatformOAuthIdentityResult.last-login-method`）
- `adminPlatformUserHttpErrorSchema = union([... , platformMiddlewareErrorSchema])`

**[事实]** `platformMiddlewareErrorSchema` 是跨平台域的共享错误原子，导出在 `platform/index.ts:187`，管理端子文件从 `"./index.js"` 引用（`platform/admin.ts:5-11`）。

---

## 6. 新增平台用户管理契约的落点

**[推断]** 建议落点（按既有模式，不是硬性事实）：

| 项 | 落点 |
| --- | --- |
| 文件 | `packages/contracts/src/platform/admin-users.ts`（新建） |
| 前缀 | `adminPlatformUser*` / `adminPlatformUserIdParamsSchema` / `adminPlatformUserListQuerySchema` 等 |
| 子路径 | `@imsweb/contracts/platform/admin-users` |
| 根命名空间 | `export * as platformAdminUsers from "./platform/admin-users.js"`（`src/index.ts`） |
| package.json | 在 `exports` 加 `"./platform/admin-users"`，与 `"./platform/admin-email"` 同构 |
| `entrypoints.json` | 若该文件参与工具链清单，需同步（`README.md:97-99`） |
| Web endpoint | `apps/web/app/lib/api/endpoints/platform/admin-users.ts` |

**[推断]** 备选：并入根 `packages/contracts/src/admin.ts`。不推荐，理由：该文件是 `backoffice_accounts` 语义（`adminAccountSchema.id: number`），平台用户是 `platform_accounts`（`id: string`），混入会让两套「管理员账号」类型撞名、并违反「多来源域 public 先于 admin」的域边界直觉。

**[事实]** 契约变更的验证要求：`pnpm --filter @imsweb/contracts run build`，且 `pnpm run check:rules` 会检查 forbidden dirs、zod import、API domain 依赖方向、Web 测试位置、共享 URL 前缀；新增 schema/子路径/namespace 必须同时更新 `package.json`、`src/index.ts` 与对应 endpoint/API response tests（`README.md:76-84`）。
