# 单 redirect_uri 的实际影响

范围：provider 配置怎么读、有没有缓存、运行时能否按发起方选不同回调落点、Web 端是否已有多条 OAuth 路由。

## 1. 数据模型：每个 provider 只有一行，一个 redirect_uri

`apps/api/migrations/postgresql/0020_platform_accounts.sql:34-45`：

```sql
CREATE TABLE public.platform_oauth_providers (
    code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9-]{0,31}$'),
    display_name TEXT NOT NULL CHECK (...),
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO public.platform_oauth_providers (code, display_name, enabled)
VALUES ('google', 'Google', TRUE), ('github', 'GitHub', TRUE);
```

`apps/api/migrations/postgresql/20260818010000_platform_oauth_configuration.sql:9-11` 追加列：

```sql
ALTER TABLE public.platform_oauth_providers
    ADD COLUMN redirect_uri TEXT
        CHECK (redirect_uri IS NULL OR length(redirect_uri) BETWEEN 1 AND 2048);
```

`code` 是主键，所以**每个 provider 只有一条记录、只能有一个 `redirect_uri`**。没有 `platform_oauth_providers` 的子表存多回调地址，也没有按 client/target 维度的表。

同一批迁移还加了 `client_id_ciphertext`、`client_secret_ciphertext`、`updated_at`（`:3-14`），以及后续 `20260901140000_dynamic_platform_oauth_providers.sql` 补充的动态 provider 字段。**都是单例，没有一处是列表。**

## 2. 读取路径：每次从数据库读，没有缓存

`apps/api/src/infra/oauth/platform-oauth-client.ts`：

- `:414-419` `findConfiguredProvider(code)` —— `await this.store.listOAuthProviderConfigs()` 然后 `.find(...)`。**每次调用都查库**。
- `:421-464` `configuredProvider(row)` —— 解密 client id/secret，重新校验三个 endpoint 和 `redirectUri`。
- `createAuthorizationUrl`（`:266-286`）和 `exchangeAuthorizationCode`（`:292-330`）都先调 `findConfiguredProvider`。
- `:279` `url.searchParams.set('redirect_uri', provider.redirectUri)`（授权请求）。
- `:301` `redirect_uri: provider.redirectUri`（token 交换）。

存储实现：`apps/api/src/infra/db/repositories/platform-account-repository.ts` 的 `listOAuthProviderConfigs`（SQL 在 `:358`、`:381` 附近的 select 中列出 `redirect_uri`），映射在 `:237`。

服务实例化：`apps/api/src/runtime/node-services.ts:397` `parsePlatformOAuthConfig()`，`:422-423` `new ConfiguredPlatformOAuthClient(...)`，`:500` 挂到 services 上。`parsePlatformOAuthConfig`（`apps/api/src/config/platform-oauth.ts:129-141`）只解析超时和 loopback 开关，**不含任何 provider 数据**。

**结论：没有启动期缓存。每次授权/换码都是实时查库 + 实时校验。**

## 3. 校验规则对「多回调」的限制

`apps/api/src/config/platform-oauth.ts:100-107` `validatePlatformOAuthRedirectUri` 复用 `validatedOAuthUrl`（`:80-98`）：

- 非 local development 必须是 `https:`。
- 不允许用户名/密码、`#fragment`。
- 非 local development 不允许私有/本地 hostname。
- 本地开发额外要求 `IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS=1` 且只允许 loopback HTTP（`platform-oauth.ts:45-46` 附近的文档 + `:80-83`）。

**这条校验会直接拒绝自定义 scheme（如 `imsweb://callback`）**，因为它要求 `https:`。也就是说：把 deep link 的方案落实到 `redirect_uri` 上，会撞到这道校验，需要显式放行自定义 scheme（这会是一次安全边界变更，不只是加个字段）。

## 4. 运行时按发起方选择回调落点的可行性

技术上是可行的，因为读取是实时的：

- `findConfiguredProvider` 每次都查库（第 2 节），所以「运行时决定用哪个 redirect_uri」不需要改读取路径本身。
- 但**存储只留了一个位置**，所以必须二选一：加列/加表（每 target 一个回调地址），或把回调地址从 provider 行里挪到 state 行里（发起点写库、回调时读回）。

第二种更贴合现有结构：`platform_oauth_states` 已经是「一次性、按发起上下文存储」的表（`0020_platform_accounts.sql:70-99`），而且回调时本来就依赖 `consumeOAuthState` 读回 `code_verifier` 和 `return_path`（`oauth-login.ts:118, 123, 165`）。把 `redirect_uri`（或一个 target 枚举）也放进去，改动面最小。

**注意 PKCE 的绑定**：`code_verifier` 存在 state 行里（`oauth-login.ts:89`），所以 token 交换必须在服务端完成，除非把 PKCE 整体搬到客户端。这一点决定了「app 自己换码」的方案需要额外的服务端配合（见 `07-options-and-gaps.md`）。

## 5. Web 端已有哪些 OAuth 相关路由

**只有三条，全部在 API 侧，且只有一组是公开的：**

公开（`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:42-54`）：

- `GET /providers`
- `GET /:provider/start`
- `GET /:provider/callback`

admin（同文件 `:58-93`，前缀 `ADMIN_PLATFORM_AUTH_OAUTH_PATH_PREFIX`）：`GET /providers`、`POST /providers`、`PUT /:provider`、`DELETE /:provider`。

**不存在第二条回调路由。** 没有「匿名回调 + 已登录绑定回调」并存的局面；绑定（link）虽然在 schema 里预留了 `intent='link'` 与 `linking_account_id`（`0020_platform_accounts.sql:74-90`），但没有对应路由，`consumeOAuthState` 也写死 `AND intent='login'`（`platform-account-repository.ts:532`）。详见 `01-web-oauth-flow.md` 第 6 节。

Web 前端路由侧（`apps/web/app/route-metadata.ts`）没有任何 OAuth 专用页面：回调落在 `/api/...`，Web 只负责渲染 `returnPath` 指向的普通页面。

## 6. 单 redirect_uri 的实际影响（归纳）

1. **今天不影响 Web 登录**：一个 provider 一个回调地址，Web 登录刚好用得上。
2. **未来绑定流程会撞车**（如果绑定也要独立回调地址的话）。但绑定完全可以复用同一个 `/callback`，靠 state 行的 `intent` 区分——所以更重要的是实现 `intent='link'` 分支，而不是加回调地址。
3. **app 的 deep link 无法用同一个 `redirect_uri`**（`imsweb://...`，被 HTTPS 校验拒绝，且 type 完全不同），除非：
   - 放行自定义 scheme 并在 state 行里记录本次用哪个回调地址；
   - 或者注册第二个 provider 行（例如 `google-app`）——但 `code` 是主键、`platform_oauth_identities` 有 `(provider_code, provider_subject)` 与 `(account_id, provider_code)` 两条唯一约束（`0020_platform_accounts.sql:63-64`），同一个人用 app 和 web 登录会落成两条 identity，**不可取**；
   - 或者 iOS/Android 用 universal link / app link（HTTPS 地址，能过校验），代价是需要域名侧托管关联文件（`apple-app-site-association` / `assetlinks.json`）。
4. **provider 侧的注册限制**：Google 的 Web 应用 client 只接受 HTTPS 回调（以及 `http://localhost`）；自定义 scheme 只属于 iOS/Android 类型的 client。当前 schema 每个 provider 只有一组 client 凭据，所以「同一个 provider 同时服务 Web 和 app 且各自用不同 client 类型」在现有数据模型下表达不出来。
