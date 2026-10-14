# 归档核对（2026-09-19）

方式：只读 agent 逐条把 16 条验收项对照当前代码与测试。13 条有证据，3 条依赖真机未勾选。
未执行测试套件，未做设备构建。

## 逐条证据

| AC | 证据 |
| --- | --- |
| AC2 | `platform-oauth-app-section.tsx`；`platform-oauth-app-section.test.tsx` › "starts the system-browser flow from a provider button"、"shows the waiting state with a cancel action" |
| AC4 | `platform-oauth-exchange.test.ts` › "a replayed code is rejected after the first redemption"、"an expired or unknown code is rejected"；`platform-account-management-repository.test.ts` › "an exchange code is consumed exactly once"、"a concurrent exchange redeems the code for exactly one caller" |
| AC5 | `oauth-exchange.ts`（API 侧 bearer 会话）；Web 侧 `X-IMS-Auth-Mode: bearer` + `platform-client.ts:147:capturePlatformTokens` |
| AC6 | `platform-oauth-callback-branches.test.ts` › "login + web keeps the original callback redirect and sets the session cookies"；`platform-oauth-sign-in.spec.ts`（web 与 `@mobile` 手机视口）；`account-auth-mobile-web.test.tsx`；Web JSX 分支未改 |
| AC8 | `account-auth-form.tsx:959-972`；`account-auth-mobile-web.test.tsx` › "shows a retryable failure state instead of silently hiding the entry"；zh-CN 与 en 均有 `loadFailed` / `retry` |
| AC9 | `account-auth-form.tsx:141-143,630`；测试 "renders the failure reason from ?oauth= and drops the parameter"、"maps an expired round trip to its own reason" |
| AC10 | `validatePlatformOAuthRedirectUri` 最后修改在 `384e2230`（任务开始前）；`20260918120000_platform_oauth_app_exchange.sql` 只改 `platform_oauth_states` 并新建一次性码表 |
| AC11 | `oauth-link-section.tsx` + `startPlatformOAuthLinkApp`；API "app OAuth link start returns the provider URL and records an app state"；`use-platform-oauth-app-link.test.tsx` › "posts the challenge, opens the returned URL, and waits" |
| AC12 | API "an app link callback returns a one-time code with flow=link"；`use-platform-oauth-app-link.test.tsx` › "redeems a deep-link code, reloads the list, and reports the link" |
| AC13 | `oauth-link-branch.ts:102,128,131,135`；`account-security-model.ts:127-133`；测试 "maps a deep-link error through the account-security reason keys" |
| AC14 | 深链测试 "routes a link callback only to link listeners"、"does not hand a login callback to a link listener"、"holds each flow separately until its own listener arrives"、"holds the launch URL of a cold start"；`app-layout.test.tsx` |
| AC15 | "a web link callback still returns to account security with a reason"、"a link state round-trips its account and intent" |
| AC16 | 绑定码与登录码同经 `mintPlatformOAuthExchangeCode`，由同一个 `/exchange` 兑换，重放证明来自上面的共享端点与表测试；没有绑定专用的重放用例 |

## 未勾选（依赖真机）

| AC | 状态 | 说明 |
| --- | --- | --- |
| AC1 | 部分 | `account-auth-form.tsx:976` 在 `IS_APP_TARGET` 下渲染 `PlatformOAuthAppSection`，旧的隐藏守卫已移除；`app-oauth-sign-in.spec.ts` › "offers the provider entry that the app used to hide" 跑在 `app-iphone` / `app-android` 项目上，但那是 Playwright 的浏览器模拟，不是 app 安装 |
| AC3 | 未验证 | 监听器与冷启动缓冲都在（`platform-oauth-deep-link.ts`、`app-layout.tsx:51-60`），单测模拟了投递，前台唤起与真实 URL 投递只能在设备上验；`implement.md` §9 标着 `[真机]` 未执行 |
| AC7 | 部分 | API "a provider denial on an app state is handed back to the deep link"，Web "maps a provider denial onto a visible reason" 与超时用例都有；前台接收仍是设备侧 |

## 真机链路的其他缺口

- 仓库里没有任何设备证据；`src-tauri/gen/` 被 gitignore，生成的 `AndroidManifest.xml` intent-filter 与 iOS `CFBundleURLTypes` 无法在仓库内确认。
- `implement.md` §8 提到的兜底脚本 `apps/web/scripts/android-oauth-deeplink.js` **不存在**。若 deep-link 插件确实注入了 intent-filter 则无影响，但这一点未被证明。
- 冷启动只有单测模拟，没有真实重启用例。
- 一次性码 TTL 5 分钟（`PLATFORM_OAUTH_EXCHANGE_CODE_TTL_MS`），verifier TTL 10 分钟，两侧不对称但不影响正确性。

## Tauri 配置

文档描述的流程所需配置齐全：`tauri.conf.json` 的 `plugins.deep-link.mobile` 为 scheme `imsweb` / host `oauth` / pathPrefix `/callback`，`Cargo.toml` 依赖 `tauri-plugin-deep-link = "2"`，`lib.rs:35` 注册插件，`capabilities/default.json` 含 `deep-link:default`，`Info.ios.plist` 正确地没有 `CFBundleURLTypes`。
`tests/tauri-build-configuration.test.js` 把这些对着 `APP_OAUTH_CALLBACK_URL` 钉住了；钉不住的是生成的平台 manifest。
