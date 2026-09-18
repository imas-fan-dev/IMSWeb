# OAuth 登录的 Web 与移动端适配

## Goal

OAuth 登录在移动 Web（小屏浏览器）与 Tauri app 内均可完成，不再只在桌面浏览器里顺手。

现状是 app 内 OAuth 入口被**主动关闭**（`apps/web/app/pages/account/login/components/account-auth-form.tsx:132, 881`），移动端用户只能用邮箱密码登录。本子任务把这条通道打通。

用户价值：移动端用户能用第三方帐号登录，与 Web 体验一致。

## Background

### Web 端现有链路（可用，不动）

1. OAuth 按钮是**整页文档导航**，不是弹窗也不是 alova 请求：`account-auth-form.tsx:892-894` 用 `href={platformAuthOAuthPath('/<code>/start?returnPath=...')}`，`resolve-navigation.ts:132-138` 把 `/api` 前缀判为 document 导航
2. API 侧 `oauth-login.ts:76-101` 写 state 后 303 到 provider
3. 回调落在 API 路由 `platform-auth/oauth/routes.ts:49-54`
4. `oauth-login.ts:165-168` 读 state 行里的 `return_path`，303 回到登录前页面
5. 失败一律回 `/account/login?oauth=<reason>`

### 会话机制（app 内不适用）

`establishPlatformSession`（`platform-auth/contracts/session.ts:204-253`）**无条件**写 cookie，然后按请求头 `x-ims-auth-mode: bearer` 决定要不要把 token 也放进响应体。

| Cookie | 属性 |
| --- | --- |
| `ims_platform_access` | httpOnly, path `/` |
| `ims_platform_refresh` | httpOnly, path `/api/platform/auth` |
| `ims_platform_csrf` | 非 httpOnly |

`sameSite: 'Lax'` 硬编码，`secure` 取自 config，**`Domain` 未设置**。Web 构建同源 → 纯 cookie；打包 App 跨源 → localStorage（`platform-token-store.ts:20-21`）。

**结论：Tauri WebView 无法继承回调写入的 cookie**——origin 不同，且 API 不给 credentials 许可、前端主动 omit。app 侧只能走 bearer 通道（`X-IMS-Auth-Mode` / `X-IMS-Refresh-Token` / `capturePlatformTokens`），这条通道**已经存在**。

### 深链能力不存在

- `apps/web/src-tauri/` 下：`Info.ios.plist` 无 `CFBundleURLTypes`，`tauri.conf.json` 无 `plugins.deep-link`，`Cargo.toml` 无 `tauri-plugin-deep-link`。自定义 scheme / universal link / app link 均**不存在**
- 已有 `tauri-plugin-opener` 与成熟的 `openSystemUrl` 封装（`apps/web/app/lib/system-opener.ts:44-56`），但它只负责"送出去"，不负责"收回来"
- `src-tauri/gen/` 是派生产物（被 `apps/web/src-tauri/.gitignore:10` 忽略），Android 的 scheme 声明需要走构建后重新应用脚本，可参照 `android-release-network.js`

### redirect_uri 单值且只允许 HTTPS

`platform_oauth_providers` 以 `code` 为主键，每 provider 一个 `redirect_uri`；读取**无缓存**，每次 `listOAuthProviderConfigs()` 实时查库。`validatePlatformOAuthRedirectUri`（`apps/api/src/config/platform-oauth.ts:100-107`）**只允许 HTTPS**。

### provider 侧的硬约束（外部事实）

- **Google**：Android 客户端**默认禁止**自定义 URI scheme，报错原文 `Custom URI scheme is not supported on Android or Chrome apps`；可在 Cloud Console 的 Advanced Settings 里为 app 启用，但官方推荐改用 Google Identity Services Android SDK。iOS 客户端**仍支持** reverse-DNS 形式的 scheme（`com.example.app:redirect_uri_path`，**scheme 必须含点号**）。loopback 对 iOS / Android 已废弃
- **GitHub**：`redirect_uri` 需与登记的 callback URL 精确匹配（开启 wildcard 时要求 host 与 port 精确、path 为子目录）

### 关键设计洞察

provider 只看到我们那个 **HTTPS 回调**；app 回跳发生在我们自己的回调**之后**。因此：

- provider 配置不需要改，不需要为 app 加第二条 `redirect_uri`
- `validatePlatformOAuthRedirectUri` 的 HTTPS 校验不需要放宽
- 也不需要为了绕开 Google 的 Android scheme 禁令去写 Google Identity Services 的 Tauri 原生插件

### 既有方向

`docs/development/tauri-mobile.md:321-323` 已把方向写成 "deep link + 一次性 token exchange"，本子任务与之对齐。

### 移动 Web 的真实降级点

移动 Web 上按链路核对，**看不出会失败的代码路径**（同源、`Lax` 顶层导航）。真实问题有三处：

- provider 列表异步加载导致入口静默消失（加载失败时用户看不到任何 OAuth 按钮）
- 整页跳转会丢失表单已填内容
- `?oauth=<reason>` 参数现在**无人读取**，失败原因对用户不可见

### 约束

- 契约先行，新增请求/响应 schema 落在 `@imsweb/contracts/platform`
- 不改 provider 表结构，不加第二条 `redirect_uri`
- 不放宽 `validatePlatformOAuthRedirectUri`
- app 侧沿用既有 bearer 通道，不引入第二套会话机制
- 深链回调必须一次性、短时效、防重放；不能把长期凭据放进 URL

## Requirements

- MR1 app 内 OAuth 入口可用（不再被 `IS_APP_TARGET` 关闭）
- MR2 app 内点击 OAuth 后用系统浏览器打开授权页（复用 `openSystemUrl`）
- MR3 授权完成后回调仍落在既有 HTTPS API 回调，按 state 的发起方分流
- MR4 app 发起时，回调以一次性短时效授权码回跳 app，app 再用该码换取会话
- MR5 一次性码消费后立即失效，重放被拒
- MR6 app 换取会话走既有 bearer 通道，cookie 不参与
- MR7 Web 发起时行为与现状一致（303 回 `return_path`），移动 Web 一并受益
- MR8 移动 Web 上 OAuth 入口在 provider 列表加载失败时给出可重试的失败态，不静默消失
- MR9 `?oauth=<reason>` 失败原因在登录页可见
- MR10 授权页在外部浏览器打开期间，app 内给出等待态与取消入口

## Acceptance Criteria

- [ ] AC1 iOS 与 Android app 内均能看到 OAuth 登录入口
- [ ] AC2 app 内点击 OAuth 后在系统浏览器打开 provider 授权页，app 内出现等待态
- [ ] AC3 授权完成后 app 自动回到前台并完成登录，无需手动切回
- [ ] AC4 一次性授权码消费后重放被拒；超过时效被拒
- [ ] AC5 app 内登录成功后会话可用，且不依赖 cookie
- [ ] AC6 Web（桌面与移动浏览器）登录行为与改动前一致，无回归
- [ ] AC7 用户在浏览器中取消授权时，app 等待态能正常结束并给出提示
- [ ] AC8 provider 列表加载失败时入口显示失败态与重试，不静默消失
- [ ] AC9 登录失败时登录页展示由 `?oauth=<reason>` 映射出的原因
- [ ] AC10 provider 表结构与 `validatePlatformOAuthRedirectUri` 的 HTTPS 校验均未变更

## Out of Scope

- 用 Google Identity Services / Sign in with Apple 原生 SDK 换取更优体验（需要 Tauri 原生插件，另评估）
- OAuth 绑定（link）流程本身——由子任务 `09-18-account-oauth-email-binding` 负责；本子任务的回调分流需要与之协调 `intent` 字段
- 内嵌 in-app 浏览器（WebView 内完成授权）方案
- 桌面端（非移动）行为调整

## Open Questions

- MR-Q1 app 回跳机制：自定义 scheme（零服务端配置）还是 universal link / app link（需托管 `.well-known`，更安全）
- MR-Q2 平台覆盖：iOS 与 Android 同期交付，还是先 iOS 再 Android

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
