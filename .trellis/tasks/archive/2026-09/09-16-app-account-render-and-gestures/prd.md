# App 我的分区渲染、窄屏溢出与手势修复

状态：规划已定（轻量 PRD + 实现计划），用户要求直接并发两个子代理实施，跳过完整 design.md。

## 目标

修掉 App 场景里四个已确认的问题：我的资料各分区子菜单都只渲染个人资料面板、窄屏子页横向溢出、整页可双指缩放、我的子页返回不走上一级层级且原生手势未适配。

## 背景与决策依据

用户在 App 实机使用中连续报告四个问题，并要求直接并发两个子代理修改，不进入完整设计阶段。前两个问题的根因已由本次调查在 app-target dev server 上复现并定位，证据见 `research/app-account-defects.md`。

R4 会改动任务 09-13-app-navigation-interaction 已验收的需求 R2「返回沿用实际浏览历史语义」。用户本次明确要求：我的子页的返回按钮要回到我的下的上一级，而不是上一条路由。这是对 09-13 R2 的定向修订，仅适用于我的栏目内的子页；我的栏目根页仍保留浏览历史语义。

## 需求

### R1 我的资料分区正确渲染

App 里 `/account/me/:section` 的五个分区（个人资料、交换名片、收藏夹、事务所与位置、认领消息）必须渲染 URL 指定的分区。

根因：`apps/web/app/pages/account/me/account-me-section-page.tsx` 把路由模块 `pages/community/exchange/me/community-exchange-me-page.tsx` 的默认导出当普通组件渲染并传 `section` / `sectionBasePath`。React Router 的 Vite 插件给路由模块默认导出套了一层 `UNSAFE_withComponentProps`（`node_modules/react-router/dist/development/chunk-62JRHF6Z.mjs:7269`），该包装只传 `{params, loaderData, actionData, matches}`，调用方 props 被丢弃，`activeSection` 回退成 `"profile"`。

要求：分区页不得直接使用路由模块的默认导出作为组件；共享视图抽到非路由模块，由路由模块和分区页各自导入；Web 侧 `?section=` 行为与 `/community/exchange/me` 路由不变。

验收：新增的单元测试在修复前失败（分区页渲染 cards 时个人资料面板可见）；app E2E 逐个点击五个子菜单，断言目标面板可见且其余四个带 `hidden`。

### R2 窄屏无横向溢出

`/account/me` 及五个分区页在 320px 视口下 `document.documentElement.scrollWidth` 必须等于 `window.innerWidth`。

根因：`apps/web/app/components/ui/field.tsx:59,63` 的 `[&>.sr-only]:w-auto` 把直接子级 `.sr-only` 的 `width:1px` 覆盖为 `auto`，头像上传的绝对定位 `<input type="file" id="exchange-profile-avatar">` 因此按 shrink-to-fit 撑到 361px（超出 320px 视口 56px）。390px 视口不触发，所以 375px 及更窄机型才可见。

要求：隐藏输入不再参与布局宽度计算；`#exchange-profile-avatar` 的 id 与 `setInputFiles` 能力保留；不改变 `field.tsx` 对正常字段的布局语义。

### R3 App 内禁用双指缩放

App target 页面不得被双指缩放或双击放大。

要求：app target 的 viewport meta 追加 `maximum-scale=1, user-scalable=no`；根元素设置 `touch-action: pan-x pan-y`（保留滚动与双向平移，禁用 pinch zoom）；Web target 行为不变。

验收：断言 app target 下 meta content 与根元素 computed `touch-action`；真机或模拟器的实际手势结果记录到 `validation.md`，无法在自动化环境验证的部分必须写明平台限制。

### R4 我的子页返回层级与手势返回

`/account/me/:section` 与 `/account/security` 的返回按钮回到 `/account/me`，不使用浏览历史；`/account/me` 根页保持现有历史语义（回到上一个路由）。

原生手势返回必须与按钮一致：iOS 的 WKWebView 边缘滑动返回、Android 的系统返回手势或按键。若当前壳层未开启 iOS 返回手势，需开启并说明改动位置；无法开启时记录平台限制与替代方案。

验收：E2E 覆盖三条路径（直链进入分区页后返回、跨栏目进入分区页后返回、我的根页返回沿历史），原生手势部分给出模拟器或真机证据，或明确记录未验证原因。

## 范围外

- wiki 内页面（沿用 09-13 的"wiki 内的不用改变"）。
- 底部五栏目结构与栏目归属（09-13 已验收）。
- 社区、交换地图页面内部的布局与交互。

## 验收总则

`pnpm --filter @imsweb/web typecheck`、Web 单元测试、`pnpm --filter @imsweb/web lint` 与 app E2E 必须通过；不引入与本次四个问题无关的改动。

## 相关

- 来源任务：`.trellis/tasks/09-13-app-navigation-interaction`（被定向修订：其 R2 返回语义）。
- 调查证据：`research/app-account-defects.md`。
