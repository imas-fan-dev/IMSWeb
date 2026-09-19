# 实现计划：两个并行工作流

用户要求直接并发两个子代理实施，不进入完整设计阶段。两个工作流按文件所有权切分，互不重叠，可以同时编辑同一工作区。

## W1 我的分区渲染与窄屏溢出（R1 + R2）

文件所有权：

- `apps/web/app/pages/account/me/account-me-section-page.tsx`
- `apps/web/app/pages/community/exchange/me/community-exchange-me-page.tsx` 及同目录新建的非路由模块
- `apps/web/app/components/ui/field.tsx`
- `apps/web/tests/unit/pages/account/**`、`apps/web/tests/unit/pages/community/exchange/**`
- `apps/web/tests/e2e/app-account.spec.ts`

步骤：

1. 把共享视图从路由模块里抽出到非路由模块（例如 `apps/web/app/pages/community/exchange/me/community-exchange-me-workspace.tsx`），路由模块只保留 loader / 默认导出与路由 props 适配。
2. `account-me-section-page.tsx` 改为导入抽出的视图组件，恢复 `section` / `sectionBasePath` 传递；保留 `?section` 回退与非法分区重定向行为。
3. 修正 `field.tsx` 中让 `.sr-only` 子级宽度变 `auto` 的写法，使隐藏输入不参与布局宽度；保持 `#exchange-profile-avatar` 的 id 与 `setInputFiles` 能力。
4. 补测试：分区页非 profile 分区的渲染测试（修复前必须失败）、app E2E 点击五个子菜单断言面板切换、320px 视口 `scrollWidth === innerWidth` 断言。
5. 验证：`pnpm --filter @imsweb/web test:unit`、`pnpm --filter @imsweb/web typecheck`、`pnpm --filter @imsweb/web lint`，以及 `npx playwright test --config playwright.app.config.ts app-account.spec.ts`。

## W2 缩放与返回层级（R3 + R4）

文件所有权（不得修改 W1 的文件）：

- `apps/web/app/lib/app-target.ts`、`apps/web/app/app.css`
- `apps/web/app/components/app/app-navigation-provider.tsx`、`apps/web/app/lib/app-navigation-state.ts`、`apps/web/app/components/app/app-tab-model.ts`
- `apps/web/tests/e2e/app-navigation.spec.ts` 与新增单元测试
- `apps/web/src-tauri/**` 中与 WebView 手势或系统返回相关的配置

步骤：

1. app target 的 `VIEWPORT_CONTENT` 追加 `maximum-scale=1, user-scalable=no`，根元素加 `touch-action: pan-x pan-y`；Web target 输出保持不变。
2. 我的栏目子页的返回走层级：`/account/me/:section` 与 `/account/security` 返回 `/account/me`；`/account/me` 根页保留历史语义。层级判定放在导航层，不要写进 W1 所有的页面文件。
3. 原生手势返回与按钮一致：查证当前 Tauri 版本的 iOS WKWebView 返回手势开关与 Android 系统返回映射，能开启就开启，不能就记录平台限制。
4. 补测试：直链进入分区页后返回、跨栏目进入我的子页后返回、我的根页返回沿历史；缩放断言 meta 与 computed `touch-action`。
5. 验证：`pnpm --filter @imsweb/web test:unit`、typecheck、lint，以及 `npx playwright test --config playwright.app.config.ts app-navigation.spec.ts`。

## 集成与校验门

1. 两个工作流都不得执行 `git commit`、`git add`、`git checkout` 或改动对方文件；提交由主会话统一完成。
2. 两个工作流的 E2E 都会启动 `pnpm dev:app`（1420），配置为复用已有 server，本地并发可接受；单位测试与 typecheck 互不冲突。
3. 合并后由主会话运行统一门禁：`pnpm --filter @imsweb/web test:unit`、`pnpm --filter @imsweb/web typecheck`、`pnpm --filter @imsweb/web lint`、app E2E 全量（`app-account`、`app-navigation` 及受影响的 app spec）。
4. 独立验收：对照 prd 的 R1-R4 逐条核对，重点复查 R1 的 props 传递与 R2 的 320px 断言不是靠放宽断言通过。
5. 真机或模拟器无法覆盖的项（iOS 手势缩放、Android 系统返回）记录到 `validation.md`，写明未验证原因。
