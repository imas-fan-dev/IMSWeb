# 会话建立机制（cookie vs bearer）

范围：回调完成后会话如何落地。这一条决定 Tauri WebView 能否自然继承会话。

## 1. 唯一的会话建立函数

`apps/api/src/domains/identity/platform-auth/contracts/session.ts:204-253` `establishPlatformSession`：

- `:213-215` 只允许 `active` / `restricted` 账号建会话。
- `:220-233` 生成 `sessionId`（UUID）、refresh token（`v1.<tokenVersion>.<64 hex>`，`:110-112`）、`csrfSecret`（`randomHex(32)`），并签 access token（TTL `15 * 60`，`:23`）。
- `:234-249` 写 `platform_refresh_sessions` 行。
- `:251` **无条件** `setPlatformAuthenticationCookies(c, {...})`。
- `:252` 返回 `{ accessToken, refreshToken, csrfSecret, sessionId }`。

调用方：`handlePlatformLogin`（`apps/api/src/domains/identity/platform-auth/sessions/handlers/login.ts:157`）、`handlePlatformOAuthCallback`（`oauth-login.ts:162`）、注册、refresh。

## 2. Cookie 属性（逐条）

`session.ts:27-57`：

cookie 名常量在 `session.ts:18-20`：

| 名称 | 值 | 属性 |
| --- | --- | --- |
| `ims_platform_access` | JWT access token | `httpOnly: true`、`secure: config.cookieSecure ?? false`、`sameSite: 'Lax'`、`maxAge: 900`、`path: '/'` |
| `ims_platform_refresh` | refresh token | `httpOnly: true`、同上 secure/sameSite、`maxAge: 2592000`（30 天）、`path: platformAuthPath()` 即 `/api/platform/auth` |
| `ims_platform_csrf` | CSRF secret | `httpOnly: false`、同上 secure/sameSite、`maxAge: 2592000`、`path: '/'` |

要点：

- **`Domain` 没有设置**（`session.ts:27-32` 只返回 `secure` 和 `sameSite`）。cookie 绑定在应答的 host 上。
- **`secure` 来自 `services(c).config?.cookieSecure`**，默认 `false`。生产是否开启需要另查 config（本文件之外）。
- **`sameSite: 'Lax'` 是硬编码**，没有按环境或 target 分支。

## 3. access token 的第二个去处：bearer 响应体

`session.ts:89-104`：

- `wantsPlatformBearerTokens(c)` 检查请求头 `x-ims-auth-mode` 是否等于 `bearer`（`:91-93`）。
- `platformSessionPayload`（`:171-202`）只在 `wantsPlatformBearerTokens(c)` 为真时，把 `accessToken` / `refreshToken` 放进响应体（`:195-200`）。注释明确：绝不外泄 `csrfSecret` 和 `sessionId`。
- refresh token 的来源可以是 cookie，也可以是 `x-ims-refresh-token` 请求头（`platformRefreshTokenFromRequest`，`:97-104`）。头来源跳过 CSRF 双提交（`refresh.ts:57-60`），因为跨站表单伪造不出这个头。

**所以是「两个通道并存」**：浏览器走 httpOnly cookie，跨源打包客户端走 bearer 响应体 + 本地存储。

## 4. Web 端怎么选通道

- `apps/web/app/lib/api/origin.ts:81` —— `isCrossOriginApi = API_ORIGIN !== ""`。
- `apps/web/app/lib/api/platform-token-store.ts:17` —— `usesPlatformBearerAuth = isCrossOriginApi`。
- `apps/web/app/lib/api/request.ts:55` —— `credentials = isCrossOriginApi ? "omit" : "same-origin"`。
- `apps/web/app/lib/api/request.ts:63-81` —— bearer 模式下加 `X-IMS-Auth-Mode: bearer` 和 `Authorization: Bearer <accessToken>`，然后直接 return（不读 CSRF cookie）。

结论：**Web 构建 `VITE_IMS_API_ORIGIN` 留空 → 同源 → cookie 通道，access token 只存在于 httpOnly cookie 里**（`platform-token-store.ts:9-15` 的注释即为此而写）。

## 5. 对 Tauri WebView 的含义（既有事实 + 推断）

既有事实：

- API 的 CORS 只回显 loopback 和 Tauri origin，**且不下发 `Access-Control-Allow-Credentials`**（`apps/api/src/app.ts:69-93`、`:164-167`）。
- 打包 App 的 WebView origin 是 `tauri://localhost`（iOS）或 `http(s)://tauri.localhost`（其他），与 API host 不是同一个 origin（`apps/api/src/app.ts:78-89`）。
- 前端在跨源时主动 `credentials: "omit"`（`request.ts:55`）。

推断（由上述事实直接推出，非代码明文）：**打包 App 的 WebView 无法继承 OAuth 回调设置的 cookie**。理由有三重：origin 不同、API 不给 credentials 许可、前端主动 omit。这与 `docs/development/tauri-mobile.md:321-323` 记录的已知阻塞项一致。

## 6. 会话恢复与登出

- 恢复：`GET /api/platform/auth/session`（`sessions/routes.ts:27`），前端 `hasPlatformSessionHint()` 先行判断（见 `01-web-oauth-flow.md` 第 4 节）。
- 刷新：`POST /api/platform/auth/refresh`（`sessions/routes.ts:28`），alova 在 401 时自动触发（`apps/web/app/lib/api/platform-client.ts:84-117`）。
- 登出：`POST /api/platform/auth/logout`（`sessions/routes.ts:29`）；alova 在 bearer 模式下登出响应会清本地 token（`platform-client.ts:130-136`）。

access token 存哪里：浏览器 = 只在 `ims_platform_access` cookie 中；打包客户端 = `localStorage` 键 `ims.platform.access-token` / `ims.platform.refresh-token`，并有一份内存镜像（`platform-token-store.ts:20-21, 66-99`）。`docs/development/tauri-mobile.md:307-310` 明确记录 `localStorage` 不是安全存储，换系统钥匙串是后续改进项。
