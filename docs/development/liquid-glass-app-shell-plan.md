# 液态玻璃升级与 App 外壳实施计划

> 文档类型：开发
> 状态：Active
> 权威来源：`apps/web/app/app.css`、`apps/web/app/routes.ts`、`apps/web/app/layouts/`、`apps/web/playwright.config.ts` 和分支 `codex/astra-glass-wip-20260818`

本计划覆盖两件事：把液态玻璃提升为全站视觉语言，以及为 Tauri 打包产物提供专属的外壳、导航与启动界面。
折射策略的取舍理由不在本文件，见 [玻璃折射的平台策略](../architecture/glass-refraction-platform-strategy.md)。
移动端现状与跨源阻塞项见 [Tauri 移动端基础设施](tauri-mobile.md)。

## 范围与前置状态

工作分支为 `release/v1.1`。前一阶段的 Tauri 脚手架、`VITE_IMS_API_ORIGIN` 跨源契约和 `origin.ts` 已落地但尚未提交。

玻璃实现的来源是 `codex/astra-glass-wip-20260818` 的单提交（46 文件，+2559/-481）。
`.worktrees/astra-inspired-home` 不是可用来源：它零领先提交，内容是未提交的工作区状态，并混入了
`wiki-workbench.tsx`、`endpoints/wiki.ts`、tier-list 删除和新增 `Dockerfile` 等无关改动。

来源分支落后主线约 20 个提交，移植前需要 rebase 并人工通过一次冲突。

## 分层模型

| 层 | 内容 | 产物范围 |
| --- | --- | --- |
| 共享层 | 玻璃 token、`@layer components` 工具类、`components/ui/*` 采纳、全部动效 | web 与 app 同源同款 |
| App 专属层 | 品牌冷启动遮罩、app layout 骨架、底部 tab bar | 仅 app 产物 |

分叉方式为构建期开关双产物。web 产物零影响；app 产物排除 `adminRoutes`。

移植边界排除来源分支中的 home 页重写（`home/index.tsx`、`home-motion.tsx`、`home.css`）。
该部分属于版式重构而非玻璃材质，且冲突面最大。

## 并发编排

工作按文件所有权切成八条轨道。同一文件只允许一条轨道写入，跨轨道的文件重叠一律转为串行依赖。

### 轨道定义

| 轨道 | 内容 | 独占文件 | 阻塞依赖 |
| --- | --- | --- | --- |
| T1 玻璃材质层 | token、工具类、`DESIGN.md` Materials 章节、ui 组件采纳 | `apps/web/app/app.css`、`apps/web/DESIGN.md`、`apps/web/app/components/ui/*` | 无 |
| T2 动效与折射 | 状态过渡、滚动驱动、指针跟随高光、伪折射地板、真折射封顶 | `apps/web/app/app.css` 的动效区段、新增 SVG filter 资源、高光驱动模块 | T1 |
| T3 验证基建 | Firefox project、axe 覆盖扩展 | `apps/web/playwright.config.ts`、`apps/web/tests/e2e/*.accessibility.spec.ts` | 无 |
| T4 App 构建分叉 | 构建期开关、路由裁剪、prerender 调整 | `apps/web/vite.config.ts`、`apps/web/app/routes.ts`、`apps/web/react-router.config.ts` | 无 |
| T5 App 外壳 UI | 冷启动遮罩、app layout、底部 tab bar、「我的」静态壳 | `apps/web/app/layouts/root-layout.tsx`、新增 app layout 与 tab bar 组件、新增「我的」页面 | T4 |
| T6 底部安全区重排 | 悬浮按钮簇与 tab bar 共处、移除 `AdminReturnShortcut` | `apps/web/app/layouts/public-layout.tsx` | T1 |
| T7 API 跨源 | CORS 放行、凭据策略、CSRF 跨源方案 | `apps/api/src/app.ts`、`apps/api/src/config/env.ts`、`apps/api/src/middleware/hono-auth.ts` | 无 |
| T8 跨源 Web 适配 | 媒体 URL 归一化、地图同源校验放宽 | `apps/web/app/pages/**`、`apps/web/app/lib/api/origin.ts` | 无 |

### 并发波次

第一波可立即并行启动：**T1、T3、T4、T7、T8**。五条轨道之间没有文件重叠，也没有语义依赖。

第二波在各自前置完成后启动：**T2**（等 T1）、**T5**（等 T4）、**T6**（等 T1）。

第三波是收口：把会话态接入「我的」页，需要 T7 与 T5 同时完成。

### 冲突热点

| 文件 | 争用轨道 | 处理 |
| --- | --- | --- |
| `apps/web/app/app.css` | T1、T2 | 强制串行。T2 在 T1 合入后开工 |
| `apps/web/app/layouts/public-layout.tsx` | T1、T6 | 来源分支改过该文件，T6 必须等 T1 的冲突通过完成 |
| `apps/web/app/components/ui/*` | T1 独占 | 其他轨道不得改动这些文件 |

T3 与 T7 是整个计划里风险最低、最值得提前开工的两条：前者不改任何产品代码，后者完全落在 `apps/api`，与所有 web 轨道零重叠。

## 第一批 共享玻璃层

对应 T1、T2、T3。

### 内容

- rebase 来源分支并通过冲突，落地 token（`--glass-rgb`、`--glass-blur`、`--glass-saturate` 与亮暗两套 alpha 阶梯）。
- 落地 `@layer components` 工具类：`.glass-surface`、`.glass-bar`、`.glass-panel`、`.glass-control`，`backdrop-filter` 保持包在 `@supports` 内。
- 保留 `.glass-quiet`，继续用于表格、列表和虚拟滚动，避免这些表面承担合成开销。
- `components/ui/*` 采纳玻璃：dialog、sheet、popover、alert-dialog、sonner、card。
- 保留来源分支已有的三类降级：`prefers-reduced-transparency`、`forced-colors`、`prefers-reduced-motion`。
- `DESIGN.md` 增加 Materials 章节与 `glass-bar`、`glass-panel`、`glass-control` 三个组件条目，不新增调色板条目。
- 动效基线：状态过渡与滚动驱动，全部由 CSS 承担。
- 指针跟随高光：由一个节流到 rAF 的指针监听写入 CSS 自定义属性，作用面限定为顶栏、tab bar 和少数卡片。
- 折射：伪折射地板全平台生效，Chromium 上叠真折射封顶，Firefox 显式关闭。

### 约束

`backdrop-filter` 的 blur 半径不得参与动画。动画 blur 半径会强制每帧重做全表面模糊，
alpha、高光位置和 transform 则可以留在合成线程上。

### 退出条件

- `pnpm run check` 通过，含 `designmd lint` 与 `check-docs`。
- `pnpm --filter @imsweb/web run test` 全绿。
- 三个 Playwright project（`chromium-desktop`、`chromium-mobile`、新增 firefox）全绿。
- axe 在首页与扩展路由上零违规。
- Firefox 上人工确认玻璃表面正常渲染，未出现元素消失。

## 第二批 App 外壳

对应 T4、T5、T6。

### 内容

- 构建期开关产出双产物，app 产物排除 `adminRoutes`，同步维护 `react-router.config.ts` 的 prerender 列表。
- 品牌冷启动遮罩落在 `root.tsx` 的 `RootDocumentLayout`，随 prerender 进入每页，hydration 后移除。
  遮罩只解决冷启动白屏，不等待会话、不承担引导。
- app layout 顶部只保留极简标题栏，去掉汉堡抽屉。
- 底部玻璃 tab bar 五项：首页、活动、故事站、社区、我的。
  推荐、直播、关于降级为首页卡片入口或收进「我的」。
- 新增「我的」路由。当前仅做静态壳，承载账户状态占位、我的名片入口（`/community/exchange/me`）、
  主题切换和降级下来的三个入口。
- 底部悬浮簇与 tab bar 重新分配 `env(safe-area-inset-bottom)`，`AdminReturnShortcut` 从 app 产物移除。

### 验收限制

打包后的 app 在第三批完成前调不通任何 API。本批只做视觉验收。
依赖接口的页面在真机上会呈现空态或错误态，这是预期结果，不作为缺陷记录。

### 退出条件

- web 产物与本批改动前逐字节一致。
- app 产物在 Android 与 iOS 真机上冷启动无白屏，tab bar 与安全区表现正常。
- 记录一次真机帧率基线，不设阈值门。

## 第三批 跨源打通

对应 T7、T8 与会话态收口。

### 内容

- CORS 放行 app 来源并输出 `Access-Control-Allow-Credentials`，现状只放行 loopback。
- 处理 `SameSite=Lax` 与跨站请求的不兼容，或改走 Bearer token。
  API 已在 `hono-auth.ts` 中优先接受 `Authorization: Bearer`，登录响应也已返回 token。
- 处理 CSRF 双提交对 `document.cookie` 的依赖。
- 改造 `hasPlatformSessionHint()`。它当前读 `document.cookie` 中的平台 CSRF cookie，
  在 app 里恒为假，导致会话恢复请求根本不会发出。
- 归一化约 41 处直接消费 API 媒体 URL 的组件，并放宽 `exchange-map-model.ts` 的同源校验。
- 把真实会话态接入「我的」页。

### 退出条件

- app 真机上可完成登录、读取会话、加载列表页与媒体资源。
- 「我的」页显示真实账户状态。

## 验证门

| 门 | 形式 | 说明 |
| --- | --- | --- |
| 无障碍 | axe 从首页扩到活动、社区、故事站 | 玻璃靠调高 alpha 承载正文，contrast 是主要回归风险 |
| 跨引擎正确性 | 新增 Firefox 的 Playwright project | 守住真折射导致元素不渲染这条正确性风险 |
| 视觉回归 | 不建立截图基线 | `backdrop-filter` 渲染跨 GPU 与平台存在像素差异，玻璃表面的基线会成为持续假阳性来源 |
| 移动端性能 | 一次真机帧率基线记录 | 目前没有任何测量数据，先取基线再谈阈值 |
| 跨平台观感 | 写入验收标准 | iOS 与 Android 的折射差异是平台能力决定的预期行为，不是缺陷 |

## 遗留开放项

- 「我的」页的产品范围未定，第二批只交付静态壳。
- 分叉模型采用构建期开关，实施前值得再确认一次。
- 低端 Android WebView 上真折射叠加 `backdrop-filter` 的帧率没有数据。
- Tauri 应用图标仍是脚手架占位符，缺少 1024 见方的品牌源文件。
- 来源分支的 rebase 与冲突通过尚未执行。
