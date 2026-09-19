# 移动 Web 的既有适配与 OAuth 现状

范围：回答移动浏览器上发起 OAuth 会怎样，代码里能否看出失败或降级。
注意：这里的「移动 Web」指在手机浏览器里访问站点，不是 Tauri app。后者见 `03` 与 `04`。

## 1. 有没有移动/小屏分支

有，但全是**布局与原生桥接**层面的，没有一条与 OAuth 或登录流程相关。

匹配 `matchMedia` / 视口 / 移动端的代码（节选，均与认证无关）：

- `apps/web/app/lib/app-target.ts:25-27` `VIEWPORT_CONTENT`：app 构建用 `viewport-fit=cover` + 禁缩放，web 构建保持 `width=device-width, initial-scale=1`。
- `apps/web/app/components/ui/use-safe-area-collision-boundary.ts:22, 65-78` —— `window.visualViewport` 监听，用于安全区避让。
- `apps/web/app/components/shared/glass-sheen-tracker.tsx:121-122` —— `(pointer: fine)` 和 `(prefers-reduced-motion)`。
- `apps/web/app/pages/home/hooks/use-home-summary-count.ts:12-22` —— 首页摘要数量的桌面断点。
- `apps/web/app/lib/native-glass.ts:49-78` —— 按 UA 判断 iOS/Android，但调用点都在 `IS_APP_TARGET && isTauri()` 之后（`native-glass.ts:58`），移动浏览器不进入。

`matchMedia` / `useIsMobile` / `isMobile` 的使用点里**没有任何一处涉及 OAuth、会话、cookie 或弹窗策略**。仓库里没有 `useIsMobile` 这类通用 hook（搜索无命中）。

## 2. 有没有 in-app browser / 第三方 cookie 处理

**不存在。**

- 搜索 `MicroMessenger` / `WeChat` / `FBAN` / `in-app browser` 等 UA 标记：无命中。
- 搜索 `window.open` / `popup`：`window.open` 在前端被 ESLint 禁用（`apps/web/eslint.config.js:76-79`），代码里没有使用；`popup` 的命中全是 UI 组件的 `aria-haspopup` 与 wiki 弹层，与 OAuth 无关。
- 没有任何关于第三方 cookie、Storage Access API、`SameSite=None` 的处理代码。

## 3. 移动 Web 上发起 OAuth 实际会发生什么

按 `01-web-oauth-flow.md` 的链路：

1. 点击 → 当前标签页整页跳到 `/api/platform/auth/oauth/<provider>/start?returnPath=...`。
2. API 303 到 provider 授权页。
3. 用户在 provider 页授权（移动端通常已有登录态）。
4. provider 303 回 `/api/platform/auth/oauth/<provider>/callback?code=...&state=...`。
5. API `establishPlatformSession` 在 API origin 上 Set-Cookie，然后 303 回 `returnPath`。

逐步对照，**看不出会在移动 Web 上失败的代码路径**：

- 全程是顶层 GET 导航，`SameSite=Lax` 允许在这类导航上携带 cookie（`apps/api/src/domains/identity/platform-auth/contracts/session.ts:30`）。
- 生产拓扑下站点与 API 同源（web 构建不设 `VITE_IMS_API_ORIGIN`，`apps/web/package.json` 的 `build` 脚本；`apps/web/app/lib/api/origin.ts:20, 81`），所以 cookie 是第一方 cookie，不触发 iOS ITP 的第三方限制、也不受存储分区影响。
- access token 只在 httpOnly cookie 中，Web 端没有任何依赖 `localStorage` 的会话步骤，因此 Safari 的脚本可写 cookie 上限不影响它。
- 请求侧 `credentials: "same-origin"`（`request.ts:55`），同源下正确。

## 4. 能看出的真实降级点

以下都是**推断**，依据是代码结构而不是移动端特判：

1. **provider 列表是客户端异步拉取的**（`account-auth-form.tsx:132-144`）。首屏渲染时 `oauthProviders` 为空数组，按钮区（`:880`）不渲染。弱网下用户可能先看到密码表单，OAuth 入口稍后才出现；如果请求失败，`catch` 分支把列表置空（`:141-143`），OAuth 入口**静默消失**，没有任何错误提示。
2. **整页跳转会丢失登录页的输入状态**。用户若先填了邮箱再点 OAuth，返回时表单是空的（router state 不经过这次跳转）。
3. **失败原因不显示**。`redirectToLogin` 会带 `?oauth=<reason>` 回登录页（`oauth-login.ts:52-56`），但 `account-auth-form.tsx:104` 只读 `reset` 参数，没有读 `oauth`。所以「用户在 provider 页点了取消」和「state 过期」在 UI 上无法区分。
4. **站点内嵌浏览器（微信、微博、部分 App 的内置 WebView）**：代码没有任何适配。这类 WebView 常屏蔽对 `accounts.google.com` 等域的跳转，或禁止新建顶层导航。这是真实风险，但**代码里无从判断**，需要真机验证。

## 5. 与路由清单的关系

`/account/login` 在 route-metadata 里是 `SHARED_TARGETS` + `prerender`（`apps/web/app/route-metadata.ts:113-121`），即移动 Web 和小屏共享同一份预渲染产物，没有单独的移动路由或移动布局。移动端只靠 Tailwind 的 `sm:` 断点收敛，OAuth 按钮网格是 `grid gap-3 sm:grid-cols-2`（`account-auth-form.tsx:888`）—— 手机上单列，两个 provider 各占一行。

## 6. 小结

移动 Web 没有专门工作要做：现有链路在设计上就是可用的，缺的只是**失败反馈**与**弱网下的入口可见性**。真正的阻塞在 Tauri app 一侧，不在移动浏览器一侧。
