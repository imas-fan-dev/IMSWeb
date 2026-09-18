# OAuth 登录的 Web 与移动端适配 — 技术设计

> 产品前提（不再重开）：app 回跳 = 自定义 scheme + `code_verifier` 强化；iOS/Android 同期；
> provider 配置与 `validatePlatformOAuthRedirectUri` 的 HTTPS 校验均不变；不写原生 SDK 插件；
> 不引入第二套会话机制。provider 只看到我们的 HTTPS 回调，app 回跳发生在其后。

## 1. 现状与约束

**Web 发起是整页文档导航。** `account-auth-form.tsx:892-894` 用
`href={platformAuthOAuthPath('/<code>/start?returnPath=...')}`；`resolve-navigation.ts:132-138`
把 `/api` 前缀判为 `document`。`window.open` 被 ESLint 禁用（`apps/web/eslint.config.js:76-79`）。

**API 链路。** `oauth-login.ts:76-102` 写 state（`:86-93`，`intent:'login'`，`:89`）后 303 到
provider（`:101`）；state 由 `createPkcePair()`（`:41-47`）生成；`oauth-login.ts:104-171` 是回调，
`consumeOAuthState`（`:118-122`）原子消费，`:162` 建会话，`:165-168` 读 `return_path` 做 303；
失败统一 `redirectToLogin`（`:52-56`）。state TTL 10 分钟（`:19`）。

**会话双通道。** `session.ts:204-253` 的 `establishPlatformSession` 无条件写 cookie（`:251`），
再按 `x-ims-auth-mode: bearer`（`:89-104`）决定 `platformSessionPayload`（`:171-202`）是否回传
token。cookie 三件套见 `session.ts:27-57`：`ims_platform_access`（httpOnly,`/`）、
`ims_platform_refresh`（httpOnly,`platformAuthPath()`）、`ims_platform_csrf`（可读）；`sameSite:'Lax'`
硬编码，`Domain` 未设。打包 WebView origin 与 API 不同，且前端 `credentials:"omit"`
（`request.ts:55`），**回调 cookie 无法被 WebView 继承**；app 只能走既有 bearer 通道
（`platform-token-store.ts:17,20-21`、`platform-client.ts:126-138`）。

**app 内 OAuth 被主动关闭。** `account-auth-form.tsx:132`（`if (isReset || IS_APP_TARGET) return`）
不拉 provider 列表；`:881` 的 `<NavigationBoundary availability="web">` 在 app 下整体不渲染。

**深链能力不存在。** `Info.ios.plist` 无 `CFBundleURLTypes`；`tauri.conf.json:1-37` 无
`plugins.deep-link`；`Cargo.toml:21-36` 无 `tauri-plugin-deep-link`；`capabilities/default.json:8-22`
只有 `core:default` 与 `opener:allow-open-url`。已有 `openSystemUrl`（`system-opener.ts:44-56`）
只负责送出。`src-tauri/gen/` 是派生产物（`src-tauri/.gitignore:10`）。

**单 redirect_uri。** `platform_oauth_providers` 以 `code` 为主键
（`0020_platform_accounts.sql:34-45`），`redirect_uri` 是单列
（`20260818010000_platform_oauth_configuration.sql:9-11`）；读取每次实时查库
（platform-oauth-client）。`validatePlatformOAuthRedirectUri`（`platform-oauth.ts:100-107`）只允许
HTTPS。本设计**不触碰**这两处。

**state 表已预留 link。** `platform_oauth_states`（`0020_platform_accounts.sql:70-99`）有
`intent IN ('login','link')` 与 `linking_account_id`；应用层写死登录语义
（`createOAuthState` `platform-account-repository.ts:498-521`，`consumeOAuthState` `:524-540`
写死 `AND intent='login'`）。并行子任务 `09-18-account-oauth-email-binding` 会用 `intent='link'`。

**移动 Web 的三处真实降级。** provider 列表异步加载失败即静默消失
（`account-auth-form.tsx:134-144`）；整页跳转丢失表单状态；`?oauth=<reason>` 无人读取
（`account-auth-form.tsx:104` 只读 `reset`）。

## 2. 核心时序图

```
[app 内点 OAuth]
  1. app 生成 code_verifier（43B 随机）→ code_challenge = b64url(sha256(verifier))，留在 app
  2. openSystemUrl(API_ORIGIN + /api/platform/auth/oauth/<p>/start
                     ?returnPath=/account/me&client=app&codeChallenge=<challenge>)
     载体：系统浏览器（外部）        凭据：无（challenge 是公开摘要）
  3. API /start 写 platform_oauth_states(client_target='app', app_code_challenge=<challenge>,
                     code_verifier=<PKCE verifier>, return_path) → 303 provider
     载体：浏览器     凭据：state / PKCE（服务端持有）
  4. 用户在 provider 授权 → 303 回 https://<api>/api/platform/auth/oauth/<p>/callback?code&state
     载体：浏览器     凭据：provider code（服务端换）
  5. API 回调 consumeOAuthState（DELETE...RETURNING，原子、单次）
  6. API 服务端 exchangeAuthorizationCode（用 state 里的 PKCE verifier）→ 找到/建立 identity
  7. client_target==='app' 时：不 establishPlatformSession；生成一次性 code（32B）
     → platform_oauth_exchange_codes(code_hash, account_id, code_challenge, expires_at)
     → 303 imsweb://oauth/callback?code=<一次性码>
     载体：浏览器对自定义 scheme 的移交      凭据：一次性码
  8. app 被唤起（deep-link 插件 onOpenUrl/getCurrent）→ 校验 scheme/host/path → 取 code
  9. POST /api/platform/auth/oauth/exchange  body {code, codeVerifier}
     headers: X-IMS-Auth-Mode: bearer
     载体：App WebView → API（跨源 fetch，credentials omit）  凭据：一次性码 + code_verifier
 10. API 原子消费 code（DELETE...RETURNING）→ 常量时间比对 challenge → establishPlatformSession
     → platformSessionPayload 回传 accessToken/refreshToken
 11. app capturePlatformTokens 落 localStorage → acceptSession → 跳 /account/me
```

Web 发起走的是同一条 1–6，只是 `client` 缺省为 `web`：第 7 步改为 `establishPlatformSession`
+ 303 回 `return_path`，与现状逐字节一致。

## 3. 方案选择与取舍

**采用方案 A：系统浏览器 + 自定义 scheme + 一次性码 + 既有 bearer 交换。** 复用
`openSystemUrl`、`platform-token-store`、`capturePlatformTokens`，只补「送回来」和「换令牌」两环。

被否方案：

- **B provider 直连 app scheme**：Google Android 客户端默认禁用自定义 URI scheme
  （`Custom URI scheme is not supported on Android or Chrome apps`），GitHub 要求精确匹配；
  且会让 `validatePlatformOAuthRedirectUri` 必须放行自定义 scheme（安全边界变更）。否。
- **C universal link / app link**：回调仍是 HTTPS，但需要域名侧托管
  `apple-app-site-association` / `assetlinks.json`，属部署面且需要真实域名资产；作为 provider
  侧不可行时的后备，本任务不落。本设计把「回调落点」做成 state 上的一维，切换到 C 时只需换
  第 7 步的目标地址形态，其余（一次性码、exchange 端点、state 分流）全部复用。
- **D in-app 浏览器（SFSafariViewController / Custom Tabs）**：仓库无依赖，需自写 Swift/Kotlin；
  iOS 正确做法本应是 `ASWebAuthenticationSession`，等于把回跳再做一遍。收益不抵成本。否。
- **E WebView 内 iframe / 第二 WebView**：跨源拿不到 cookie，还要引入 `tauri-plugin-localhost`
  之类的 origin 映射，信任面更大。否。

**新增依赖只有官方 `tauri-plugin-deep-link`（Rust crate + `@tauri-apps/plugin-deep-link`）。**
它是唯一能与现有 `tauri-plugin-opener` 组合成「送出 + 收回」的官方件；`opener` 只出不进。

## 4. 一次性码设计

**存储选型：新增 PostgreSQL 表 `platform_oauth_exchange_codes`，不用 Valkey。** 理由：

1. **单次消费的原子性是首要安全属性。** `CacheStore` 端口只有 `get`/`set`/`delete`
   （`ports/cache.ts`），无 `GETDEL`；`get` 后 `delete` 之间存在竞态窗口，两次并发 exchange 可能
   都读到值。Postgres 的 `DELETE ... WHERE code_hash=? AND expires_at>? RETURNING` 在单条语句内
   完成「校验 + 消费」，与本仓库既有的 `consumeOAuthState`
   （`platform-account-repository.ts:524-540`）和密码重置码
   （同文件 `:1004-1122`）完全同构。
2. **仓库里一次性凭据一律落 Postgres。** `platform_email_verification_codes`、
   `platform_password_reset_codes`、`platform_oauth_states` 都是表；Valkey 只用于幂等、冷却等
   「可丢失、PostgreSQL 仍权威」的场景（`email-verification-cache.ts` 注释明说 best-effort）。
3. **无需新增端口方法、不依赖缓存可用性。** 缓存丢失只是失败关闭（换不到会话），但竞态是安全
   缺陷；用 Postgres 两样都避免。
4. **可与账号绑定在一条语句里带出。** 行上直接存 `account_id`，消费时 `RETURNING account_id`。

**生成。** `randomBytes(32).toString('base64url')`（256 bit，43 字符）；库中只存
`sha256(code)` 十六进制（复用 `hashValue`，与 `state_hash` 的 `^[0-9a-f]{64}$` 约束一致）。
深链只携带原始码，不携带任何长期凭据。

**TTL = 300 秒。** state 是 600 秒（覆盖用户在 provider 页的停留），一次性码只需覆盖「303 到
scheme → app 冷启动/唤起 → 一次 POST」，300 秒足够容忍设备慢启动，同时把重放窗口压到分钟级。

**原子消费与防重放。** `DELETE FROM platform_oauth_exchange_codes WHERE code_hash=? AND expires_at>? RETURNING account_id, code_challenge`。
删除即失效，第二次调用查无此行 → 401。并发两个请求只有一个能拿到 `RETURNING`。过期行由
回调写码时顺带清理：`DELETE FROM platform_oauth_exchange_codes WHERE expires_at<=?`（与
`createOAuthState` 清理过期 state 同批）。

**`code_verifier` 绑定与校验。** app 在 `/start` 前生成 `code_verifier`（32B→base64url，43 字符），
把 `code_challenge = base64url(sha256(verifier))` 放进 `/start` 查询串；服务端存入 state 行的
`app_code_challenge`，回调时写进一次性码行。exchange 时服务端重算 challenge，用
`@/utils/crypto/constant-time` 的 `constantTimeEqual` 比对；不等 → 401。**`code_verifier` 只存在
app 进程内（内存 + `sessionStorage` 兜底），永不经过深链。** 冒名注册同一 scheme 的第三方 app
即使截获深链，也拿不到 verifier，换不出会话。

## 5. state 分流设计

**结论：`intent` 保持「登录 / 绑定」语义，另加一个正交维度 `client_target` 承载发起方。**

- `platform_oauth_states` 新增 `client_target TEXT NOT NULL DEFAULT 'web' CHECK (client_target IN ('web','app'))`
  与 `app_code_challenge TEXT`（可空，`length BETWEEN 43 AND 43`），并加 CHECK
  `((client_target='app') = (app_code_challenge IS NOT NULL))`。
- **不复用 `return_path`**：它是通过 `safeReturnPath` 校验的同源路径（`oauth-login.ts:23-33`），
  web 用它做 303；app 的落点是自定义 scheme，需要独立通道。把「发起方」塞进路径字符串既难校验
  也难读。
- **不塞进 `intent`**：`intent` 的 CHECK 与 `linking_account_id` 绑定
  （`0020_platform_accounts.sql:93-97`），`09-18-account-oauth-email-binding` 要用 `intent='link'`；
  把 web/app 混进 `intent` 会与绑定流程互相污染。

**与 `09-18-account-oauth-email-binding` 的共存契约（两任务必须一致）：**

1. `consumeOAuthState` **不再把 `intent='login'` 写进 SQL 谓词**。`state_hash` 已是主键、每个流程
   唯一，intent 是被读出的数据而不是查询键。改为原样 `DELETE ... RETURNING` 全列，由
   **回调处理器按 `record.intent` 分流**（`login` / `link`）。这样两个任务不需要各自给该函数加
   参数，也不会有两套签名。若绑定任务偏好显式参数，可退让为
   `consumeOAuthState(hash, provider, at, intent?: 'login'|'link')`，缺省 `login`；本任务按缺省调用。
2. `NewPlatformOAuthStateInput` 的 `intent` 类型由 `'login'` 放宽为 `'login' | 'link'`，并补
   `linkingAccountId: string | null`（绑定任务填，本任务恒 `null`）；本任务再加 `clientTarget` /
   `appCodeChallenge`。两个字段集互不冲突。
3. 回调按 `intent` 先分流，再在 `login` 分支内按 `client_target` 分流；`link` 分支由绑定任务实现。

回调结构（本任务新增部分）：

```
consumed = consumeOAuthState(hash, provider, now)
if (!consumed?.code_verifier) → (app 未知) redirectToLogin('expired')
if (consumed.intent === 'link') → 绑定任务分支
exchange provider code → identity
if (consumed.client_target === 'app'):
    code = randomBytes(32).base64url
    createOAuthExchangeCode({ codeHash, accountId: identity.account.id,
                              codeChallenge: consumed.app_code_challenge, expiresAt: now+300_000 })
    → 303 APP_OAUTH_CALLBACK_URL + ?code=<code>
else:
    establishPlatformSession(c, identity) → 303 return_path   # 现状
```

**app 失败态回跳。** provider 拒绝（`query.error`）时 state 尚未消费。为让 app 等待态确定性地结束
（AC7），回调在 `state` 存在时调用新增的只读 `findOAuthStateClientTarget(hashValue(state), provider.code, now)`；
若为 `app` 则 303 到 `APP_OAUTH_CALLBACK_URL + ?error=denied`，否则维持
`/account/login?oauth=denied`。state 已过期时无从得知发起方，走原 web 重定向，由 app 侧超时兜底。

## 6. 边界与契约

契约全部落在 `@imsweb/contracts/platform`，路径常量落 `@imsweb/contracts/paths`。

**新增路径常量（`packages/contracts/src/paths.ts`）：**

```ts
export const APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback" as const
```

API（拼 303 目标）与 Web（匹配深链）共用它，避免两处硬编码 scheme/host/path。

**`platformOAuthStartQuerySchema` 扩容（`packages/contracts/src/platform/index.ts:233`，保持 `.strip()`）：**

```ts
export const platformOAuthStartQuerySchema = z.object({
  returnPath: z.string().optional(),
  client: z.enum(["web", "app"]).optional(),
  codeChallenge: z.string().min(43).max(43).optional(),
}).strip();
```

处理器规则：`client === "app"` 时 `codeChallenge` 必填且须匹配 `^[A-Za-z0-9_-]{43}$`；缺失/非法 →
`redirectToLogin('invalid')`。`client` 缺省视为 `web`，行为不变。

**新增换取会话端点：**

- 路径：`POST /api/platform/auth/oauth/exchange`（挂在 `platformAuthOAuthPath()` 下，由
  `platformOAuthRoutes()` 注册；`/exchange` 与既有 `/:provider/start`、`/:provider/callback`
  不冲突）。
- 请求 schema（`packages/contracts/src/platform/index.ts`）：

```ts
export const platformOAuthExchangeRequestSchema = z.object({
  code: z.string().min(43).max(128),
  codeVerifier: z.string().min(43).max(128),
}).strict();
export type PlatformOAuthExchangeRequest = z.infer<typeof platformOAuthExchangeRequestSchema>;
```

- 成功响应：复用 `platformSessionSchema`（`accessToken`/`refreshToken` 为可选字段，本端点必然带）。
- 错误：复用 `platformHttpErrorSchema`（`success:false` + `code`）。

错误码矩阵：

| 条件 | 结果 |
| --- | --- |
| 缺 `X-IMS-Auth-Mode: bearer` | 400 `PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED` |
| 请求体非法 | 400 `PLATFORM_OAUTH_EXCHANGE_INVALID` |
| 码不存在 / 已消费 / 过期 | 401 `PLATFORM_OAUTH_EXCHANGE_EXPIRED` |
| challenge 与 verifier 不匹配 | 401 `PLATFORM_OAUTH_EXCHANGE_INVALID` |
| 账号非 active/restricted、建会话失败 | 403 `PLATFORM_ACCOUNT_UNAVAILABLE` |
| 触发限流 | 429（复用 `enforceRateLimit`） |

## 7. 缓存/存储与迁移

**迁移文件：** `apps/api/migrations/postgresql/20260918120000_platform_oauth_app_exchange.sql`
（`-- ims:migration-phase: post-data`）。

```sql
CREATE TABLE public.platform_oauth_exchange_codes (
    code_hash TEXT PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    account_id TEXT NOT NULL REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    code_challenge TEXT NOT NULL CHECK (length(code_challenge) BETWEEN 43 AND 43),
    expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
    created_at BIGINT NOT NULL CHECK (created_at >= 0),
    CHECK (expires_at > created_at)
);
CREATE INDEX platform_oauth_exchange_codes_expiry_idx
    ON public.platform_oauth_exchange_codes(expires_at);
CREATE INDEX platform_oauth_exchange_codes_account_idx
    ON public.platform_oauth_exchange_codes(account_id);

ALTER TABLE public.platform_oauth_states
    ADD COLUMN client_target TEXT NOT NULL DEFAULT 'web'
        CHECK (client_target IN ('web', 'app'));
ALTER TABLE public.platform_oauth_states
    ADD COLUMN app_code_challenge TEXT
        CHECK (app_code_challenge IS NULL OR length(app_code_challenge) = 43);
ALTER TABLE public.platform_oauth_states
    ADD CONSTRAINT platform_oauth_states_client_target_check
        CHECK ((client_target = 'app') = (app_code_challenge IS NOT NULL));
```

**回滚：** 迁移全为加列/建表，`DEFAULT 'web'` 保证旧代码读取无感。API 回滚不需要动数据库——
新列被旧代码忽略，新表空置。若必须回退 schema：

```sql
ALTER TABLE public.platform_oauth_states DROP CONSTRAINT platform_oauth_states_client_target_check;
ALTER TABLE public.platform_oauth_states DROP COLUMN app_code_challenge, DROP COLUMN client_target;
DROP TABLE public.platform_oauth_exchange_codes;
```

**新增仓储方法**（`apps/api/src/infra/db/repositories/platform-account-repository.ts`，端口
`apps/api/src/ports/repositories/platform.ts`）：

- `createOAuthExchangeCode(input)` — 清理过期 + `INSERT`（`serializeWrite` 批，同
  `createOAuthState` 模式）。
- `consumeOAuthExchangeCode(codeHash, consumedAt)` — `DELETE ... RETURNING account_id, code_challenge`。
- `findOAuthStateClientTarget(stateHash, providerCode, now)` — 只读 `SELECT client_target`，供失败
  回跳分派，不消费。

## 8. Tauri 侧改动

**结论：引入官方 `tauri-plugin-deep-link`；iOS 的 `CFBundleURLTypes` 与 Android 的
`<intent-filter>` 都由插件 build.rs 从 `tauri.conf.json` 生成，不手写、不改 `gen/`。**

依据（已对照插件 v2 源码）：`tauri-plugin-deep-link/build.rs` 在
`plugin_config::<Config>("deep-link")` 存在时，对 `mobile[]` 逐项
`tauri_plugin::mobile::update_android_manifest(..., "activity", intent_filters)` 注入 intent-filter，
并在 Apple 平台 `update_info_plist` 插入 `CFBundleURLTypes`（`CFBundleURLSchemes` 取 scheme 中
非 http/https 的值）。也就是说 `tauri.conf.json > plugins.deep-link.mobile` 是这两个平台声明的
**单一配置源**。因此：

- **不要**在 `apps/web/src-tauri/Info.ios.plist` 手写 `CFBundleURLTypes`；插件在无 deep-link 域名时
  会主动 `remove("CFBundleURLTypes")`，手写会与之冲突/被覆盖。
- **不要**手改 `apps/web/src-tauri/gen/`；插件的 `update_android_manifest` 会在 cargo 构建期重写
  `gen/android/app/src/main/AndroidManifest.xml`。

`tauri.conf.json` 新增（顶层，与 `bundle` 同级）：

```json
"plugins": {
  "deep-link": {
    "mobile": [
      { "scheme": ["imsweb"], "host": "oauth", "pathPrefix": ["/callback"] }
    ]
  }
}
```

（`desktop` 留空，桌面不注册 scheme。`host`/`pathPrefix` 是自定义 scheme 的可选匹配项，
插件 `config.rs` 对非 web scheme 不做 host 必填校验。）

- `Cargo.toml`：`tauri-plugin-deep-link = "2"`；`lib.rs:32-41` 处 `.plugin(tauri_plugin_deep_link::init())`。
- `package.json`：`@tauri-apps/plugin-deep-link`。
- `capabilities/default.json`：追加 `"deep-link:default"`（授权 `allow-get-current`；`onOpenUrl`
  走 `core:event`，`core:default` 已覆盖）。

**前端监听与交换。** 新增 `apps/web/app/lib/platform-oauth-deep-link.ts`：

- `parsePlatformOAuthCallbackUrl(url)` — 严格匹配 `APP_OAUTH_CALLBACK_URL` 的 scheme/host/path，
  返回 `{ code }` 或 `{ error }`；不匹配返回 `null`。
- `subscribePlatformOAuthCallback(handler)` — 动态 `import("@tauri-apps/plugin-deep-link")`，
  先 `getCurrent()`（冷启动经深链）再 `onOpenUrl()`（热启动），返回取消订阅函数；非
  `IS_APP_TARGET || !isTauri()` 时直接返回 no-op。

页面私有 hook `apps/web/app/pages/account/components/use-platform-oauth-app-login.ts` 拥有：生成
verifier/challenge、`openSystemUrl`、等待态、订阅深链、调 exchange、`acceptSession`。

**Android 声明兜底（仅当插件注入被证伪时启用）。** 若真机/构建验证发现合并后的 manifest 没有
intent-filter，则不手改 `gen/`，而是新增 `apps/web/scripts/android-oauth-deeplink.js`，导出
`configureGeneratedAndroidOAuthDeepLink({ manifestPath, scheme, host, pathPrefix })`，在
`MainActivity` 的 `<activity>` 块内幂等插入 intent-filter；由 `build-app.js` 在
`runAppBuild` 末尾、`configureGeneratedAndroidCleartext`（`build-app.js:118-131`）旁调用。
平台工程在构建前已由 `app-device.js:441-456` 的 `ensurePlatformProject` 生成，manifest 必然存在。
这与 `android-release-network.js:12-28` 是同一范式。

## 9. 安全

- **熵**：一次性码 32 字节 CSPRNG（256 bit）；库中只存 SHA-256 hex。`code_challenge` 43 字符。
- **TTL / 单次**：300 秒；`DELETE ... RETURNING` 原子消费，重放与超时均 401。
- **绑定 `code_verifier`**：challenge 在 `/start` 时存入 state、回调时转存一次性码；exchange 用
  `constantTimeEqual` 比对，verifier 从不离开 app 进程。
- **禁止长凭据入 URL**：深链只带一次性码；refresh/access token 只在 exchange 的 JSON 响应里，
  且要求 `X-IMS-Auth-Mode: bearer` 才回传。`platformSessionPayload` 本就绝不外泄 csrf/sessionId。
- **深链被冒名 app 截获的影响面**：Android 上第三方 app 可注册同一 scheme 并在授权页之后截获
  `code`。缓解：码单次、300 秒、且必须配 verifier；攻击者若同时构造了 challenge 又能截获码才有
  效，这要求用户先点开攻击者的 `/start` 链接。残余风险 = 自定义 scheme 的固有风险；若需根除，
  升级路径是方案 C（universal link / app link），本设计的 state 分流与 exchange 端点可原样复用。
- **失败不区分原因**：exchange 对「不存在/已消费/过期」与「challenge 不匹配」返回不同但都无信息
  量的错误码，且限流。
- **限流**：`apps/api/src/middleware/rate-limit.ts` 新增
  `PLATFORM_OAUTH_EXCHANGE_LIMIT = { bucket: "platform-oauth-exchange", limit: 20, windowSeconds: 15*60 }`，
  在 `requestSpecificLimit` 加 `POST platformAuthOAuthPath('/exchange')` 分支。
- **不写日志中的秘密**：按 `observability-and-security.md`，码、verifier、token 均不入日志。

## 10. 移动 Web 三处降级的修法

1. **provider 列表失败态（MR8/AC8）**：`account-auth-form.tsx:134-144` 的 `catch` 不再静默置空，
   改为 `oauthProvidersStatus: "idle" | "loading" | "ready" | "error"`；`error` 时在 OAuth 区块渲染
   既有 `Alert`（`~/components/ui/alert`）+ 重试按钮（重跑同一 `getPlatformOAuthProviders()`）。
   新增 i18n `platformAuth.oauth.loadFailed` / `platformAuth.oauth.retry`（中英各一处）。
   仅 `mode==='login'` 生效。
2. **`?oauth=<reason>` 映射（MR9/AC9）**：`account-auth-form.tsx:104` 旁读
   `searchParams.get("oauth")`，映射到**已存在**的 i18n 键：`unavailable→platformAuth.oauth.unavailable`、
   `denied→denied`、`expired→expired`、`invalid|failed|其它→failed`
   （`i18n/resources.ts:377-383`、`:798-804`）。用 `Alert` 展示；展示后用
   `setSearchParams(next, { replace: true })` 清掉该参数，避免刷新重复提示。
3. **表单状态（AC6/移动体验）**：只持久化邮箱草稿。`sessionStorage` 键
   `ims.platform.email-draft`（仅 login/reset 模式），`email` 变更时写入、挂载时回填、提交成功或
   密码登录成功后清除。密码、验证码永不持久化。

## 11. 兼容性与回滚

**兼容性。**

- Web 构建：`client` 缺省 `web`，回调走原分支；OAuth 区块 JSX 保持原样（用
  `IS_APP_TARGET ? <AppSection/> : <NavigationBoundary availability="web">…原 JSX…</NavigationBoundary>`
  隔离，web 输出不变）。
- API：新增列有默认值、新表独立；旧代码/旧客户端不受影响。`consumeOAuthState` 去掉 intent 谓词后
  行为对 `login` 流程等价（state_hash 唯一）。
- 契约：`platformOAuthStartQuerySchema` 仍是 `.strip()`，只在显式新增字段时保留；新端点是纯新增。
- provider 表、`validatePlatformOAuthRedirectUri`、cookie 三件套、`establishPlatformSession`
  签名均不变（AC10）。

**回滚点。**

1. 契约 + 迁移 + 仓储（纯增量）→ 可独立合并/回滚。
2. 回调分流 + exchange 端点 → 回滚后 app 分支失效，`client=app` 的 start 会因缺少落点而可
   直接拒绝（处理器在 `client==='app'` 且无 exchange 能力时应 `redirectToLogin('unavailable')`）。
3. Tauri 插件与配置 → 移除依赖与 `plugins.deep-link` 即回到无深链状态（`Info.ios.plist` 不变）。
4. Web app 入口 → `IS_APP_TARGET` 守卫恢复即回到现状。

**风险清单。**

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| iOS 从 303 跳自定义 scheme 的弹窗/拦截行为 | app 不自动回前台（AC3） | 真机验证；必要时改为授权页落 `/account/oauth/app-done` 的中转 HTTPS 页，用户手动点按回跳，app 等待态超时兜底 |
| Android 插件未注入 intent-filter | 深链无效 | 合并 manifest 检查门禁；不达标则启用第 8 节兜底脚本 |
| `gen/` 每次构建被覆盖 | 手写声明丢失 | 全部走配置/脚本，绝不手改 |
| `--live` 下 `VITE_IMS_API_ORIGIN` 被清空 | 退回 cookie 通道，OAuth 入口隐藏，验证结果失真 | 验收一律用 `pnpm run app ios|android` 自包含包；`--live` 只做 UI 迭代 |
| app 在离开期间被系统杀死 | 完成授权后无 WebView 接收码 | 冷启动 `getCurrent()` 补收；verifier 存 `sessionStorage`；都失败则提示重试 |
| 自定义 scheme 被第三方注册 | 码被截获 | 单次 + 300 秒 + verifier 绑定；长期升级到 universal link |
| 邮箱草稿持久化的隐私 | 共享设备残留邮箱 | 仅存邮箱；登出/成功登录清除；不使用 localStorage |

**需要产品拍板的新决策（仅一项）：** 是否接受「跳出去再回来」的外部浏览器体验（方案 A/C 固有），
或要求「不离开 app」（方案 D，成本高一个量级）。其余（iOS/Android 同期、scheme + verifier、
不改 provider）已在前提中拍定。
