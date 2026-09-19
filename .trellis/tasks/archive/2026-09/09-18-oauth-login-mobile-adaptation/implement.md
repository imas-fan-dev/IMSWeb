# OAuth 登录的 Web 与移动端适配 — 执行计划

> 只规划，不改产品代码。每条给出具体文件、产出物与验证方式。
> 标 **[真机]** 的条目必须有独立自包含包（`pnpm run app ios|android`）的设备证据，
> `--live` 会话不算。理由：`dev:app` 会清空 `VITE_IMS_API_ORIGIN`
> （`apps/web/.env.example:26`、`docs/development/tauri-mobile.md:165`），前端退回 cookie 通道，
> 与打包包的 bearer 通道行为不同。

顺序：契约 → 一次性码存储/服务 → 回调分流 → 换取会话端点 → Web 发起侧 → Tauri 深链 →
移动 Web 降级。

---

## 0. 启动前

- 读 `design.md`（本任务）与 `.trellis/tasks/09-18-account-oauth-email-binding/prd.md:33-37, 98-99`，
  确认第 5 节的 state 共存契约在两边一致。
- `pnpm run check:rules` 基线通过。

---

## 1. 契约（先合并，其余都依赖它）

1.1 `packages/contracts/src/paths.ts`
- 新增 `APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback"`（API 与 Web 共用，禁止各自硬编码）。
- 产出：导出常量；`packages/contracts/README.md` 若有路径清单则同步一条。

1.2 `packages/contracts/src/platform/index.ts`
- 扩 `platformOAuthStartQuerySchema`（`:233`）：加 `client: z.enum(["web","app"]).optional()` 与
  `codeChallenge: z.string().min(43).max(43).optional()`，保持 `.strip()`。
- 新增 `platformOAuthExchangeRequestSchema`（`.strict()`）与类型 `PlatformOAuthExchangeRequest`。
- 导出类型 `PlatformOAuthExchangeRequest`。响应复用 `platformSessionSchema`，错误复用
  `platformHttpErrorSchema`，无需新 schema。
- 产出：`pnpm --filter @imsweb/contracts run build` 通过；根 namespace 不变（同模块，无需改
  `src/index.ts` 与 `package.json` exports）。

1.3 契约测试
- 扩 `apps/api/tests/server/platform-oauth-wire-contract-conformance.test.ts`：
  `platformOAuthStartQuerySchema` 对 `client/codeChallenge` 的原样透传、`client=app` 无 challenge
  的拒绝路径；exchange 请求体拒绝未知键。
- 验证：`cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test tests/server/platform-oauth-wire-contract-conformance.test.ts`。

---

## 2. 一次性码存储与服务

2.1 迁移 `apps/api/migrations/postgresql/20260918120000_platform_oauth_app_exchange.sql`
- 建 `platform_oauth_exchange_codes`；`platform_oauth_states` 加 `client_target`、`app_code_challenge`
  与一致性 CHECK。内容见 `design.md` 第 7 节。
- 产出：`pnpm --filter @imsweb/api run migration:postgres`（或仓库既有迁移入口）在本地库成功；
  `apps/api/tests/migration/postgres-migrations.test.js` 通过。

2.2 端口 `apps/api/src/ports/repositories/platform.ts`
- `PlatformOAuthStateRecord`（`:149`）加 `client_target: "web" | "app"`、`app_code_challenge: string | null`。
- `NewPlatformOAuthStateInput`（`:160`）`intent` 放宽为 `"login" | "link"`，加
  `linkingAccountId: string | null`（与绑定任务共享）、`clientTarget`、`appCodeChallenge`。
- 新增 `PlatformOAuthExchangeCodeRecord`、`NewPlatformOAuthExchangeCodeInput`。
- 仓储接口加 `createOAuthExchangeCode` / `consumeOAuthExchangeCode` /
  `findOAuthStateClientTarget`（批次 2 改名为 `findOAuthStateReturnChannel`，见 `design.md` 第 12.3 节）。

2.3 仓储 `apps/api/src/infra/db/repositories/platform-account-repository.ts`
- `createOAuthState`（`:498-521`）：INSERT 列表加 `client_target` / `app_code_challenge`；
  `linking_account_id` 用 `input.linkingAccountId`（本任务恒 `null`）。
- `consumeOAuthState`（`:524-540`）：**删掉 SQL 里的 `AND intent='login'`**，`RETURNING` 补两列，
  由调用方按 `intent` 分流（与绑定任务约定，见 `design.md` 第 5 节）。
- 新增 `createOAuthExchangeCode`（清过期 + INSERT，`serializeWrite` 批）、
  `consumeOAuthExchangeCode`（`DELETE ... WHERE code_hash=? AND expires_at>? RETURNING account_id, code_challenge`）、
  `findOAuthStateClientTarget`（只读 `SELECT client_target`）。
- 有效 `intent` / `client_target` 常量与 `expires_at` 校验集中在此文件。

2.4 与绑定任务的接口对齐检查
- 确认两任务对 `consumeOAuthState` 采用同一签名（推荐：无 intent 参数、调用方分流）。
- 验证：`cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test tests/server/platform-oauth-wire-contract-conformance.test.ts`。

---

## 3. 回调分流

3.1 `apps/api/src/domains/identity/platform-auth/oauth/handlers/oauth-login.ts`
- `handlePlatformOAuthStart`（`:75-102`）：读 `query.client` / `query.codeChallenge`；`client==='app'`
  时校验 challenge 格式（`^[A-Za-z0-9_-]{43}$`），缺失/非法 → `redirectToLogin('invalid')`；
  `createOAuthState` 传 `clientTarget` / `appCodeChallenge`。否则维持现状（`web`）。
- `handlePlatformOAuthCallback`（`:104-171`）：
  - 失败分支（`:116`）：`state` 存在时调 `findOAuthStateClientTarget`，`app` → 303 到
    `APP_OAUTH_CALLBACK_URL + ?error=denied`，否则维持 `redirectToLogin`。
  - 消费后（`:123` 起）：`intent==='link'` 交绑定分支（本任务先留显式 TODO/拒绝，避免误跑登录）；
    `client_target==='app'` → 不调 `establishPlatformSession`，生成一次性码并 303 到
    `APP_OAUTH_CALLBACK_URL + ?code=<code>`；否则维持现状。
  - app 分支同样复用 `createOAuthAccount`（`:130-155`）。
- 产出：新增局部函数 `redirectToAppCallback(c, params)`；`APP_OAUTH_CALLBACK_URL` 从
  `@imsweb/contracts/paths` 导入。

3.2 回调单测 `apps/api/tests/server/platform-oauth-wire-contract-conformance.test.ts`（或新测试文件）
- web 路径逐字节不变；app 路径产出 `Location: imsweb://...`；app 失败 → `?error=`；
  `link` intent 不被本任务消费。
- 验证命令同 2.4。

---

## 4. 换取会话端点

4.1 `apps/api/src/domains/identity/platform-auth/oauth/routes.ts`
- `routes.post('/exchange', publicOAuthExchangeJson, jsonSchemaValidator(platformOAuthExchangeRequestSchema, {...}), handlePlatformOAuthExchange)`。
- 用既有的 `requirePlatformJson`（`platform-json-request.ts`）保证 JSON 正文。

4.2 `apps/api/src/domains/identity/platform-auth/sessions/handlers/` 或 oauth `handlers/`
- 新增 `handlePlatformOAuthExchange`：
  - 先判 `wantsPlatformBearerTokens(c)`（`session.ts:89`），否则 400
    `PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED`。
  - `consumeOAuthExchangeCode(hashValue(code), Date.now())`；空 → 401 `..._EXPIRED`。
  - 重算 `base64url(sha256(codeVerifier))`，用 `@/utils/crypto/constant-time` 的
    `constantTimeEqual` 与 `code_challenge` 比对；不等 → 401 `..._INVALID`。
  - `findAccountWithProfileById(account_id)` → `establishPlatformSession` →
    `platformSessionPayload` → `c.json(... satisfies PlatformSession)`。
  - 失败码见 `design.md` 第 6 节。

4.3 限流 `apps/api/src/middleware/rate-limit.ts`
- 新增 `PLATFORM_OAUTH_EXCHANGE_LIMIT`；在 `requestSpecificLimit` 加
  `POST platformAuthOAuthPath('/exchange')` 分支。

4.4 契约路由清单
- `node scripts/contracts/compile-route-inventory.mjs --write`，然后
  `node scripts/contracts/compile-route-inventory.mjs`（新鲜度门禁）。
- 产出：`scripts/contracts/current-wire-contract-inventory.json` 更新。

4.5 API 测试
- exchange 成功换 token、重放 401、过期 401、verifier 不匹配 401、缺 bearer 头 400、限流 429。
- 验证：`cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test tests/server/*.test.ts`。

---

## 5. Web 发起侧（app 内启用入口）

5.1 `apps/web/app/lib/api/endpoints/platform/index.ts`
- 新增 `exchangePlatformOAuthSession(input)`：`parsed(platformSessionSchema, { errorSchema:
  platformHttpErrorSchema, meta: withPlatformAuth({ authRole: "login" }),
  headers: { "X-IMS-Auth-Mode": "bearer" }, select: normalizePlatformSession })`；
  路径用 `platformAuthOAuthPath("/exchange")`；请求体过契约 schema。

5.2 `apps/web/app/lib/platform-oauth-deep-link.ts`（新）
- 纯函数 `parsePlatformOAuthCallbackUrl(url)`（严格匹配 `APP_OAUTH_CALLBACK_URL`，返回
  `{code}` / `{error}` / `null`）与 `subscribePlatformOAuthCallback(handler)`
  （`getCurrent()` + `onOpenUrl()`，非 app/Tauri 时 no-op）。

5.3 `apps/web/app/pages/account/components/use-platform-oauth-app-login.ts`（新，页面私有）
- `start(providerCode)`：生成 verifier/challenge（Web Crypto），verifier 存内存 + `sessionStorage`
  兜底；`openSystemUrl(`${API_ORIGIN}${platformAuthOAuthPath(...)}`)`；置等待态。
  当 `API_ORIGIN` 为空（`--live`）时不暴露入口。
- 订阅深链：`code` → `exchangePlatformOAuthSession` →（拦截器已 `capturePlatformTokens`）
  `acceptSession(session)`（`platform-session-provider.tsx:74-77`）→ 跳 `/account/me`。
  `error` → 映射文案并结束等待。
- `cancel()` 与 300 秒超时清除 verifier 与等待态。

5.4 `apps/web/app/pages/account/components/platform-oauth-app-section.tsx`（新）
- 等待态 UI（含取消按钮）与错误提示。

5.5 `apps/web/app/pages/account/components/account-auth-form.tsx`
- `:132` 改为 `if (isReset) return`（app 也拉 provider 列表）。
- `:880-900`：`IS_APP_TARGET ? <PlatformOAuthAppSection providers=... /> :
  <NavigationBoundary availability="web">…原 JSX 不动…</NavigationBoundary>`；web 输出保持逐字节。
- i18n：`apps/web/app/i18n/resources.ts` 新增 `platformAuth.oauth.*` 的 app 等待/取消/重试键（中英）。
- 测试：`apps/web/tests/unit/...` 覆盖深链解析、等待态、取消、错误映射；`VITE_IMS_APP_TARGET=web`
  下 web 分支不变。
- 验证：`pnpm --filter @imsweb/web exec vitest run tests/unit`；
  `pnpm --filter @imsweb/web run format && pnpm --filter @imsweb/web run lint`。

---

## 6. Tauri 深链声明与监听

6.1 依赖
- `apps/web/src-tauri/Cargo.toml`：`tauri-plugin-deep-link = "2"`。
- `apps/web/package.json`：`@tauri-apps/plugin-deep-link`。

6.2 注册与配置
- `apps/web/src-tauri/src/lib.rs:32-41`：`.plugin(tauri_plugin_deep_link::init())`。
- `apps/web/src-tauri/tauri.conf.json`：顶层加 `plugins.deep-link.mobile =
  [{ "scheme": ["imsweb"], "host": "oauth", "pathPrefix": ["/callback"] }]`（见 `design.md` 第 8 节）。
- `apps/web/src-tauri/capabilities/default.json`：加 `"deep-link:default"`。
- **不要**改 `Info.ios.plist`、**不要**改 `src-tauri/gen/`。

6.3 基础设施测试 `tests/tauri-build-configuration.test.js`
- 断言 `tauri.conf.json` 的 scheme/host/pathPrefix 与 `APP_OAUTH_CALLBACK_URL` 一致；
  `Cargo.toml`/`package.json` 依赖存在；capability 含 `deep-link:default`；`Info.ios.plist` 不含
  `CFBundleURLTypes`。

6.4 **[真机] 平台声明验证**
- 安装自包含包后检查合并产物：
  - Android：`$ANDROID_HOME/build-tools/<ver>/aapt dump xmltree <apk> AndroidManifest.xml | grep -A6 intent-filter`
    或在 `src-tauri/gen/android/app/src/main/AndroidManifest.xml` 检查插件写入。
  - iOS：`plutil -p <app>/Info.plist | grep -A4 CFBundleURLTypes`（`gen/apple/build/**/*.app`）。
- 若 intent-filter 缺失：启用第 8 节兜底脚本 `apps/web/scripts/android-oauth-deeplink.js`
  （在 `build-app.js:118-131` 旁调用），再复验；仍不达标则阻断发布。
- 手工深链冒烟（模拟器即可）：
  - `xcrun simctl openurl booted "imsweb://oauth/callback?code=test"`
  - `adb shell am start -a android.intent.action.VIEW -d "imsweb://oauth/callback?code=test"`

---

## 7. 移动 Web 三处降级修复

7.1 `apps/web/app/pages/account/components/account-auth-form.tsx`
- provider 加载：状态机 + `Alert` 失败态 + 重试按钮（`:134-144`）。
- `?oauth=<reason>`：读参、映射（`i18n/resources.ts:377-383, 798-804`）、`setSearchParams` 清理。
- 邮箱草稿：`sessionStorage` 键 `ims.platform.email-draft`，成功/登出清除。

7.2 i18n
- 新增 `platformAuth.oauth.loadFailed` / `retry` / `waiting` / `cancel` / `tryAgain`（中英各一处）。

7.3 测试
- `apps/web/tests/unit/pages/account/**`：失败态可重试、`oauth` 参数映射与清除、草稿回填/清除。
- `pnpm --filter @imsweb/web exec vitest run tests/unit`。

---

## 8. Android 深链兜底脚本（条件项）

仅当 6.4 证实插件未注入 intent-filter 时执行：

- 新增 `apps/web/scripts/android-oauth-deeplink.js`：导出
  `configureGeneratedAndroidOAuthDeepLink({ manifestPath, scheme, host, pathPrefix })`，
  在 `MainActivity` `<activity>` 块内幂等插入 `<intent-filter>`（含 `VIEW` +
  `org.chromium.arc.intent.action.VIEW`、`DEFAULT`、`BROWSABLE`、`<data>` 三项）。
- `apps/web/scripts/build-app.js:118-131` 的 `runAppBuild` 末尾调用（与
  `configureGeneratedAndroidCleartext` 并列）。
- 新增单测（参照 `tests/tauri-device-delivery.test.js` 的脚本测试风格）：缺失 manifest 返回 false；
  重复调用不产生第二份 intent-filter。
- 验证：`node --test tests/tauri-build-configuration.test.js tests/tauri-device-delivery.test.js`。

---

## 9. 真机验收清单（AC 映射）

前置：`pnpm run app:doctor`（必须无 `fail`）；`pnpm run app devices` 选定目标。

- [ ] **[真机] AC1/AC2** `pnpm run app ios` 与 `pnpm run app android` 各装一次；登录页可见 OAuth 入口；
      点按后**系统浏览器**打开 provider 页，app 内出现等待态。
- [ ] **[真机] AC3/AC5** 授权完成后 app 自动回前台并完成登录（`/account/me`），
      且 `localStorage` 有 `ims.platform.access-token` / `ims.platform.refresh-token`，无 cookie 依赖。
- [ ] **[真机] AC7** 在浏览器取消授权：app 等待态结束并提示（走 `?error=denied` 深链；失败时靠超时兜底）。
- [ ] **[真机] AC4** 复放同一 `imsweb://oauth/callback?code=...` 或二次 POST exchange → 401；
      等待 300 秒后 → 401。
- [ ] **AC6** Web 桌面 + 移动浏览器登录与改动前一致（同一构建跑 Playwright/手工回归）。
- [ ] **AC8/AC9** 断网/拦截 `/providers` 后入口显示失败态与重试；造
      `/account/login?oauth=denied` 显示原因。
- [ ] **AC10** 复查 `platform_oauth_providers` 结构与 `validatePlatformOAuthRedirectUri` 未变
      （`git diff` 两者为空）。

打包包验证（**不可用 `--live` 替代**）：

```sh
pnpm run app:doctor
pnpm run app devices
pnpm run app ios                       # 自包含 debug 包，bearer 通道
pnpm run app android
# 可选：Release
pnpm run app ios --release
pnpm run app android --release
```

`--live` 仅用于 UI 迭代：`pnpm run app ios --live`（会清空 `VITE_IMS_API_ORIGIN`，OAuth 入口隐藏）。

---

## 10. 评审闸门与回滚点

**闸门（每道都跑真实命令）**

1. 契约合并前：`pnpm --filter @imsweb/contracts run build && pnpm run check:rules`。
2. 存储/回调/exchange 合并前：
   `cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test tests/server/*.test.ts`；
   `node scripts/contracts/compile-route-inventory.mjs`（清单新鲜）。
3. Web 合并前：`pnpm --filter @imsweb/web exec vitest run tests/unit`、
   `pnpm --filter @imsweb/web run format`、`pnpm --filter @imsweb/web run lint`。
4. Tauri 合并前：`tests/tauri-build-configuration.test.js`、`tests/tauri-device-delivery.test.js`、
   `cargo check --target aarch64-apple-ios-sim`（在 `apps/web/src-tauri`）。
5. 发布前：`pnpm run check`、`pnpm run test`、第 9 节真机清单全绿。

**回滚点**

- 迁移 → API：加列有 `DEFAULT 'web'`，API 回滚不必动 schema；必要时执行 `design.md` 第 7 节的
  down SQL（先删约束再删列、drop 表）。
- 回调分流 + exchange：回滚后 `client=app` 的 `/start` 必须仍能拒绝（处理器在缺少 exchange 能力时
  `redirectToLogin('unavailable')`），不得产生悬空深链。
- Tauri：移除依赖、`plugins.deep-link`、capability 即回到无深链状态；`Info.ios.plist` 与 `gen/`
  从未被本任务改动，无需还原。
- Web app 入口：恢复 `IS_APP_TARGET` 守卫即回到现状；web 分支 JSX 未动，无回归面。

---

## 11. 待产品确认

仅一项：是否接受「跳出去再回来」的外部浏览器体验（方案 A/C 固有）。其余前提已拍定，
`design.md` 第 11 节风险表中列出的 iOS 回跳行为需真机结论，若不可接受则切换到 HTTPS 中转页方案，
不需要改动本计划的第 1–5 步。

---

## 12. 批次 2：app 内 OAuth 绑定（link）回跳

> 追加于 2026-09-20。触发缺陷：app 内账号安全页点「绑定」把 WebView 整页导航到
> `/api/platform/me/oauth-links/<provider>/start`，document 导航带不出 bearer，API 回
> 401 `PLATFORM_SESSION_INVALID`，WebView 把 JSON 渲染成页面。
> 登录通道（批次 1）不变；这里补齐 link 的 app 回跳通道。绑定语义/端点仍归
> `09-18-account-oauth-email-binding`。

### 契约（先落，其余依赖）

12.1 `packages/contracts/src/platform/account-security.ts`
- 新增 `platformOAuthLinkAppStartRequestSchema`：`{ codeChallenge: /^[A-Za-z0-9_-]{43}$/ }`，`.strict()`。
- 新增 `platformOAuthLinkAppStartResponseSchema`：`successEnvelope({ authorizationUrl: z.string().min(1).max(4096) }).strict()`。
- 导出对应类型。根 namespace 不变（同子路径）。
- 验证：`pnpm --filter @imsweb/contracts run build`。

### API

12.2 共享 start 核心：`oauth-links/oauth-link-round-trip.ts`（capability 根，用途命名模块）
- 从 `handlers/start-oauth-link.ts` 抽出「provider 解析 → 服务端 PKCE → 授权 URL → 建 state」，
  GET 与 POST 两个 handler 共用；GET 行为逐字节不变（`clientTarget: 'web'`、`appCodeChallenge: null`）。

12.3 `oauth-links/routes.ts` + `handlers/start-oauth-link-app.ts`
- 新增 `POST /oauth-links/:provider/start`：
  `platformAuth → activePlatformMutation → platformCsrf → platformOAuthLinkRateLimit →
   requirePlatformJson → paramSchemaValidator(platformOAuthLinkParamsSchema…)
   → jsonSchemaValidator(platformOAuthLinkAppStartRequestSchema, { errorBody }) → handler`。
- handler：`clientTarget: 'app'`、`appCodeChallenge = body.codeChallenge`、`linkingAccountId = claims.id`、
  `intent: 'link'`、`returnPath: '/account/security'`；成功 200 返回 `{ success: true, authorizationUrl }`
  （`Cache-Control: no-store`）；provider 不可用 404 `PLATFORM_OAUTH_LINK_UNAVAILABLE`。
- 非法 body 的错误体构造器放 handler 模块（route 模块禁止箭头函数）。

12.4 回调分流：`handlers/oauth-link-branch.ts`
- 失败回跳 `redirectToPlatformOAuthLink`：`client_target === 'app'` → 303
  `imsweb://oauth/callback?error=<reason>&flow=link`；否则维持 `return_path?oauth=<reason>`。
- 成功：`client_target === 'app'` 时不回 SPA，改为铸造一次性码（`createOAuthExchangeCode`，
  `accountId = linking_account_id`、`codeChallenge = app_code_challenge`）→ 303
  `imsweb://oauth/callback?code=<code>&flow=link`；否则维持 `?oauth=linked`。

12.5 provider 拒绝早退路径：`handlers/oauth-login.ts`
- `findOAuthStateClientTarget` 需要同时知道 `intent`，才能给 link 方补 `flow=link`。
  端口/仓储改为一次只读返回 `{ clientTarget, intent }`（重命名并更新唯一调用点与夹具）。

12.6 测试 `apps/api/tests/server/platform-email-binding.contract.test.ts`（夹具 `AccountSecurityFixture`）
- app start 200 + `authorizationUrl`、state 落 `clientTarget='app'` + challenge、无 bearer 401、非法 body 400、不可用 provider 404。
- 回调成功 → `Location: imsweb://oauth/callback?code=…&flow=link`；回调各类失败 → `?error=<reason>&flow=link`；web 断言不变。
- 契约符合性：请求体拒绝未知键、响应与 `platformOAuthLinkAppStartResponseSchema` 逐字节一致。
- 路由清单：`node scripts/contracts/compile-route-inventory.mjs --write` 后跑一次新鲜度检查。

### Web

12.7 PKCE/verifier 复用：`apps/web/app/lib/platform-oauth-app-verifier.ts`（新）
- 抽出 `createPlatformOAuthPkcePair()` 与按用途分键的 verifier 存取（`login` / `link` 两个 key），
  登录 hook 改为调用它，行为不变（含 localStorage TTL 语义）。

12.8 端点：`apps/web/app/lib/api/endpoints/platform/account-security.ts`
- 新增 `startPlatformOAuthLinkApp({ provider, codeChallenge })`，`platformApiClient.Post` +
  `parsed(platformOAuthLinkAppStartResponseSchema, { errorSchema: platformAccountSecurityErrorSchema, meta: withPlatformCsrf() })`。
- `~/lib/api` barrel 导出。

12.9 深链 flow 分流：`apps/web/app/lib/platform-oauth-deep-link.ts`
- `parsePlatformOAuthCallbackUrl` 读 `flow`：`link` 时返回 `{ ...payload, flow: 'link' }`，缺省不出现 `flow` 键
  （`{code}` / `{error}` 的既有断言保持不变）。
- `subscribePlatformOAuthPayload(handler, flow = 'login')` 按 flow 注册；投递只给同 flow 监听者，
  没有同 flow 监听者才缓存 + `onUnclaimed(payload)`；缓存按 flow 各留一份。
- `app-layout.tsx` 的 `onUnclaimed` 按 payload 的 flow 落到 `/account/security` 或 `/account/login`。

12.10 页面 hook + UI：`pages/account/security/use-platform-oauth-app-link.ts`（新）+ `oauth-link-section.tsx`
- `start(provider)`：生成 verifier/challenge → 存 verifier → POST app start → `openSystemUrl(authorizationUrl)`
  → 等待态 + 300 秒超时；`cancel()` 清 verifier 与等待态。
- 订阅 `flow='link'`：`code` → `exchangePlatformOAuthSession` → `acceptSession` → 重拉列表 → 提示 `linked`；
  `error` → `oauthLinkReasonKey` 映射文案；两者都结束等待态。
- 「绑定」按钮：`IS_APP_TARGET` 下改为普通 button 调 `start`（不再 `NavigationLink`）；web 分支 JSX 不动。
- i18n：`platformAccount.security.oauth.linkWaiting` / `linkCancel`（中英各一处）。

12.11 Web 测试
- 深链单测：`flow=link` 解析、按 flow 投递、无同 flow 监听者才缓存。
- 新 hook 单测：start 的请求体/href、深链 code → exchange + 重拉 + 提示、error 映射、cancel、超时。
- 账号安全页 app 态单测：绑定是 button 且点击调用 start（不是文档导航）。
- `app-layout.test.tsx`：`onUnclaimed` 按 flow 路由。
- 验证：`pnpm --filter @imsweb/web exec vitest run tests/unit`、`format`、`lint`。

### 闸门与回滚

- 闸门：契约构建 → API 测试 + 路由清单新鲜度 → Web 单测/format/lint → `pnpm run check:rules`。
- 回滚：删 POST 路由 + handler + 契约 schema，link 回跳恢复为单一 web 行为（`client_target` 仍是 web）；
  Web 侧移除 app hook 分支与 `flow` 解析即回到现状。批次 1 的登录通道不受影响。
