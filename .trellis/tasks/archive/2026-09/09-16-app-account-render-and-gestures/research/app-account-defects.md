# App 我的分区四个缺陷的调查记录

调查环境：`apps/web` app-target dev server（`pnpm dev:app`），Playwright `app-webkit`（iPhone 13 390x844）与 320px 视口，API 用 E2E dispatcher mock。探查用的临时 spec 已删除，仓库当时保持干净。

## R1 分区渲染

复现：`/account/me` 点击五个子菜单链接，URL 都正确变成 `/account/me/<section>`，但页面始终显示个人资料编辑器；`#profile-workspace-section-profile` 无 `hidden`，其余四个面板都带 `hidden`。

插桩结论：`AccountMeSectionPage` 用 `useParams()` 拿到的 `section` 正确（cards / favorites / offices / claims），`useMatches()` 显示命中的路由是 `pages/account/me/account-me-section-page: /account/me/<section>`，而它渲染出的 `CommunityExchangeMeWorkspace` 收到的 props 是 `{params, loaderData, actionData, matches}`，`section` 为 `undefined`，`activeSection` 回退到 `"profile"`。

机制：React Router 的 Vite 插件把路由模块的默认导出包成 `UNSAFE_withComponentProps`，只注入路由 props。见 `node_modules/react-router/dist/development/chunk-62JRHF6Z.mjs:7269`。单测（vitest，不走插件）因此覆盖不到。

全仓扫描 `~/pages/*` 导入：只有 `account-me-section-page.tsx` 一处把路由模块默认导出当组件使用。

现有测试缺口：

- `tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx` 的 `renderAccountSection` 固定传 `section="profile"` 和 `sectionBasePath="/account/me"`，非 profile 的 App 分区从未被 `section` prop 驱动过。
- `tests/e2e/app-account.spec.ts` 只断言五个链接的 href，只点击 个人资料。

## R2 窄屏横向溢出

复现（320px 视口）：`/account/me` 根页 `scrollWidth=320`；五个分区页 `scrollWidth=376`。唯一越界元素是其上的 `#exchange-profile-avatar`（`position:absolute`，`display:block`，computed width `361px`，left 15）。390px 视口不越界。

机制：`apps/web/app/components/ui/field.tsx:59,63` 的 `[&>.sr-only]:w-auto` 生成 CSS `.sr-only\:w-auto > .sr-only { width: auto }`，覆盖 `.sr-only` 自带的 `width:1px`。头像文件输入是绝对定位元素，`width:auto` 走 shrink-to-fit，WebKit 下取到约 361px，从而让整个文档横向溢出。

`sr-only` 定义位于构建产物的 `.sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}`。

## R3 缩放

当前 app target 的 viewport 由 `apps/web/app/lib/app-target.ts:18` 的 `VIEWPORT_CONTENT` 提供，`apps/web/app/layouts/root-layout.tsx:29` 输出。实测 app target 的 meta 是 `width=device-width, initial-scale=1, viewport-fit=cover`，没有 `maximum-scale` 或 `user-scalable`。

`apps/web/app/app.css` 中与手势相关的规则只有第 581 行的 `touch-action: none`（局部组件），根元素未设置 `touch-action`，也未见过阻止 pinch zoom 的样式或原生配置。

## R4 返回

返回按钮来自 `apps/web/app/components/app/app-navigation-provider.tsx` 的 `goBack()`：先 `rememberCurrentLocation()`，再 `hasUsableAppHistoryBack(state)` 为真时 `navigate(-1)`，否则回到当前栏目的根路径。这是 09-13 已验收的 R2 语义。

`apps/web/app/lib/app-navigation-state.ts` 保存每个栏目的快照（href、scrollY、routeKey）以及带 tabId 的历史条目，身份变化时会删除 account 快照（`isPersonalAppRoute` 命中的路径）。

`apps/web/playwright.app.config.ts` 的 webServer 设置 `reuseExistingServer: !process.env.CI`，本地并发运行多个 app E2E 文件会复用同一个 1420 端口 dev server。

未验证项：iOS WKWebView 是否已开启边缘滑动返回手势、Android 系统返回在 Tauri v2 壳层中如何映射到 WebView 历史，都需要在实现时查证 Tauri 版本与平台配置。
