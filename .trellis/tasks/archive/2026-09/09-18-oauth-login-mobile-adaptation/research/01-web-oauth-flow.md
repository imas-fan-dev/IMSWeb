# Web 端 OAuth 登录的发起与回流全链路

范围：只读调研，回答「点击 OAuth 按钮之后发生什么、回调落在哪里、用户怎么回到登录前页面」。

## 1. 发起：整页文档导航，不是弹窗也不是 alova 请求

登录页本身只是一个壳：

- `apps/web/app/pages/account/login/account-login-page.tsx:7` 渲染 `<AccountAuthForm mode="login" />`。
- 表单实体在 `apps/web/app/pages/account/components/account-auth-form.tsx`。

provider 列表不是服务端渲染的，是浏览器挂载后拉取的：

- `account-auth-form.tsx:132` —— `if (isReset || IS_APP_TARGET) return`。重置密码模式和 app 构建都不请求 provider 列表。
- `account-auth-form.tsx:134` —— `void getPlatformOAuthProviders().send()`。
- 端点定义在 `apps/web/app/lib/api/endpoints/platform/index.ts:140-148`，路径 `platformAuthOAuthPath("/providers")`，`meta: withPlatformAuth({ authRole: "login" })`（公开端点，只是借用 platform client 的 auth realm 校验）。

按钮渲染在一个 web-only 边界里：

- `account-auth-form.tsx:880` —— `{!isReset && oauthProviders.length > 0 ? (`
- `account-auth-form.tsx:881` —— `<NavigationBoundary availability="web">`
- `account-auth-form.tsx:892-894` —— `href={platformAuthOAuthPath(`/${provider.code}/start?returnPath=${encodeURIComponent(accountHome)}`)}`

`NavigationBoundary` 在 app 构建下直接返回 `null`（`apps/web/app/components/navigation/navigation-link.tsx:120-128`）。

`NavigationLink` 用 `href` 而不是 `to`，所以走 `resolveNavigation`：

- `apps/web/app/lib/navigation/resolve-navigation.ts:36-46` 把 `API_PATH_PREFIX`（`/api`）列入 `SERVER_DOCUMENT_PREFIXES`。
- `resolve-navigation.ts:132-138` 对 `/api` 前缀返回 `{ kind: "document", href: candidate }`（web target），渲染成原生 `<a href>`（`navigation-link.tsx:100-109`）。
- `resolve-navigation.ts:135` 对 app target 则拼 `apiOrigin` 后同样返回 document，但那段 JSX 在 app 下不会渲染。

也就是说：**点击 OAuth 按钮 = 当前标签页整页跳到 `/api/platform/auth/oauth/<provider>/start?returnPath=...`**。没有 `window.open`、没有弹窗、没有 alova 调用。（`window.open` 在前端被 ESLint 禁用，见 `apps/web/eslint.config.js:76-79`。）

`accountHome` 决定 `returnPath`：`account-auth-form.tsx:106` —— web 是 `/community/exchange/me`，app 是 `/account/me`。

`platformAuthOAuthPath` 定义在 `packages/contracts/src/paths.ts:56-58`，前缀常量在 `packages/contracts/src/paths.ts:9`。

## 2. API 侧：start 端点

`apps/api/src/domains/identity/platform-auth/oauth/handlers/oauth-login.ts`：

- `:76-102` `handlePlatformOAuthStart`
- `:23-33` `safeReturnPath` —— 只接受以 `/` 开头、不以 `//` 开头、不含反斜杠与控制字符、长度 ≤2048 的路径，否则回落到 `DEFAULT_RETURN_PATH = '/community/exchange/me'`（`:16`）。
- `:83` 读 `returnPath`。
- `:84` `createPkcePair()`（`:39-47`）生成 `state` / `code_verifier` / `code_challenge`。
- `:86-93` 写 `platform_oauth_states`，`intent: 'login'`（`:89`）。
- `:95-98` `oauth.createAuthorizationUrl(provider.code, { state, codeChallenge })`。
- `:101` `c.redirect(authorizationUrl.toString(), 303)` —— 303 到 provider 授权页。

路由注册：`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:43-48`，`GET /:provider/start`，中间件只有 param/query 校验，无鉴权。挂载前缀见 `apps/api/src/domains/identity/platform-auth/routes.ts`。

注意 `:103` provider 未配置或 OAuth 服务缺失时，`redirectToLogin`（`:52-56`）303 回 `/account/login?oauth=unavailable`。

## 3. 回调落点：API 路由，不是 Web 路由

- `apps/api/src/domains/identity/platform-auth/oauth/routes.ts:49-54` —— `GET /:provider/callback`。
- `oauth-login.ts:105-171` `handlePlatformOAuthCallback`。
  - `:116` 缺 `state`/`code` 或带 `error` → `redirectToLogin(c, 'denied' | 'invalid')`。
  - `:118-122` `consumeOAuthState(hashValue(state), provider.code, Date.now())`。
  - `:123` state 不存在/过期/无 `code_verifier` → `redirectToLogin(c, 'expired')`。
  - `:126-129` `exchangeAuthorizationCode`。
  - `:130-155` 找不到 `platform_oauth_identities` 记录时直接建号（`createOAuthAccount`），即 **OAuth 首次登录即注册**，不经过邮箱验证。
  - `:162` `establishPlatformSession(c, identity)`。
  - `:165-168` `const destination = new URL(consumedState.return_path, c.req.url)`，删掉 `oauth` 查询参数，303 跳过去。
  - `:169-170` 任何异常 → `redirectToLogin(c, 'failed')`。

**回调不落在 Web 路由上**，落在 API 路由上。Web 端最终回到登录前页面的方式是：API 读 state 行里存的 `return_path`，用它做 303。Web 只需要有对应前端路由能响应那个路径（`returnPath` 默认 `/community/exchange/me`，在 `apps/web/app/route-metadata.ts` 的共享路由表里）。

失败路径全部汇聚到 `/account/login?oauth=<reason>`。`reason` 取值：`unavailable` / `denied` / `invalid` / `expired` / `failed`（`oauth-login.ts:54, 82, 99, 116, 123, 163, 170`）。

## 4. 前端如何识别「已登录」

登录页 mount 时 `PlatformSessionProvider`（`apps/web/app/components/platform/platform-session-provider.tsx:126-133`）调 `reload()`，`reload` 先看 `hasPlatformSessionHint()`（`:96-99`），再 `GET /api/platform/auth/session`。

`hasPlatformSessionHint` 定义在 `apps/web/app/lib/api/endpoints/platform/index.ts:134-138`：读得到 `ims_platform_csrf` cookie，或本地存了 token。

因此回调 303 回 `/community/exchange/me` 后，页面重新加载 → hint 命中 → session 恢复 → 登录态生效。**没有前端 token 落库步骤，Web 完全靠 cookie。**

## 5. 既有事实 vs 推断

既有事实：以上全部有行号锚点。

推断（无代码依据，仅从行为看）：`/account/login?oauth=<reason>` 只是把失败原因带进 URL，`account-auth-form.tsx` 里没有读取 `oauth` 查询参数做提示的分支（`:104` 只读了 `reset`）。所以失败原因目前对用户不可见。这一条建议在实现前用一次实际点击确认。

## 6. 相关但未接入的链接流程

`platform_oauth_states.intent` 允许 `'link'`，且有 `linking_account_id` 列（`apps/api/migrations/postgresql/0020_platform_accounts.sql:74-90`），但：

- `createOAuthState` 的唯一调用点写死 `intent: 'login'`（`oauth-login.ts:89`）。
- `consumeOAuthState` 的 SQL 写死 `AND intent='login'`（`apps/api/src/infra/db/repositories/platform-account-repository.ts:532`）。
- 全 API 搜索没有第二处 `intent: 'link'` 写入。
- Web 端 `/account/security` 只有「解绑」（`apps/web/app/pages/account/security/oauth-link-section.tsx`），没有「新增绑定」入口。

结论：**绑定流程的 schema 已就位，代码尚未实现**。
