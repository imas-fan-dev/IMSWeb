# 方案候选、必增清单与待拍板项

本文件建立在前六篇的既有事实上。凡属推断都单独标注。

## A. 移动端 OAuth 登录的可行方案候选

共同的起点：**Web 侧不需要新方案**。回调、cookie、回跳在浏览器里已经工作（`01`、`05`），唯一真实的缺口是 Tauri app（`03`、`04`）。

### 方案 1：只做 Web，app 保持不显示

- 改动面：仅 Web（补失败提示 / 入口可见性），或干脆不改。
- 内容：维持 `NavigationBoundary availability="web"`（`account-auth-form.tsx:881`），维持 `docs/development/tauri-mobile.md:321-323` 的已知阻塞记录。
- 成本：≈0。
- 代价：app 用户永远不能用 OAuth，只能用邮箱密码。

### 方案 2：系统浏览器 + 自定义 scheme deep link + 一次性授权码交换

- 改动面：需新增 Tauri 插件 + 仅 API（新端点与新表/列）+ 需改 provider 配置（放行自定义 scheme）+ 仅 Web（app 侧发起）。
- 流程：
  1. app 内点 OAuth → `openSystemUrl(绝对 HTTPS 授权地址)`（复用 `apps/web/app/lib/navigation/system-opener.ts:44-56`），授权地址带上「本次发起方是 app」的标记。
  2. 系统浏览器完成授权 → provider 回调 API。
  3. API 建立会话后不写 cookie 给 app，而是生成一次性 code，303 到 `imsweb://oauth/callback?code=...`。
  4. app 通过 deep link 收到 code → 调新端点 `POST /api/platform/auth/oauth/exchange` 用 code 换 `accessToken`/`refreshToken`（沿用 `X-IMS-Auth-Mode: bearer`，`04` 第 4 节）。
  5. 前端 `capturePlatformTokens(payload)` 落到 localStorage（`platform-client.ts:126-138`）。
- 需要解决的具体障碍：
  - `validatePlatformOAuthRedirectUri` 只允许 HTTPS（`apps/api/src/config/platform-oauth.ts:100-107`），要放行 app scheme。
  - `platform_oauth_providers` 每 provider 一个 `redirect_uri`（`06` 第 1 节），需要在 `platform_oauth_states` 上加「本次回调落点」维度。
  - Google/GitHub 对自定义 scheme 的 client 类型限制（`06` 第 6 节第 4 点）——这是**provider 侧的真实约束**，不是代码问题。

### 方案 3：系统浏览器 + universal link / app link（HTTPS 回调）

- 改动面：需新增 Tauri 插件 + 仅 API + 需改 provider 配置（新增一条 HTTPS 回调地址）+ 域名侧托管关联文件。
- 相比方案 2 的好处：回调地址仍是 HTTPS，能过现有校验；provider 侧不需要自定义 scheme 的特例。
- 代价：需要 `apple-app-site-association` 与 `assetlinks.json` 的实际托管能力（属部署面，超出本仓库代码），并且 API 需要按 state 记录决定「这次回跳到 web 路由还是 app link 地址」。同样需要一次性 code 交换端点。

### 方案 4：in-app 浏览器（SFSafariViewController / Custom Tabs）+ 深链回跳

- 改动面：需新增 Tauri 插件（自研或第三方）+ 方案 2/3 的全部 API 改动。
- 好处：用户不离开 app，cookie 与 ASWebAuthenticationSession 的会话共享更自然。
- 代价：仓库里没有任何 in-app 浏览器依赖（`03` 第 3.2 节），需要写 Swift / Kotlin（可参考 `apps/web/src-tauri/plugins/native-glass`、`native-image` 的本地插件范式）。而 iOS 上正确的做法通常是 `ASWebAuthenticationSession`，它本身就带回调能力——等于把方案 2/3 的回跳再做一遍。
- 推断：收益不足以抵消新增原生代码量与跨平台差异，除非产品明确要求「不离开 app」。

### 方案 5：app 内用 WebView 直接加载网站登录页（iframe / second webview）

- 改动面：需新增 Tauri 插件（多 WebView）+ 仅 Web。
- 问题：Tauri 的 WebView origin 是 `tauri://localhost`（`apps/api/src/app.ts:78-89`），嵌网页登录页要么跨源拿不到 cookie，要么需要引入 `tauri-plugin-localhost` 这类「把远端页面映射成本地 origin」的插件。而且登录页在 `tauri://` 下不会继承任何会话。
- 推断：比方案 2 更绕，且会引入一个额外的 origin 信任面。不推荐。

### 推荐

**推荐方案 2，并把方案 3 作为 provider 侧不可行时的后备。**

理由：

1. 它是唯一能完全复用既有 bearer 通道的方案（`04` 第 4 节的三件套：`X-IMS-Auth-Mode` / `X-IMS-Refresh-Token` / `capturePlatformTokens`），前端改动最小。
2. `docs/development/tauri-mobile.md:321-323` 已经把它写成既定方向（"deep link 与一次性 token exchange"）。
3. 已有 `openSystemUrl` 负责「送出去」这一半（`03` 第 3.1 节），补的是「送回来」和「换令牌」，边界清晰。
4. 方案 3 的全部优势（HTTPS 回调、不改 scheme 校验）可以在 provider 不支持自定义 scheme 时切换到，且方案 2 的 API 侧改动（state 记录落点 + exchange 端点）对两者是共用的——所以先做共用部分，回调地址形态留成可切换的配置。

**必须先验证的前置条件**：Google 与 GitHub 是否愿意为当前 client 类型接受自定义 scheme 回调。这一条决定方案 2 还是 3。若两者都不行，只剩方案 4。

## B. 本子任务必须新增的清单

以下按方案 2 列。若最终选方案 3，第 3 项换成 universal link 配置。

### 依赖

1. `tauri-plugin-deep-link`（Rust crate `tauri-plugin-deep-link` + npm `@tauri-apps/plugin-deep-link`），并在 `apps/web/src-tauri/src/lib.rs:32-41` 注册。
2. `@tauri-apps/api` 已存在，deep link 的 `onOpenUrl` 从该插件包导入，无需新增。

### 配置

3. `apps/web/src-tauri/Info.ios.plist` 增加 `CFBundleURLTypes`（自定义 scheme）。
4. Android 侧 intent-filter 的可提交入口。`src-tauri/gen/` 被 `apps/web/src-tauri/.gitignore:10` 忽略，`tauri.conf.json` 无注入字段。既有范式是构建后重新应用脚本（`apps/web/scripts/android-release-network.js`），推断需要同类脚本或本地插件（`03` 第 4 节）。
5. `apps/web/src-tauri/capabilities/default.json` 增加 deep-link 权限（当前只有 `opener:allow-open-url` 与 `core:default`）。
6. `apps/web/app/env.d.ts` 与 `apps/web/.env.example` 增加 app 回调 scheme / 回调地址的构建期变量（如果按 target 拼授权地址）。
7. `apps/web/eslint.config.js` 的导航规则：如果 deep link 监听需要触达路由，应走 `useNavigation()`（`:68-80` 已禁用 `window.open` / `location.assign|replace`）。

### 路由

8. API：`GET /:provider/start` 需要接受「发起方」信息（新 query 参数或新端点），`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:43-48`。
9. API：`GET /:provider/callback` 需要按 state 行决定 303 到 web 路径还是 app 深链（`oauth-login.ts:165-168`）。
10. API：新增一次性 code 交换端点，例如 `POST /api/platform/auth/oauth/exchange`，挂在 `apps/api/src/domains/identity/platform-auth/sessions/routes.ts:17-30` 或 oauth 路由下。
11. Web（app build）：登录页在 `IS_APP_TARGET` 下改为渲染 OAuth 入口，并改调 `openSystemUrl`；当前两处门是 `account-auth-form.tsx:132` 与 `:881`。
12. Web（app build）：新增 deep link 监听并在成功后调用 `platform.reload()` 或 `acceptSession`（`apps/web/app/components/platform/platform-session-provider.tsx:74-77, 96-108`）。

### 契约（`packages/contracts`）

13. 新增 exchange 请求/响应的 zod schema。响应可复用 `platformSessionSchema`（`packages/contracts/src/platform/`），请求需要新 schema（一次性 code）。
14. `platformOAuthStartQuerySchema` 若新增发起方参数，需要同步 `packages/contracts/src/platform/index.ts:233`（schema 本体）与 API 侧 query 校验中间件 `apps/api/src/domains/identity/platform-auth/oauth/routes.ts:34`。
15. 若新增路径常量，放 `packages/contracts/src/paths.ts`（`:9` 一带），不要在 app 内硬编码。

### 存储与迁移

16. 迁移：给 `platform_oauth_states` 增加回调落点维度（新列），并为一次性 code 建表或复用 state 表。
17. 存储层：`apps/api/src/infra/db/repositories/platform-account-repository.ts:498-545` 的 `createOAuthState` / `consumeOAuthState` 需要跟着改；`consumeOAuthState` 目前写死 `intent='login'`（`:532`），若本任务同时做绑定，这里要一起放开。

### 测试

18. API：wire-contract 测试（既有的 `apps/api/tests/server/platform-oauth-wire-contract-conformance.test.ts` 是同域参照）。
19. Web：`resolve-navigation` 单测（`apps/web/tests/unit/lib/navigation/resolve-navigation.test.ts`）若新增语义目标需要覆盖。
20. 设备门禁：`docs/development/tauri-mobile.md:325` 区域已列出「真机验证」为未完成项，若本任务落地，需要把「app 内 OAuth 登录到拉取列表」加入发布前设备验收。

## C. 无法在本子任务内解决、需要产品拍板的点

1. **是否接受「跳出去再回来」的体验。** 方案 2/3 都会让用户离开 app（进系统浏览器），完成后通过深链回到 app。方案 4 可以留在 app 内，但成本高一个量级。这是体验取舍，不是技术取舍。
2. **OAuth 首次登录即注册（`oauth-login.ts:130-155`）在 app 侧是否也照此。** 现有 Web 行为是不经邮箱验证直接建号。如果产品要求 app 侧更严格（例如首次必须补邮箱），那就不只是通道问题，而是注册策略变更。
3. **app 与 Web 的登录身份是否必须互通。** 若采用「同一个 provider 注册两个 client（web client + iOS/Android client）」，`platform_oauth_identities` 的 `(provider_code, provider_subject)` 唯一约束仍能保证同 provider 同一 subject 落同一账号——但前提是 `provider_subject` 在两个 client 之间一致。Google 的 `sub` 在同一项目内一致，GitHub 的 `id` 也一致，所以推断可行；这需要产品确认「两张 client 凭据」的运维成本可接受（后台要能配两组凭据，而当前 schema 只有一组）。
4. **是否需要同时补上绑定（link）流程。** schema 已为 `intent='link'` 预留（`0020_platform_accounts.sql:74-90`），但代码未实现（`01` 第 6 节）。如果 app 端要 OAuth 登录，产品大概也会要「绑定/解绑」的对称能力；这会把工作范围从「通道适配」扩到「绑定流程实现」。当前子任务的标题只提登录，建议明确边界。
5. **`localStorage` 存令牌是否可以接受。** 既有设计已经这么做了（`platform-token-store.ts:20-21`），文档也记为待改进（`docs/development/tauri-mobile.md:307-310`）。OAuth 会新增一条写入该存储的路径。如果产品要求换系统钥匙串，那是独立任务，会同时影响密码登录。
6. **失败反馈的产品要求。** `?oauth=<reason>` 目前没有 UI（`05` 第 4 节第 3 点）。要做什么程度的提示（toast / 页内 alert / 不提示）需要产品定。
7. **不支持 OAuth 的降级路径是否要在 app 内明示。** 现状是 app 内整个 OAuth 区块静默消失（`account-auth-form.tsx:881`）。如果要过渡期保留可见但禁用并加说明，也需要产品定文案。
