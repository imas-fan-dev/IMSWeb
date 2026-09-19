# 对齐 Trellis spec 与已落地代码

## Goal

`.trellis/spec/` 自 2026-09-13（31ff21e1）之后没有再整体校准，而这段时间落了四条线：平台账号管理（契约/API/管理端）、账号安全页与绑定、app OAuth 深链回跳、以及头像对象存储与邮件投递 worker。

本次做一次漂移刷新，交付两类结果：

1. **纠错**：删除或改写与当前代码直接冲突的陈述。已知一处硬冲突（"新 schema 一律 strict"）和若干误导性示例。
2. **补齐**：把已落地、但 spec 里完全没有的跨层契约与工程约定写成可执行条款，让后续实现者不必靠读代码反推。

覆盖 `.trellis/spec/` 全部五个目录：`api/backend`、`contracts/shared`、`web/frontend`、`repository`、`guides`。

用户价值：spec 是 Trellis 每个 Phase 的输入。漂移会让后续任务基于错误前提做设计。

## Background

三路只读盘点（api+contracts / web / repository+guides）已核对 spec 与代码，结论如下。

### 硬冲突（必须改，不改会误导实现）

- `api/backend/data-and-errors.md:10-11` 与 `contracts/shared/schemas-and-exports.md:35-36` 都写"新 request schema 一律 strict"，但 OAuth 的 start / callback query schema 是**刻意的例外**：`platformOAuthStartQuerySchema` 用 `.strip()`、`platformOAuthCallbackQuerySchema` 用 `.passthrough()`（`packages/contracts/src/platform/index.ts:237-253`，带 rationale 注释）。
- `web/frontend/api-state-and-contracts.md:43` 写"session token 不进 `localStorage`"，但打包 App 恰恰把 access + refresh 存在 `localStorage`（`apps/web/app/lib/api/platform-token-store.ts:20-22,78-86`，准入条件是 `usesPlatformBearerAuth = isCrossOriginApi`）。只有浏览器构建是纯 cookie。
- `web/frontend/architecture.md:5-6` 说路由清单直接映射页面模块，实际描述符已搬到 `app/route-metadata.ts`（`RouteDescriptor` / `SpaFallbackPattern` / `routeDescriptorsForTarget`），`routes.ts` 只剩按 target 过滤。
- `api/backend/architecture.md:40-46` 拿 `content/wiki` 当范例，却在同一段禁止 `service.ts` / `models.ts` / `handler-support.ts`，而该目录恰好三个文件都在；同段的 `story/` 实际是 `stories/`。
- `repository/index.md` 的边界 ratchet 说"按包 bump 计数"，实际 `tests/test_workspace_boundaries.py:230-232` 只锁 `root=57` / `apps/api=43` / `apps/web=21`，`packages/contracts` 的脚本数并不断言。

### 覆盖缺口（spec 里完全不存在）

**API / 契约**

- app OAuth 深链回跳与一次性码交换：`platform-auth/oauth/handlers/oauth-app-branch.ts`、`oauth-exchange.ts`、`oauth-link-branch.ts`。含 `client_target` 分流、`flow=link` 与登录回调互不消费、一次性码"先消费后比对"的防重放写法（`oauth-exchange.ts:26-31,75-96`）、PKCE verifier 不离开 app 进程。
- bearer 门控：只有 `wantsPlatformBearerTokens(c)` 为真才在响应体里回 token（`oauth-exchange.ts:55-63`），响应复用 `platformSessionSchema`。
- `requirePlatformJson` 的 415 content-type 契约（`platform-json-request.ts:5-22`）与 `PLATFORM_OAUTH_EXCHANGE_INVALID` 不回显的错误体。
- 深链常量 `APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback"`（`packages/contracts/src/paths.ts:9-12`）——`paths.ts` 不只拥有 HTTP 前缀。
- identity 域的职责切分：`platform-auth`（匿名/refresh）vs `platform-profile`（展示）vs `platform-account-security`（二次凭证与会话面），目前只在 `platform-account-security/routes.ts:9-18` 的代码里说明。
- admin platform-users 端点族及其中间件链 `backofficeAuth + opOnly + superAdminOnly + backofficeCsrf`（`domains/admin/platform-users/routes.ts:31-99`）。
- OAuth provider 端点的可信策略（loopback/私网拒绝、`allowInsecureLoopbackEndpoints`、`requestTimeoutMs`）与单 HTTPS `redirect_uri` 约束、provider secret 处理（`apps/api/src/config/platform-oauth.ts`）。
- 头像对象存储投递与 versioned key（`identity/platform-profile/handlers/upload-avatar.ts`、`serve-avatar.ts`、`utils/storage/business-object-keys.ts`）；现有 spec 只覆盖通用 private-media proxy。
- 审计动作约定：`ADMIN_PLATFORM_USER_ACTIONS` / `_RESULTS`、`logs.target` 的 `result=<token>` 后缀、不存在 result 列（`domains/admin/platform-users/audit-actions.ts:1-39`）。
- 平台安全事件约定：`platform_security_events`（如 `auth.oauth.linked` / `oauth_linked_by_owner`），与写入同事务（`oauth-link-branch.ts:130-140`）。
- 邮件投递 worker 运行时（`apps/api/src/email-worker-main.ts`、`dev:email-worker` / `start:email-worker`）与失败分类（`apps/api/src/ports/email-delivery.ts:1-21`）。
- 新增测试套件归属：`platform-oauth-callback-branches`、`platform-oauth-exchange`、`platform-oauth-wire-contract-conformance`、`platform-account-security.contract`、`admin-platform-users.contract`、`platform-account-management-repository`、`node-email-delivery-runner`。
- `platform/` 子模块导出：`account-security.ts`、`admin.ts`、`admin-users.ts`、`admin-email.ts` 及其 subpath（`@imsweb/contracts/platform/account-security` 等）。

**Web / Tauri**

- 整个 app OAuth 回跳场景（当前 `tauri-mobile-integration.md` 零覆盖）：
  - 深链配置 `src-tauri/tauri.conf.json:26-35`（scheme `imsweb`、host `oauth`、pathPrefix `/callback`）。
  - capability `deep-link:default` + `opener:allow-open-url` 的 scheme 允许/拒绝清单（`src-tauri/capabilities/default.json:8-20`），必须与 `system-opener.ts:24-33` 的 `BLOCKED_SYSTEM_PROTOCOLS` 保持镜像。
  - 监听器生命周期与冷启动缓冲：`startPlatformOAuthDeepLink`（`platform-oauth-deep-link.ts:141`）、每 flow 一个 pending payload、`subscribePlatformOAuthPayload` drain-once。
  - PKCE verifier 保管：`localStorage` key + 10 分钟 TTL + 内存兜底（`platform-oauth-app-verifier.ts:20-21,60-77`）。
  - flow 分流（`login` vs `flow=link`）、客户端 5 分钟等待 TTL、等待/取消 UI（`use-platform-oauth-app-login.ts`、`use-platform-oauth-app-link.ts`）。
  - `openSystemUrl` 在非 Tauri 环境直接抛错（`system-opener.ts:44-46`），因此 App Playwright 无法走完系统浏览器往返。
- bearer 传输整体缺失：`X-IMS-Auth-Mode: bearer` + `X-IMS-Refresh-Token`（`platform-token-store.ts:17-18`）、登录/刷新时 capture、登出时 clear（`platform-client.ts:143-151`）、storage 被拒时的内存镜像、一次性码交换（`endpoints/platform/oauth-exchange.ts:21-37`，`meta: withPlatformAuth({authRole:"login"})`）、facade 导出（`endpoints/index.ts:17-19`）。
- `AppLayout` 拥有 app 级 OAuth 回调路由：未认领 payload 走 `navigate(payload.flow === "link" ? "/account/security" : "/account/login", { replace: true })`（`app-layout.tsx:56-63`）——`app-navigation.md` 的权威列表未提，改 section 归属时容易误伤。
- 账号安全页模式（loading / `data-account-state` / 密码 / 会话设备 / 邮箱 / OAuth 绑定分区）与平台 provider 按钮渲染（App 是按钮 + 系统浏览器交接，Web 是文档链接；`components/platform/platform-oauth-button-theme.ts`、`platform-oauth-provider-icon.tsx`）；管理端 platform-users UI 约定。
- 测试：`tests/e2e/fixtures/platform-auth.ts`（`installPlatformOAuthProvidersMock` 等）、`app-oauth-sign-in.spec.ts:18-24` 的项目名 `test.skip` 门控、新覆盖归属 `platform-auth.spec.ts` / `platform-oauth-sign-in.spec.ts` / `platform-session-header.spec.ts` / `admin-platform-email.spec.ts`。
- `app/lib/navigation/`（`use-navigation.ts`、`resolve-navigation.ts`、`navigation-target.ts`、`system-opener.ts`）未进权威列表。

**Repository / guides**

- Playwright 失败证据契约：`if: failure()`、路径 `/tmp/imsweb-app-playwright` / `/tmp/imsweb-web-playwright`、artifact 名 `app|web-playwright-${{ github.run_id }}-${{ github.run_attempt }}`、`retention-days: 7`（`ci.yml:131-138,177-184`）——根测试已断言，spec 未提。
- `deploy.yml` 的 job 清单（`prepare` / `publish` / `resolve-image` / `deploy`）未记录，尽管 §1 声明它是完整发布校验。
- 文档元数据门禁：`check:rules` 含 `scripts/check-docs.mjs`，要求 `docs/*.md` 首行 `# ` + `> 文档类型：` / `> 状态：(Active|Decision)` / `> 权威来源：`（1500 字符内），禁日期快照，禁 `docs/archive|evidence|screenshots/`（`check-docs.mjs:10-14,30-32,49,52,60-79`）。
- `check:rules` 的两半（`scripts/check-agent-rules.mjs:22` 管 `.rules`/`AGENTS.md`/`CLAUDE.md`；`check-workspace-boundaries.mjs`）与 pre-commit 的实际范围（`.husky/pre-commit` → `check:pre-commit`，刻意窄于 CI，见 `docs/development/testing.md:109-126`）。
- 归档/留存规则：发布证据与一次性记录归 PR/Issue/release record，不进 `docs/`（`docs/README.md:6-8`）。
- route-ownership 编译门禁 `scripts/contracts/compile-route-inventory.mjs`（由 `check:rules` 运行）未与 `test:web-routing` 并列点名。
- 各 workspace 的 `.rules`（`.rules`、`apps/api/.rules`、`apps/web/.rules`、`packages/contracts/.rules`）是本地约定的权威来源，`guides/` 从未引用。

### 已确认准确（本次不动）

`repository/ci.md` 全部命名构件、`repository/cloudflare-operations.md`、`api/backend/index.md`、`api/backend/testing.md` 的套件映射与命令、`contracts/shared/index.md` 与 `quality.md`、`web/frontend/index.md` 的 Quality Check 命令、`web/frontend/components-and-ux.md` 的样式层与场景、`app-navigation.md` 的签名与断言、`tauri-mobile-integration.md` 的 geolocation/图标/viewport 场景。22 个 spec 文件**零断链**。

## Requirements

- MR1 修掉 Background"硬冲突"列出的全部五处陈述，改后与代码一致，并在需要处点明"为什么"而非只改字面。
- MR2 "新 request schema 默认 strict"改为带例外的表述：明确 `.strip()` / `.passthrough()` 是**带 rationale 的显式豁免**，并要求豁免处必须留注释说明原因。同步 `api/backend/data-and-errors.md` 与 `contracts/shared/schemas-and-exports.md`。
- MR3 `api/backend/architecture.md` 换掉自相矛盾的范例，改指一个真实符合该段规则的 domain；修正 `story/` → `stories/`。
- MR4 新增 API 契约场景（7 段式）：app OAuth 深链回跳与一次性码交换。必须含 `client_target` / `flow` 分流、一次性码先消费后比对、重放与时序拒绝、bearer 门控、`PLATFORM_OAUTH_EXCHANGE_INVALID` 不回显、`requirePlatformJson` 415。
- MR5 新增 API 契约场景：identity 域职责切分 + platform-account-security 面。
- MR6 新增 API 契约场景：admin platform-users 端点族与中间件链（含 `superAdminOnly` 与 backoffice CSRF 的组合约束）。
- MR7 新增 API 契约场景：头像对象存储投递（versioned key、公开读取路径、与 private-media proxy 的区别）。
- MR8 补充 API 安全与可观测性：审计动作约定（action/result token、`logs.target` 后缀、无 result 列）与平台安全事件（同事务写入、事件命名）。
- MR9 补充 API 运行时：邮件投递 worker 的启动命令、失败分类与重试边界。
- MR10 `contracts/shared/schemas-and-exports.md` 补齐 `platform/` 子模块与 subpath 导出清单，并说明 `paths.ts` 同时拥有深链常量。
- MR11 新增 Web/Tauri 契约场景：OAuth 回跳通道。必须含深链配置、capability 与 `BLOCKED_SYSTEM_PROTOCOLS` 的镜像义务、监听器生命周期与冷启动 drain-once、PKCE verifier 保管与 TTL、flow 分流、等待/取消 UI、以及"非 Tauri 环境 `openSystemUrl` 抛错 ⇒ 浏览器 E2E 走不完往返"的取证边界。
- MR12 重写 `api-state-and-contracts.md` 的 token 存放条款：按构建目标区分 cookie 与 bearer `localStorage`，并记录 bearer 头、capture/clear 时机、storage 被拒时的内存镜像。
- MR13 修正 `web/frontend/architecture.md` 的路由清单描述，补 `route-metadata.ts` 的描述符模型与 target 过滤职责。
- MR14 补充 `app-navigation.md`：`AppLayout` 拥有 app 级 OAuth 回调路由及其不可扰动约束；权威列表补 `app/lib/navigation/`。
- MR15 补充 `components-and-ux.md`：账号安全页模式与平台 provider 按钮在 App/Web 的渲染差异。
- MR16 补充 `web/frontend/testing.md`：platform-auth E2E fixture、项目名 `test.skip` 门控、OAuth 覆盖归属，以及"深链 + 交换需模拟器/真机证据"的规则。
- MR17 补充 `repository/ci.md`：Playwright 失败证据 contract（路径、artifact 名、retention）与 `deploy.yml` job 清单。
- MR18 修正 `repository/index.md` 的 ratchet 表述为实际断言的三个计数；补充文档元数据门禁、`check:rules` 两半、pre-commit 实际范围、归档留存规则。
- MR19 补充 `guides/`：`.rules` 优先的权威模型、`compile-route-inventory.mjs` 门禁、各 workspace `.rules` 指针。guides 保持"检查清单 + 指针"，不复制 spec 细节。
- MR20 更新受影响的 `index.md` spec map（至少 `web/frontend/index.md`、`api/backend/index.md`、`contracts/shared/index.md`），使新增场景可被发现。
- MR21 新增内容一律沿用仓库既有的 7 段式 `## Scenario:` 模板（Scope / Signatures / Contracts / Error Matrix / Cases / Tests / Wrong-vs-Correct）；纯约定类内容用既有 `### Convention:` / `### Design Decision:` 形态。
- MR22 不改动 Background"已确认准确"清单中的内容，除非某条与新增内容直接矛盾。

## Acceptance Criteria

- [x] AC1 Background"硬冲突"五处全部消除；逐条给出改后行号与对应代码 file:line。
- [x] AC2 strict / strip / passthrough 的表述在 `api/backend/data-and-errors.md` 与 `contracts/shared/schemas-and-exports.md` 之间不矛盾，且都指向同一豁免规则。
- [x] AC3 MR4–MR11 的每个新增场景都含全部 7 段（或明确写出为何某段不适用），且 Signatures/Contracts 段中的每个路径、符号、常量都能在代码中定位。
- [x] AC4 深链相关 spec 明确写出 capability 允许清单与 `BLOCKED_SYSTEM_PROTOCOLS` 的镜像关系，并说明破坏镜像的后果。
- [x] AC5 一次性码交换场景写出重放被拒、超时被拒、以及"消费先于比对"的顺序要求。
- [x] AC6 MR17/MR18 中每个被点名的路径、命令、env 变量、artifact 名都实际存在（用 `ls` / `rg` 复核并留证）。
- [x] AC7 `.trellis/spec/**/*.md` 零断链（相对链接全部可解析）。
- [x] AC8 `pnpm run check:rules` 通过。
- [x] AC9 全文不出现无代码依据的断言；每条新增规则至少有一处 file:line 支撑。
- [x] AC10 未修改 `apps/`、`packages/`、`docs/` 下的生产或文档文件；本次改动只落在 `.trellis/spec/`（以及本任务目录）。

## Verification Evidence

- 独立核验由 `trellis-check` 完成，逐条打开代码复核路径/符号/常量/测试文件名，并修复 3 处事实错误：
  - `api/backend/architecture.md` 把 `start:email-worker` 误称为 root script（它只在 `apps/api/package.json`）
  - 把 `content/wiki/README.md` 的高扇入标注扩大到了 `models.ts`（README 只标了 `service.ts` 与 `handler-support.ts`）
  - `api/backend/authentication.md` 的 loopback 拒绝条款与自身的 loopback 例外自相矛盾
- `pnpm run check:rules`：通过（agent rules 4 scopes、source rules 895 files、contracts 30 entrypoints、wire audit 0 violations、route inventory 244 method/path、docs rules 25 files）。
- 链接与锚点检查：22 个 spec 文件，0 断链、0 断锚。
- pre-commit 钩子在提交时通过：contracts owner 29 tests、API migration 114 tests、Web routing 4 tests、`check:root`、Web lint + typecheck、API syntax + architecture（381 modules）。
- 提交：`4c056789 docs(trellis): refresh specs against the landed account, OAuth, and CI work`（19 个 spec 文件，+1111/−33）。

## Out of Scope

- 新增或修改任何生产代码、测试代码、契约 schema。
- 修改 `docs/**`（那是 `docs/` 自己的权威来源；如发现 docs 漂移，只记录不代改）。
- 补全 AGENTS 提到的"fail-closed API/Web ownership 与 type-aware route analysis"等尚未完成的机制。
- 为 coverage 缺口新增 spec 目录层级或重命名现有文件。
- 把本任务转成 workflow / 多 agent 并行执行。

## Notes

- 本次是文档维护，不写 `design.md`；`prd.md` 即交付清单。执行顺序按包分组，避免同一文件多次改写：contracts → api → web → repository → guides → index。
- 落点已定（不新建除下述一个以外的文件）：
  - `api/backend/authentication.md`（**新建**）：identity 域职责切分、OAuth 登录/绑定流程、深链回跳与一次性码交换、bearer 门控、provider 信任策略与单 `redirect_uri` 约束。主题独立且现有文件已 271 行，故拆出。
  - `api/backend/architecture.md`：修范例、修正 `stories/`、补 identity 域切分指针、补邮件 worker 入口。
  - `api/backend/data-and-errors.md`：修 strict 表述、补 `requirePlatformJson` 415 与不回显错误体、补头像对象存储投递场景。
  - `api/backend/observability-and-security.md`：补审计动作约定、平台安全事件、provider secret 处理。
  - `api/backend/testing.md`：补新套件归属与交换/replay 一致性断言义务。
  - `contracts/shared/schemas-and-exports.md`：补 strict 豁免、`platform/` 子模块 subpath、`paths.ts` 深链常量。
  - `web/frontend/api-state-and-contracts.md`：重写 token 存放条款、补 bearer 传输与一次性码交换。
  - `web/frontend/architecture.md`：修路由描述符模型。
  - `web/frontend/app-navigation.md`：补 `AppLayout` OAuth 回调路由与 `app/lib/navigation/` 权威项。
  - `web/frontend/components-and-ux.md`：补账号安全页与 provider 按钮渲染差异。
  - `web/frontend/testing.md`：补 platform-auth fixture 与 OAuth 覆盖归属。
  - `web/frontend/tauri-mobile-integration.md`（**追加 Scenario**）：OAuth 回跳通道。
  - `repository/ci.md`：补 Playwright 证据 contract 与 `deploy.yml` job 清单。
  - `repository/index.md`：修 ratchet 表述、补文档元数据门禁与 pre-commit 范围。
  - `guides/index.md`、`guides/cross-layer-thinking-guide.md`、`guides/code-reuse-thinking-guide.md`：补权威模型与门禁指针。
  - 四个 `index.md` spec map 同步。
- 所有"已确认准确"的文件不要在本次顺手润色，避免无依据的 diff 噪声。
- 实现与核查在主线会话内完成，不派 sub-agent：跨文件措辞必须一致（尤其 strict/strip/passthrough 一处规则两处表述），且 gap inventory 已在主上下文。
- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
