# app 端现有登录方式与 token 存储

范围：回答 app 内现在怎么登录、会话存哪里、有没有 app 专属的登录后处理。

## 1. 登录表单：与 Web 同一份组件

`/account/login` 在 app 与 web 都是共享路由：`apps/web/app/route-metadata.ts:113-121`（`targets = SHARED_TARGETS`）。所以 app 内登录用的是**同一个** `AccountAuthForm`，只是运行时分支不同。

app 相关的分支（`apps/web/app/pages/account/components/account-auth-form.tsx`）：

- `:132` —— `if (isReset || IS_APP_TARGET) return`，app 不请求 OAuth provider 列表。
- `:881` —— `<NavigationBoundary availability="web">`，OAuth 区块整体不渲染。
- `:106` —— `accountHome = IS_APP_TARGET ? "/account/me" : "/community/exchange/me"`。
- `:392-412` —— 成功态文案与「进入帐号」按钮走 app 专属 i18n key（`platformAccount.app.authSuccessDescription` / `platformAccount.app.enterAccount`）。
- `:424-517` —— 布局分叉：app 用 `width="read"`、无左侧营销栏、`overflow-x-hidden`、`pt-4`、`pb-[max(1.25rem,env(safe-area-inset-bottom))]`。
- `:577` / `:609` —— app 下不自动聚焦（避免移动端弹键盘）。

**结论：app 内现有登录方式就是邮箱 + 密码表单**（注册走邮箱验证码），提交后 `platform.acceptSession(session)`（`:352`）。

## 2. 提交路径

`submit()` 调 `loginPlatform({ email, password }).send()`（`:344-347`），端点是 `apps/web/app/lib/api/endpoints/platform/index.ts` 里的 `platformAuthPath("/login")`，对应 API `apps/api/src/domains/identity/platform-auth/sessions/handlers/login.ts:72-169`。

API 侧两个 target 走同一条路径，差异只在响应体：

- `login.ts:157` `establishPlatformSession(c, identity)` —— 浏览器和 app 都会**设置 cookie**（见 `02-session-establishment.md` 第 1 节，那是无条件的）。
- `login.ts:167-169` `platformSessionPayload(c, identity, tokens)` —— 只有 `wantsPlatformBearerTokens(c)` 为真时才把 `accessToken` / `refreshToken` 加进响应体。

## 3. app 内的会话判定

- `apps/web/app/lib/api/origin.ts:81` `isCrossOriginApi`。
- `apps/web/app/lib/api/platform-token-store.ts:17` `usesPlatformBearerAuth = isCrossOriginApi`。
- `apps/web/app/lib/api/endpoints/platform/index.ts:134-138` `hasPlatformSessionHint()` = 有 CSRF cookie **或** `hasStoredPlatformSession()`。
- `apps/web/app/lib/api/platform-token-store.ts:118-120` `hasStoredPlatformSession()` = 本地有 access 或 refresh token。

## 4. token 存储：与 Web **不同**

| | Web 构建 | 打包 App 构建 |
| --- | --- | --- |
| 启用条件 | `VITE_IMS_API_ORIGIN` 为空（同源） | `VITE_IMS_API_ORIGIN` 非空（跨源） |
| access token | 只在 `ims_platform_access` httpOnly cookie | `localStorage["ims.platform.access-token"]` + 内存镜像 |
| refresh token | 只在 `ims_platform_refresh` httpOnly cookie（path 限 `/api/platform/auth`） | `localStorage["ims.platform.refresh-token"]` + 内存镜像 |
| CSRF | 双提交（读 `ims_platform_csrf`） | 不需要：`Authorization` 头来源跳过 CSRF（`apps/api/src/app.ts:164-166` 注释、`refresh.ts:57-60`） |
| fetch credentials | `same-origin` | `omit`（`apps/web/app/lib/api/request.ts:55`） |
| 请求头 | 无额外头 | `X-IMS-Auth-Mode: bearer`、`Authorization: Bearer ...`、`X-IMS-Refresh-Token: ...` |

键名与读写：`apps/web/app/lib/api/platform-token-store.ts:20-21, 66-99`。
捕获时机：`apps/web/app/lib/api/platform-client.ts:126-138` —— 每次成功响应（logout 除外）调 `capturePlatformTokens(payload)`。
清理时机：登出（`platform-client.ts:132-134`）、refresh 失败（`:110-114`）。

`docs/development/tauri-mobile.md:301-310` 记录了这套设计，并注明 `localStorage` 不是安全存储。

## 5. 有一个 dev/prod 行为差异（重要）

- 打包构建：`VITE_IMS_API_ORIGIN` 有值（默认 `https://idol-master.top`），`isCrossOriginApi = true` → bearer 通道（`apps/web/scripts/build-app.js:9, 88-99`）。
- dev 构建：`dev:app` 会清掉 `VITE_IMS_API_ORIGIN`，让请求走 Tauri dev URL 的同源 Vite 代理（`apps/web/.env.example:26-28`、`docs/development/tauri-mobile.md:165`）。

推断：因此在 `dev:app` 下 `isCrossOriginApi` 为 false，前端会退回 **cookie** 通道，进而在同源 dev 环境里 cookie 是可用的。这意味着**OAuth 若在 dev 包里手工验证，可能看到与打包包不同的行为**。实现与验收时必须以自包含包（`pnpm run app ios`）为准，不能只看 `--live` 会话。

## 6. 有没有 app 专属的登录后处理

有，但都很薄：

- 落地页不同：`/account/me`（`:106`）。
- 成功态文案与 CTA 不同（`:392-412`）。
- 布局与安全区（`:424-517`）。

**没有** app 专属的 token 交换、没有 app 专属的回调路由、没有 app 专属的会话建立端点。
`acceptSession(session)` 是两端共用的同一个函数（`apps/web/app/components/platform/platform-session-provider.tsx:74-77`）。

## 7. 由此推出的对齐建议（推断）

新增 OAuth 登录在 app 内应当对齐**既有 bearer 通道**，而不是新造一套：

- 继承 `X-IMS-Auth-Mode` / `X-IMS-Refresh-Token` / `capturePlatformTokens` 这条既有链路。
- 缺口只在「OAuth 回调如何把 token 交回 WebView」这一环。既有密码登录是请求/响应式的，所以没有这个问题；OAuth 是跳转式的，所以必须补一个跨进程回传。
