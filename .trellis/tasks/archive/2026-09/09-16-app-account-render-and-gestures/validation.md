# 验证记录：App 我的分区渲染、窄屏溢出、缩放与返回（R1-R4）

范围：`apps/web`（Web 前端与 Tauri 壳）。实现由两个并行子代理完成，随后由主会话独立重跑门禁并逐文件复核。两个子代理的并行调用在 15 分钟时被系统取消，因此它们的汇报不作为证据，下列结果全部由主会话重新执行。

## 独立重跑的门禁

- `pnpm --filter @imsweb/web typecheck`：通过。
- `pnpm --filter @imsweb/web lint`：通过。
- `pnpm --filter @imsweb/web test:unit`：204 个测试文件、1315 个测试通过（37.85s）；补上 POP 校正的用例后复跑为 1316 个通过。
- 复核顺序说明：上面第一轮门禁跑在 POP 校正之前。校正后重新跑 typecheck、lint、单测与 app-webkit（app-account + app-navigation，共 9 个用例）。其中一个 app-account 用例报 `browser.newContext: Target page, context or browser has been closed`（0ms 失败），单独重跑该 spec 三个用例全通过，属于测试链前刚跑完 1316 个单测后 WebKit 实例崩溃，不是代码问题。
- `npx playwright test --config playwright.app.config.ts --project=app-webkit tests/e2e/app-account.spec.ts tests/e2e/app-navigation.spec.ts`：8 个通过。
- `npx playwright test --config playwright.app.config.ts --project=app-small tests/e2e/app-account.spec.ts tests/e2e/app-navigation.spec.ts`：12 个通过、3 个跳过（320x568 视口）；补上 POP 校正的用例后复跑为 13 个通过、3 个跳过。
- `pnpm --filter @imsweb/web build`：构建成功（4.53s），`check-classic-wiki-css-build.mjs` 通过，说明 Wiki 级联未受影响；POP 校正后复跑同样成功（4.52s）。
- `pnpm run check:root` 与 `pnpm run check:rules`：退出码均为 0（源码边界、路由清单、文档校验）。
- `cargo check --target aarch64-apple-ios-sim`（`apps/web/src-tauri`）：退出码 0（`Finished dev profile in 0.88s`，增量缓存命中，指纹覆盖当前源码）。

第一次 app-webkit 全量运行时有 3 个 `app-account.spec.ts` 用例失败：session 请求缺少 `Authorization` 头（`Received: undefined`），`/api/platform/me` 收到 0 次。原因是并行子代理被取消后遗留的 1420 端口 dev server 带着旧模块图。终止该进程并让 Playwright 启动全新 server 后，同样三个用例全部通过（18.5s）。失败属于陈旧 dev server，不是代码回归。

## 实现保真复核

`apps/web/app/pages/community/exchange/me/community-exchange-me-page.tsx` 的共享视图抽到同目录的 `community-exchange-me-workspace.tsx`。用 `git show HEAD:` 取出旧文件与新文件做 diff，共 42 行差异，全部是导入排序、`meta` 抽出到路由模块、类型与组件改名（`CommunityExchangeMePageProps` → `CommunityExchangeMeWorkspaceProps`，内层 `CommunityExchangeMeWorkspace` → `ProfileWorkspace`），没有逻辑改动。

## R1 我的资料分区渲染

根因与复现见 [research/app-account-defects.md](research/app-account-defects.md)。修复后：

- 单元测试 `tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx` 通过 `Routes` 渲染真实 `AccountMeSectionPage`，对 `cards`、`favorites`、`offices`、`claims` 四个分区断言目标面板不带 `hidden`、其余四个面板带 `hidden`。
- app E2E `我的资料 submenu` 用例逐个点击五个子菜单，断言 URL、目标面板可见、其余面板隐藏，并在每次切换后断言 `document.documentElement.scrollWidth === window.innerWidth`。
- `app-webkit` 与 `app-small` 两个项目都通过。

单元测试无法覆盖该缺陷本身：vitest 不经过 React Router 的 Vite 插件，旧代码在单测里也能把 `section` 传下去。真正的回归保护是 app-target 浏览器测试。

## R2 窄屏横向溢出

修复前（320px 视口）：`/account/me` 根页 `scrollWidth` 320，五个分区页 376，越界元素是 `#exchange-profile-avatar`（computed width 361px）。修复后 `field.tsx` 的 `[&>.sr-only]:w-px` 让隐藏输入的宽度保持 1px。

- app E2E 在 320x568 视口逐分区断言 `scrollWidth === innerWidth`，`app-small` 项目下通过。
- 390px 视口本来就不溢出，因此该断言只在窄视口项目有意义。

## R3 双指缩放

- app target 的 viewport 现为 `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`；Web target 保持 `width=device-width, initial-scale=1`。
- `app.css` 的 `html[data-app-target="app"] { touch-action: pan-x pan-y }` 只命中 App，Web 与 Wiki 样式表不受影响。
- app E2E `keeps the app viewport free of pinch and double-tap zoom` 断言 meta 三项与根元素 computed `touch-action`，`app-webkit`（390x844）与 `app-small`（320x568）都通过。

## R4 返回层级与原生返回

- 层级判定在 `app-tab-model.ts` 的 `appBackHierarchyTarget`：`/account/me/:section` 与 `/account/security` 返回 `/account/me`，`/account/me` 根页返回 `null`，其他账号路由（登录、注册、重置密码）也不参与。
- `goBack`：父级已在当前条目下方时 `navigate(-1)`，否则 `navigate("/account/me", { replace: true })`；根页保持原有历史语义。
- Android：在 Tauri 的 `app` 插件上只对三个我的子页注册 `onBackButtonPress`，回调走同一个 `goBack`，离开即注销，Tauri 默认的 back-or-exit 行为保留。
- iOS：`src-tauri/src/lib.rs` 的 `enable_ios_back_swipe` 在 `setup` 里通过 `with_webview` 把 WKWebView 的 `allowsBackForwardNavigationGestures` 置为 `true`，并新增 iOS 依赖 `objc2 = "0.6"`（已存在于 Cargo.lock，diff 仅一行）。
- 平台依据已在本机 crate 源码核对（不是转述）：`wry 0.55.1` 的 `setAllowsBackForwardNavigationGestures` 位于 `#[cfg(target_os = "macos")]` 分支（`src/wkwebview/mod.rs:512` 起始的块，调用在 513 行），`back_forward_navigation_gestures` 默认 `false`（`src/lib.rs:840`）；`tauri 2.11.5` 的 `AppPlugin.kt` 在没有 JS 监听时 `canGoBack()` 为真才 `goBack()`，否则退出，有监听时发 `back-button` 事件。
- 测试：`app-tab-model.test.ts` 覆盖层级目标表，`app-navigation-provider.test.tsx` 覆盖直链进入、父级在下方、跨栏目 replace 后再返回、根页沿历史，`app-navigation.spec.ts` 覆盖直链返回、跨栏目返回、恢复到子页后的原生 POP、根页历史；`app-webkit` 与 `app-small` 都通过。

## R4 补充：原生 POP 校正

从其他栏目恢复到我的子页时，历史栈里 `/account/me` 不在子页下方，此时 iOS 边缘滑动、以及 Android 未注册监听时的默认返回，都会弹到上一个栏目。`AppNavigationProvider` 现在额外检查每一次提交：当 POP 离开我的子页且落点不是父级时，push 一次 `/account/me`。

用 push 而不是 replace：落点那一条被保留，再返回一次仍然回到原栏目。它与按钮的最终状态相同（按钮 replace 掉子页条目，历史形状一致），同时不会因一次滑动就丢掉上一个栏目的条目。只有真正改变条目 key 的 POP 才触发，避免同一条目重渲染或 StrictMode 双调用被误判。

两处都做了 fail-before 对照：

- `app-navigation-provider.test.tsx` 新增「pushes the account root when a native pop leaves a restored section」。把 `navigate(leftTarget)` 换成空操作后该用例失败，落点是 `/community`。
- `app-navigation.spec.ts` 新增「returns a restored account section to its root on a native pop」，路径为 `/account/me` → 分区 → 资料 → 我的 → `page.goBack()`。去掉校正后该用例失败，落点是 `/apps`。

## 未验证与平台限制

- 真机或模拟器上的双指缩放、双击放大：未验证。`user-scalable=no` 被 iOS Safari 忽略但被 WKWebView 遵守这一点没有本机证据，`touch-action` 覆盖双击缩放的部分同样只在桌面 WebKit 断言过。
- Android 系统返回手势或按键：逻辑依据 `AppPlugin.kt` 与 `onBackButtonPress` 的注册路径实现，未在模拟器或真机运行。注册是异步的，刚进入子页的一瞬间按返回仍可能走 Tauri 默认路径。
- iOS 边缘滑动返回：编译检查通过，运行时行为未在模拟器或真机验证。从其他栏目恢复到子页的情形已由 POP 校正覆盖；冷启动深链时历史栈里没有任何下方条目，滑动本就无可回退目标，不单独处理。
- `cargo check --target aarch64-apple-ios-sim`：主会话重跑退出码 0（增量缓存命中，指纹覆盖当前源码），但真实手势行为仍未验证。
