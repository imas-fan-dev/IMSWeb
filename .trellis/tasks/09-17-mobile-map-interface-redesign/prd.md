# 社区交换事务所移动端地图界面重设计

## Goal

重做社区交换事务所地图的移动端界面：移除 +/- 缩放按钮改用纯手势、把 OpenMapTiles 授权信息收进折叠菜单并以 dialog 展示、在 iOS App 上用 UIKit 原生 Liquid Glass 重绘定位/菜单/刷新等浮动控件。

## Background

- 地图主链路在 `apps/web/app/pages/community/exchange/`：`community-exchange-page.tsx`、`community-exchange-map-section.tsx`、`exchange-office-map.tsx`、`exchange-map-model.ts`、`exchange-office-map.css`。
- `+/-` 是 MapLibre 内置 `NavigationControl`（`exchange-office-map.tsx:11, 644-647`），桌面与移动共用，没有平台分支。捏合与双击缩放当前已可用（`touchZoomRotate`/`dragPan`/`doubleClickZoom` 走默认 `true`），MapLibre 自带的 `.maplibregl-canvas { touch-action: none }` 让 App 构建的 `user-scalable=no` 不会削弱地图捏合。因此本次是删控件与改验收断言，不是补建手势能力。
- 授权信息当前是 `AttributionControl({ compact: true })` 加上初始化后程序化点击 `<summary>`，收敛为左下角一枚 ⓘ，点击原地展开。文案来自 `apps/web/public/maps/exchange-style.json` 中 `sources.openmaptiles.attribution`（自托管 pmtiles，属许可义务而非服务商注入）。
- 折叠菜单 `components/exchange-mobile-navigation.tsx` 是硬编码 JSX，只被 `community-exchange-page.tsx:792-804` 一处使用。只有 App 构建有折叠菜单；Web 桌面是顶部标题卡，Web 移动是 `grid-cols-5` 底部导航。
- 平台识别只有 `lib/app-target.ts` 的 `IS_APP_TARGET`（App/Web，不分 iOS/Android）；iOS 识别先例是 `lib/native-glass.ts:46-56` 的纯函数 `isIosRuntimeIdentity`。
- 仓库已有 Tauri 原生玻璃插件 `apps/web/src-tauri/plugins/native-glass/`，当前只为底部 tab bar 安装 UIKit `UITabBarController`，并把 Lucide 图标以 `.xcassets` 随包分发。
- `docs/architecture/glass-refraction-platform-strategy.md` 记录了两层玻璃策略，并明确「原生例外只属于 App 导航层」。本次需求把该例外扩展到页面内浮动控件，需要同步修订该 ADR。
- 详细现状证据见 `research/current-map-ui.md`。

## Requirements

### R1 移除缩放按钮

移动端地图不显示 `+` / `-` 缩放按钮。缩放由既有的双指捏合、双击、以及键盘 `+`/`-` 承担，不新增替代按钮或缩放入口。

桌面端与 Web 窄屏同样移除，不保留平台特例。

地图区域的辅助说明、可访问名称与键盘提示改为手势措辞，不再提到加减按钮。

### R2 授权信息入口

OpenMapTiles 相关授权信息不再是地图内嵌控件，改为折叠菜单中的独立条目，点击后由 dialog 展示。

dialog 内容包含 `exchange-style.json` 中 `sources.openmaptiles.attribution` 的完整文案与全部外链，链接可点击并在新标签页打开。授权文案是许可要求，改版后必须仍然可达且完整，不能因为移出地图而被弱化或省略。

授权文案按原文顺序渲染，链接与普通文字的相对顺序不变。不写入新的授权文字，不替换许可版本，不遗漏任何一个链接。

入口覆盖四种布局：App 折叠菜单、Web 768–1023px 顶部标题卡、Web 窄屏（<768px）底部导航、Web ≥1024px 发现侧栏。四处打开同一个 dialog。

四处的可见区间必须拼成一个无缺口的全集：不能出现某个宽度下授权文案完全无法打开的情况。

### R3 iOS 原生 Liquid Glass 控件

在 iOS App 上，`定位`、`菜单触发与展开面板`、`刷新`这三类浮动控件改用 UIKit 原生 Liquid Glass 绘制，玻璃折射其下方实时地图内容。

- 仅 iOS App 生效。Android App、iOS 26 以下、以及 Web 全部保持现有 CSS 玻璃或普通外观。
- 原生路径启用时，对应 DOM 控件从布局中隐藏（不只是透明），避免出现双层轮廓或重复的按压反馈。
- 原生控件承载图标、文案、按压反馈与可访问名称；动态状态（菜单展开、筛选已应用徽标、定位进行中/禁用、激活态）由 Web 侧推送到原生。
- 原生控件命中区域之外的地图手势必须继续透传到 webview；原生控件出现时不得阻塞地图平移、缩放与点位点击。
- 原生路径不可用时（插件返回 `supported: false`）自动回退到 CSS 玻璃，界面不得出现空白占位或双份控件。
- 原生控件与底部 tab bar、四侧安全区、顶部 App 标题栏之间不重叠。菜单展开时 tab bar 按既有浮层抑制规则让位。

### R4 玻璃样式收敛

移除 `+/-` 与内嵌 attribution 后，地图 CSS 中失去消费者的 MapLibre 控件规则一并删除，不留死样式。

地图专用的第三套玻璃实现（`exchange-map-app-control` / `exchange-map-app-surface`）与 `app.css` 的 `--glass-*` token 保持数值一致；不新增第四套硬编码数值。

既有降级路径继续成立：`prefers-reduced-transparency: reduce` 下退回不透明背景，`forced-colors: active` 下保持可用对比度。

### R5 不变更的行为

不改变地图数据加载、区域边界合规处理、点位选中、viewport 记忆、定位成功/失败与错误提示、筛选/名录/详情 Sheet 的既有行为。

不改变 `/community/exchange` 的路由、预渲染声明与 URL 结构。

不改动地图交互开关本身：`touchZoomRotate`、`dragPan`、`doubleClickZoom`、`keyboard` 保持启用，旋转相关开关保持关闭。

## Constraints

- 触碰 `apps/web/src-tauri/plugins/native-glass/**` 时遵循 `docs/development/app-device-delivery.md`：设备操作走 `pnpm run app:*` 脚本，不直接调用 Tauri CLI；`src-tauri/gen/` 不手改。
- 原生玻璃依赖 Xcode 26 与 iOS 26 SDK，验收需要 iOS 26 模拟器或真机。
- 玻璃与控件不得引入新的运行时依赖或远程资源；Lucide 图标继续随包分发。
- 测试文件新增或改名需同步 `apps/web/tests/unit/e2e/unit-source-policy.test.ts` 的显式清单。

## Acceptance Criteria

> 逐条状态与证据。带 `[ ]` 的是本机无法取得证据的项，原因写在该条后面，未以构建通过冒充实测结论。

- [x] 移动端地图 DOM 中不存在 `.maplibregl-ctrl-zoom-in`、`.maplibregl-ctrl-zoom-out`、`.maplibregl-ctrl-compass`、`.maplibregl-ctrl-group`，桌面端同样不存在。
      证据：`community-exchange-map.spec.ts` 断言 `.maplibregl-ctrl-group` 与 `.maplibregl-ctrl-attrib` 计数为 0（chromium-desktop 与 chromium-mobile）；`exchange-office-map.test.tsx` 断言 `addControl` 从未被调用；`exchange-map-styles.test.ts` 断言两份 CSS 里不再残留 `.maplibregl-ctrl*` 规则。
- [x] 双指捏合、双击、键盘 `+`/`-` 三种方式都能改变缩放级别，且缩放后 viewport 正确写回。
      证据：`app-map.spec.ts` 的 viewport 用例先 `canvas.dblclick()`，再聚焦 canvas 按 `=` 放大，两次都轮询 sessionStorage 里的 zoom 递增；捏合没有自动化替代（需要真实触摸），由 `exchange-office-map.test.tsx` 的「保留捏合/双击/键盘/拖拽」用例守护对应 handler 未被 `disable()`。
- [x] `apps/web/tests/e2e/app-map.spec.ts` 的 viewport 持久化用例改为手势驱动并通过，不再依赖 `.maplibregl-ctrl-zoom-in`。
      证据：app 配置下 `playwright test --config playwright.app.config.ts tests/e2e/app-map.spec.ts` → 5 passed / 3 tag-skipped。
- [x] 地图区域内不存在 MapLibre attribution 控件；授权文案与三个外链在 dialog 中完整可见且可点击。
      证据：`community-exchange-map-attribution.spec.ts` 从 `public/maps/exchange-style.json` 读取文案，断言三个外链的 `href`、`target="_blank"`、`rel` 与可见文本；`carousel` 断言 `.maplibregl-ctrl-attrib` 计数为 0。
- [x] App 折叠菜单、Web 顶部标题卡（768–1023px）、Web 底部导航（<768px）、Web 发现侧栏（≥1024px）四处入口都能打开同一 dialog，Escape 与点击遮罩可关闭，关闭后焦点回到触发控件。
      证据：授权 E2E 三条用例覆盖三个 Web 宽度区间（每次断言另两处入口隐藏），`app-map.spec.ts` 覆盖 App 折叠面板；Escape 与遮罩关闭、焦点回到触发钮均在 `openAndCloseAttribution` 中断言。
- [x] 授权文案不可用（解析为 `null`）时四处入口都不渲染，且不出现空白 dialog。
      证据：`community-exchange-map-attribution.spec.ts` 用无 attribution 的样式在 400 / 900 / 1280 三个宽度断言入口计数为 0 且不存在 dialog；App 侧由 `exchange-mobile-navigation.test.tsx` 断言不传 attribution 时菜单内没有该条目。
- [x] Web 移动底部导航在 375px 宽度下不溢出，每个条目的触控目标不小于 44 × 44 CSS 像素。
      证据：授权 E2E 的 375px 用例断言六个条目、`documentElement.scrollWidth - innerWidth <= 0`，并逐个测量每个条目的 `boundingBox`。
- [ ] iOS 26 模拟器或真机上，定位、菜单触发、菜单面板、刷新四处呈现原生 Liquid Glass，玻璃后方可见实时地图内容且随地图平移变化。
      未验证（观感）。本机为 Xcode 27 + iOS 27 SDK，`pnpm run app ios --target simulator --no-launch` 已成功产出并安装
      `gen/apple/build/arm64-sim/IMSWeb.app`，在 iPhone 18 Pro 模拟器上启动正常且原生底部 tab bar 可见——这证明 Swift 控件代码能编译、链接并随应用运行，
      但不等于四个地图控件生效。要看到那四个控件仍需两个本机不具备的条件：可达的 API origin（打包版指向局域网 API，本机未启动）
      与模拟器上的触摸注入（`simctl` 不支持点击，应用也未注册 URL scheme）。因此该条与第 11 条留待设备验收。
- [x] ios 26 原生路径启用时 DOM 中对应控件不可见；插件返回 `supported: false` 时 DOM 控件恢复可见且样式与 Android 一致。
      证据：`native-glass-controls.test.tsx` 断言只有 `supported: true` 才写 `data-native-glass="controls"`，`false` 与 reject 都不写、已有则删除；`exchange-map-styles.test.ts` 断言 `app.css` 用 `display: none`（而非 opacity）隐藏孪生。设备上的可见性仍属上一条。
- [x] Android App 与 Web 的外观与改版前一致（除移除 `+/-` 与 attribution 外）。
      证据：`native-glass-controls.test.tsx` 断言未准入（Web / Android 身份）时插件完全不被调用，控件保持 DOM 与 `exchange-map-app-control`；`community-exchange-app-page.test.tsx` 继续断言 App 工具区只有刷新按钮且带原玻璃类名；`app-map.spec.ts` 在 App 构建下通过。像素级观感未做对比。
- [ ] 地图平移、缩放、点位点击在原生控件启用时仍然可用，控件外的触摸不被原生视图吞掉。
      未验证（触摸）。`GlassControlOverlayView.hitTest` 只经过编译与代码审阅，没有设备端触摸证据（也没有 UIKit 单测）。
      与第 8 条同因：需要能打开地图页并注入触摸的环境。
- [x] `prefers-reduced-transparency: reduce` 下地图浮动控件为不透明背景且无 backdrop-filter。
      证据：`exchange-map-styles.test.ts` 断言地图 CSS 的 reduce 分支同时包含 `backdrop-filter: none` 与 `rgb(255 255 255 / 98%)`，且不含 `backdrop-filter: blur`；`glass-material.test.ts` 继续覆盖 `app.css` 的降级块。Playwright 无法模拟该媒体特性，故以样式契约断言。
- [x] `pnpm --filter @imsweb/web lint`、`pnpm run test:web`、`pnpm run build` 通过。
      证据：`pnpm --filter @imsweb/web run check`（lint + typecheck + unit + build）通过；unit 208 文件 / 1351 用例通过。`pnpm run test:web` 的整套 Playwright（7 workers）在 home 页面 9 条用例上因并发负载失败，按仓库约定的 CI 方式 `CI=1 --workers=1 --retries=0` 复跑同两个文件为 37 passed / 3 skipped / 0 failed，属既有并行抖动而非本任务回归。
- [x] `docs/architecture/glass-refraction-platform-strategy.md` 已更新，记录原生例外扩展到页面内浮动控件的原因与边界。
      证据：平台矩阵新增一行、决策段新增原生绘制段落与 z 序理由、后果与证据段同步；`pnpm run check:root` 的文档规则检查通过。

## Out of Scope

- 桌面端地图布局重构、发现侧栏改版。
- 制作人地图（`components/producer-map/`）与 admin 地图。
- 新增地图数据源、缩放级别调整、地图样式改版。
- Android 的原生玻璃（Android 保持 WebView CSS 玻璃）。
