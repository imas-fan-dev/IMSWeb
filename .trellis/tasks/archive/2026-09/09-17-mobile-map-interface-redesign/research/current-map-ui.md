# 现状调研：交换事务所地图移动端界面

> 范围：只读调查。所有结论均来自当前工作树（`maplibre-gl@5.24.0`），行号以调查时的文件内容为准。
> 本文件为 PRD/design 的输入证据，不代表改造方案。

## 0. 相关文件清单

| 角色 | 路径 |
| --- | --- |
| 地图页面入口 | `apps/web/app/pages/community/exchange/community-exchange-page.tsx`（915 行） |
| 地图数据/配置壳层 | `apps/web/app/pages/community/exchange/community-exchange-map-section.tsx`（521 行） |
| MapLibre 实例与控件 | `apps/web/app/pages/community/exchange/exchange-office-map.tsx`（979 行） |
| 地图私有样式 | `apps/web/app/pages/community/exchange/exchange-office-map.css`（137 行） |
| 移动端导航 | `apps/web/app/pages/community/exchange/components/exchange-mobile-navigation.tsx`（192 行） |
| 全局样式与玻璃 token | `apps/web/app/app.css`（1080 行） |
| 平台开关 | `apps/web/app/lib/app-target.ts` |
| iOS 原生玻璃识别 | `apps/web/app/lib/native-glass.ts` |
| 地图样式（授权文案来源） | `apps/web/public/maps/exchange-style.json` |
| 玻璃 ADR | `docs/architecture/glass-refraction-platform-strategy.md` |

`community-exchange-map-section.tsx` 通过 `import("./exchange-office-map")` 懒加载地图组件（约 268–281 行），MapLibre 不会进入首屏包。

---

## 1. 缩放控件 `+/-`

#### 渲染方：MapLibre 内置 `NavigationControl`，不是自定义 DOM

- `exchange-office-map.tsx:11` 从 `maplibre-gl` 引入 `NavigationControl`。
- `exchange-office-map.tsx:644-647`：

  ```ts
  map.addControl(
    new NavigationControl({ showCompass: false, showZoom: true }),
    "bottom-right"
  )
  ```

  即只显示 `+`/`-`，隐藏指北针。桌面与移动端**共用同一套控件**，没有任何 `IS_APP_TARGET` 分支去区别对待；差异只体现在 CSS 尺寸/位置。
- 断言存在：`apps/web/tests/e2e/community-exchange-map.spec.ts:235-237` 断言 `.maplibregl-ctrl-compass` 数量为 0、`.maplibregl-ctrl-zoom-in` / `-out` 可见；`apps/web/tests/e2e/app-map.spec.ts:337` 直接 `page.locator(".maplibregl-ctrl-zoom-in").click()` 来驱动地图缩放并验证 viewport 持久化。

#### 现有 CSS 处理（两处，均为位置/外观覆盖，不改结构）

| 位置 | 选择器 | 作用 |
| --- | --- | --- |
| `app.css:1060-1069` | `@media (max-width: 767px)` 下 `[data-exchange-office-map] .maplibregl-ctrl-bottom-left/-right` | `bottom: calc(5.5rem + env(safe-area-inset-bottom))`；左下角限宽 `calc(100% - 5rem)` |
| `exchange-office-map.css:75-116` | `@media (max-width: 47.999rem)` 下 `[data-exchange-office-map][data-app-target] .maplibregl-ctrl-bottom-left/-right`、`.maplibregl-ctrl-group`、`.maplibregl-ctrl-group button` | 左下/右下抬到 `calc(var(--app-floating-bottom) + 3rem)`、右下 `right: 0.75rem`；把 `.maplibregl-ctrl-group` 改造成 88% 白色 + `backdrop-filter: blur(16px) saturate(180%)` 的玻璃块，按钮 2.5rem×2.5rem |
| `exchange-office-map.css:118-136` | `@media (prefers-reduced-transparency: reduce)` | 上述 `.maplibregl-ctrl-group` 退回不透明背景、关闭 backdrop-filter |

`.maplibregl-ctrl-group` / `.maplibregl-ctrl-zoom-*` 的**基础样式全部来自 `maplibre-gl/dist/maplibre-gl.css`**（经 `exchange-office-map.tsx:1` 导入），项目没有覆写按钮图标、`border-radius`、阴影以外的基础规则。

#### 删除 `+/-` 需要触及的位置

1. `exchange-office-map.tsx:11`（import）、`644-647`（`addControl`）；`NavigationControl` 在测试 mock 中也需同步：`apps/web/tests/unit/pages/community/exchange/exchange-office-map.test.tsx:109`。
2. `exchange-office-map.css:75-116` 中所有 `.maplibregl-ctrl-group*` 规则，以及 `118-136` 的 reduced-transparency 回退块中针对 `.maplibregl-ctrl-group` 的一行（`exchange-office-map.css:132`）。
3. `app.css:1060-1069`：`.maplibregl-ctrl-bottom-right` 的定位规则将失去唯一消费者；`.maplibregl-ctrl-bottom-left` 仍被 attribution 使用，需要保留。
4. 测试：
   - `apps/web/tests/e2e/community-exchange-map.spec.ts:236-237` 两条 zoom 可见性断言必须删除或改写。
   - `apps/web/tests/e2e/app-map.spec.ts:337` 依赖点击 `+` 触发 `moveend` 并写回 viewport。此处需要替代驱动手段（例如手势、`easeTo`、或保留一个可编程入口），否则该用例失去缩放触发点。该断言后续还检查 `mapBounds` 增长与 `viewport.zoom` 持久化（约 336-372 行）。
5. 无障碍：`exchange-office-map.tsx:512-517` 给 canvas 设置了 `aria-label="区域事务所地图。使用方向键移动地图，使用加减按钮缩放。"`，其中「使用加减按钮缩放」需要改成手势措辞。键盘缩放本身来自 `map.keyboard`（默认启用，仅 `disableRotation()`，见 639 行），删除按钮不影响键盘可用性，但提示语要与之对齐。

---

## 2. 现有手势能力

`exchange-office-map.tsx:606-632` 的 `new MapLibreMap({...})` 选项：

| 选项 | 值 | 行 | 含义 |
| --- | --- | --- | --- |
| `attributionControl` | `false` | 625 | 禁用默认 attribution，改为手动添加 |
| `cooperativeGestures` | `false` | 626 | 不启用「Ctrl/双指才可缩放」的协作手势屏 |
| `dragRotate` | `false` | 621 | 关闭拖拽旋转 |
| `touchPitch` | `false` | 622 | 关闭双指俯仰 |
| `pitchWithRotate` / `rollEnabled` | `false` / `false` | 623-624 | 关闭旋转联动与 roll |
| `minPitch` / `maxPitch` | `0` / `0` | 619-620 | 锁定为俯视 2D |
| `bearing` / `pitch` / `roll` | `0` | 616-618 | 初始正北 |
| `minZoom` / `maxZoom` | `EXCHANGE_MAP_MIN_ZOOM`=2.3 / `EXCHANGE_MAP_MAX_ZOOM`=11 | 611-615；常量在 `exchange-map-model.ts:24-25` | 缩放范围 |

**未显式列出、因此走 MapLibre 默认 `true` 的交互**：`scrollZoom`、`boxZoom`、`doubleClickZoom`、`dragPan`、`keyboard`、`touchZoomRotate`。

- `exchange-office-map.tsx:638` `map.touchZoomRotate.disableRotation()`：捏合仍可用，仅禁止旋转分量。
- `exchange-office-map.tsx:639` `map.keyboard.disableRotation()`：方向键平移/`+`/`-` 缩放保留。

**结论：捏合缩放与双击缩放当前已可用**，不需要新增启用项；本次工作是「删按钮后仍然可用」，属于回归验证而非功能补建。

#### `touch-action` 与 `user-scalable=no` 的关系（关键，容易误判）

- `app.css:1053-1058`：`html[data-app-target="app"] { touch-action: pan-x pan-y }`，注释说明这是为了禁掉 App 内双指缩放与双击缩放。
- 但 MapLibre 自带 CSS 会在 canvas 上覆盖该值：`maplibre-gl.css` 中 `.maplibregl-canvas-container.maplibregl-touch-zoom-rotate.maplibregl-touch-drag-pan, ... .maplibregl-canvas { touch-action: none }`。因为本页同时启用了 `touchZoomRotate` 与 `dragPan`，这两个 class 都会被加上，canvas 最终是 `touch-action: none`。
- 结果是：MapLibre 用 pointer events 自行实现捏合，**`html` 上的 `pan-x pan-y` 和 `user-scalable=no` 不会削弱地图捏合缩放**。`app-target.ts:17-27` 的注释也承认 `touch-action` 只覆盖「剩余的」双击缩放场景。
- 外部 `app.css:581` 的 `.glass-tab { touch-action: none }` 与本页无交集。

**风险点**：若后续把 `cooperativeGestures` 打开或把 `touchZoomRotate` 关掉，canvas 的 `touch-action` 会退化为 `pan-x pan-y` / `pinch-zoom`，届时 App 的 `user-scalable=no` 就会真正吃掉捏合。改造中应保持 `touchZoomRotate` 启用。

---

## 3. 授权信息（Attribution）

**配置与初始化**（`exchange-office-map.tsx`）：

- 625 行：构造参数 `attributionControl: false`，即不用默认实例。
- 640-644 行：

  ```ts
  map.addControl(new AttributionControl({ compact: true }), "bottom-left")
  container
    .querySelector<HTMLElement>(".maplibregl-ctrl-attrib-button")
    ?.click()
  ```

  没有传入 `customAttribution`，唯一文案来自 style JSON。

**当前真实交互（已核对 `maplibre-gl` 源码 `dist/maplibre-gl-dev.js:69968-69998`）**：

- `compact: true` 时 `_updateCompact()` 会同时加上 `maplibregl-compact` 与 `maplibregl-compact-show`，也就是**添加时先是展开态**；
- 紧接的 `.click()` 命中 `<summary class="maplibregl-ctrl-attrib-button">`，触发 `_toggleAttribution()`，移除 `maplibregl-compact-show` → **收敛为左下角一枚 ⓘ 圆钮**。
- 容器是原生 `<details>`，按钮是 `<summary>`；用户点 ⓘ 会**原地展开**授权文案，不弹窗、不开新页面。文案内的链接是 `<a target="_blank">`，点击才跳外站。
- `_updateCompactMinimize()` 绑定在 map `drag` 上：拖动地图会自动收起（`maplibre-gl-dev.js:70002-70007`、`70028`）。

**授权文案原文**（`apps/web/public/maps/exchange-style.json`，全文件仅 1 处 `attribution`，位于 `sources.openmaptiles`）：

```html
<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>
<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a>
Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>
```

- 三个链接：`openfreemap.org`、`openmaptiles.org`、`openstreetmap.org/copyright`。
- 同一 style 的另一个 source `ne2_shaded` 是本地 raster，**无 attribution**；`metadata` 为空对象。
- 注意 `openmaptiles` 的 `url` 是 `pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles`（自托管），所以文案是许可要求而非服务商注入。

**可复用的 Dialog / Modal / Sheet 组件**（都在 `apps/web/app/components/ui/`，基于 `@base-ui/react`）：

| 组件 | 路径 | 关键 props / 结构 |
| --- | --- | --- |
| `Dialog` 家族 | `dialog.tsx` | 导出 `Dialog`、`DialogTrigger`、`DialogClose`、`DialogPortal`、`DialogOverlay`、`DialogContent`、`DialogHeader`、`DialogTitle`、`DialogDescription`、`DialogFooter`。`DialogContent` 额外有 `showCloseButton`（默认 true）、`overlayClassName`、`safeArea: "custom" \| "inset" \| "viewport"`（默认 `"inset"`）。内容层已用 `glass-surface glass-panel`，`data-slot="dialog-content"` |
| `AlertDialog` | `alert-dialog.tsx` | 确认类对话 |
| `Sheet` | `sheet.tsx` | 导出 `Sheet` / `SheetTrigger` / `SheetClose` / `SheetContent` / `SheetHeader` / `SheetFooter` / `SheetTitle` / `SheetDescription`。`SheetContent` 有 `side: "top" \| "right" \| "bottom" \| "left"`（默认 `"right"`），同样 `glass-surface glass-panel`，并接 `(--safe-area-*)` 变量 |
| `Popover` | `popover.tsx` | 轻量浮层 |
| 原生栏抑制 | `native-glass-suppression` 相关：`native-tab-bar-suppression.tsx`，被 `Dialog`/`Sheet` 内部渲染 | iOS 上打开浮层时隐藏原生 tab bar（引用计数） |

**复用提示**：`DialogContent` 的默认 `safeArea="inset"` 会把它居中并限制 `--overlay-safe-height`；iOS 上如果希望呈现为底部卡片，`Sheet side="bottom"` 更贴近现有地图内既有 Sheet 的语言（参见 `exchange-map-detail-sheet` / `-filter-sheet` / `-directory-sheet`，`exchange-office-map.css:32-44`）。

---

## 4. 折叠菜单 `exchange-mobile-navigation.tsx`

**组件结构**（`apps/web/app/pages/community/exchange/components/exchange-mobile-navigation.tsx`）

- 顶部导出 `ExchangeMobileNavigation`（182-192 行）：`IS_APP_TARGET` 为真时渲染 `AppExchangeMapNavigation`，否则渲染 Web 底部导航 `<nav>`（`grid-cols-5`、`md:hidden`、`aria-label="交换地图导航"`）。
- `AppExchangeMapNavigation`（128-180 行）：一个 floating 容器（`right-3`、`APP_FLOATING_CONTROL_OFFSET`、`lg:hidden`），内含：
  - 触发按钮：`aria-label` 在「展开地图工具 / 收起地图工具」间切换，`aria-controls="exchange-map-tools"`，`aria-expanded`；
  - `id="exchange-map-tools"` 的 `role="toolbar"` 面板，`inert={!expanded}`、`aria-hidden={!expanded}`、`w-36`、`right-[calc(100%+0.5rem)] bottom-0`，类 `exchange-map-app-surface`（玻璃外观）。
- 菜单项由 `ExchangeMapNavigationActions`（52-126 行）渲染，**不是数据数组，是硬编码的 JSX 分支**：
  - `地图`（`localToolsOnly` 时才隐藏）
  - `筛选`（`aria-label` 依 `filterApplied` 在「打开筛选」/「打开筛选，已应用筛选」间变化，`aria-pressed={filterApplied}`，带小圆点角标）
  - `事务所`（`aria-label="打开事务所名录"`、`aria-pressed={officesActive}`）
  - `名片`（`aria-label="打开名片名录"`、`aria-pressed={cardsActive}`）
  - `我的`（`NavigationLink` 到 `/community/exchange/me`，`localToolsOnly` 时隐藏）
- 两种样式类：`bottomItemClassName`（Web 底栏，竖排图标+文字）与 `sideItemClassName`（App 侧栏，横排 `h-10 w-full`）。

#### 新增一个「地图数据来源 / 授权信息」项会碰到的既有结构

1. **无租户/无权限概念**：组件只有 `filterActive / filterApplied / officesActive / cardsActive` 四个状态 props 和四个回调；新项若是纯本地 dialog，只需要新增 `onOpenAttribution?: () => void` 一类回调，不涉及租户或权限。
2. **数量与栅格约束**：Web 分支是 `grid-cols-5`，加第 6 项会挤坏布局（`exchange-mobile-navigation.tsx:184`）；App 侧栏是自由纵列，加项无栅格压力。若只在 App/iOS 菜单里加，`localToolsOnly` 分支是最省事的挂载点（该分支当前只渲染 3 项，加入后为 4 项）。
3. **可访问性属性**：现有按钮统一带 `aria-label` + `aria-pressed`（筛选/事务所/名片）或 `aria-current="page"`（地图）；`NavigationLink` 项只有 `aria-label`。新项若打开 dialog，应给 `aria-haspopup="dialog"`，并保证 `inert` 面板收起时不接收焦点（现有 `inert={!expanded}` 已处理）。
4. **组件复用范围**：`ExchangeMobileNavigation` **只被 `community-exchange-page.tsx:792-804` 一处使用**，没有跨页复用。`ExchangeMapNavigationActions` 也只在本文件内被两个分支调用。改动面很小。

---

## 5. 浮动控件清单（iOS 玻璃化改造面）

按层级从外到内。`IS_APP_TARGET` 分支指「仅 App 构建」或「App 与 Web 用不同 class」。

| # | 控件 | 文件 : 行 | 定位 | 平台差异 |
| --- | --- | --- | --- | --- |
| 1 | 刷新按钮（App 专用顶部工具区） | `community-exchange-page.tsx:644-663`，渲染于 `708-790` | 父容器 `absolute z-20 lg:hidden`；App 下 `top: calc(var(--app-header-inset) + 0.75rem)`、`right-3`；按钮本身 `size-10 rounded-lg` | App 分支**只渲染 refreshControl 一个按钮**（`723`）；Web 分支渲染带标题的整张卡片 |
| 2 | Web 顶部标题卡（标题 + 刷新 + 筛选/事务所/名片/账号，`hidden md:flex`） | `community-exchange-page.tsx:725-789` | 容器 `inset-x-2 top-2 sm:inset-x-3 sm:top-3`；内层 `rounded-md border bg-background/95 shadow-md backdrop-blur-sm sm:rounded-lg` | 仅 `!IS_APP_TARGET` |
| 3 | App 地图工具簇（菜单触发钮 + 抽屉面板） | `components/exchange-mobile-navigation.tsx:128-180` | 外层 `absolute right-3 z-30 lg:hidden` + `bottom-[var(--app-floating-bottom)]`；面板 `absolute right-[calc(100%+0.5rem)] bottom-0 w-36` | 仅 App；Web 用底部 5 列 nav（`182-192`，`absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] h-17 rounded-lg bg-background/95 backdrop-blur-md md:hidden`） |
| 4 | 定位按钮 | `exchange-office-map.tsx:912-958` | App：`right-3 bottom-[calc(var(--app-floating-bottom)+8.75rem)] size-10 md:right-2.5 md:bottom-20 md:size-8`；Web：`right-2.5 bottom-20`；基底 `absolute z-10 bg-background/95 shadow-sm backdrop-blur-sm` | App 加 `exchange-map-app-control` 类（→ 玻璃） |
| 5 | 定位状态提示（错误气泡） | `exchange-office-map.tsx:960-978` | `pointer-events-none absolute z-10 max-w-56`；App：`right-16 bottom-[calc(var(--app-floating-bottom)+8.75rem)]`；Web：`right-12 bottom-20` | 仅错误态渲染气泡，其余为 `sr-only` |
| 6 | MapLibre `+/-`（NavigationControl） | `exchange-office-map.tsx:644-647` | `bottom-right`；移动端 CSS 抬到 `calc(var(--app-floating-bottom) + 3rem)`（App）/ `calc(5.5rem + env(safe-area-inset-bottom))`（Web 窄屏） | 共用控件，仅 CSS 不同 |
| 7 | MapLibre attribution（ⓘ） | `exchange-office-map.tsx:640-644` | `bottom-left` | 无分支；`app.css:1060-1069` 做窄屏上抬与限宽 |
| 8 | 数据点计数徽标 | `community-exchange-map-section.tsx:404-437` | `pointer-events-none absolute left-3 z-10 max-w-[calc(100%-5.5rem)] rounded-lg border bg-background/95 ... backdrop-blur-sm`；App `top-[calc(var(--app-header-inset)+0.75rem)]`，Web `top-17 sm:top-19 lg:top-3` | App 加 `exchange-map-app-surface` |
| 9 | 地图数据更新失败告警 | `community-exchange-map-section.tsx:441-468` | `absolute inset-x-3 z-10 sm:left-auto sm:w-96`；App `bottom-[var(--app-floating-bottom)]`，Web `bottom-[max(2.75rem,calc(env(safe-area-inset-bottom)+2.25rem))]` | 位置分支 |
| 10 | 桌面区域详情面板 | `community-exchange-map-section.tsx:474-497` | `absolute top-3 right-3 z-10 hidden w-80 ... lg:block` | 仅桌面；`lg` 以下走 Sheet |
| 11 | 移动区域详情 Sheet | `community-exchange-map-section.tsx:499-518` | `SheetContent side="bottom"`，class `exchange-map-detail-sheet` | 无 App/Web 分支 |
| 12 | 筛选 Sheet | `community-exchange-page.tsx:808-825` | `SheetContent side="bottom"`，class `exchange-map-filter-sheet` | 无分支 |
| 13 | 名录 Sheet | `community-exchange-page.tsx:827-856` | `side={isNarrow ? "bottom" : "right"}`（断点 `max-width: 1023px`，`useNarrowWorkspace`） | 无分支 |
| 14 | 地图不可用占位卡 | `community-exchange-map-section.tsx:150-207` | `Empty` 覆盖层 `absolute inset-0 z-10`，内含 `rounded-lg border bg-white/95 shadow-[...] backdrop-blur-sm` 卡片 | 无分支 |
| 15 | 桌面发现侧栏 | `components/exchange-discovery-rail.tsx:79-84` | `relative z-10 hidden w-80 ... lg:flex` | 仅桌面，非浮动 |
| 16 | 全局 `BackToTop` | `components/shared/back-to-top.tsx:31-38` | `fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 size-11 rounded-full border bg-background` | 由 `public-layout.tsx:60` / `app-layout.tsx:94` 挂载；**交换页是 `overflow-hidden` 全屏路由、不滚动，因此该按钮在本页实际不会出现**（`community-exchange-page.tsx:668-671` 的 `main` 无滚动容器）。列入清单但不属于改造面 |
| 17 | 原生 iOS tab bar（UIKit，位于 WKWebView 之上） | `apps/web/src-tauri/plugins/native-glass/`；React 侧 `components/app/app-tab-bar.tsx` | 系统 `UITabBarController` | iOS 26+ 原生；Android 与 iOS<26 走 Web 回退 |

**App 专属浮动玻璃的现有类名只有两个**：`exchange-map-app-control`（互动件）与 `exchange-map-app-surface`（面板/徽标），定义在 `exchange-office-map.css:45-73`。清单 1、3、4 已用 `-control`；3 的面板与 8 已用 `-surface`；5、9、10、11、12、13、14 在 App 下**没有走这两个类**，是 iOS 玻璃化的空白区。

**断点不一致（值得记录）**：`useNarrowWorkspace` / `useNarrowMapLayout` 用 `1023px`（`community-exchange-page.tsx:104-114`、`community-exchange-map-section.tsx:78-88`），而 `ExchangeMobileNavigation` 的 Web 底栏用 `md:hidden`（`768px`）。在 768–1023px 区间，底栏被隐藏但详情/名录仍按「窄屏」走 Sheet。

---

## 6. 玻璃体系现状

#### 集中式 token 与工具类都已存在，位于 `apps/web/app/app.css`

变量（`:root`，`app.css:164-184`）：`--glass-rgb`、`--glass-blur: 16px`、`--glass-saturate: 180%`、`--glass-alpha-bar/panel/rest/hover/active`（0.62/0.78/0.5/0.68/0.82）、`--glass-highlight`、`--glass-edge`、`--glass-hairline`、`--glass-shadow-float`、`--glass-shadow-panel`、`--glass-accent`、`--glass-accent-strength`。

暗色分支 `.dark`（`app.css:257-270`）：`--glass-rgb: 26 26 31`、alpha 微调、highlight/edge/hairline 由白转弱白、阴影转黑、`--glass-accent-strength: 10%`。

序列染色：`[data-glass-accent="765|cg|ml|sidem|sc|gk"]`（`app.css:191-213`）。

工具类（`@layer components`）：

| 类 | 行 | 用途 |
| --- | --- | --- |
| `.glass-surface` | 280 | 玻璃基底：`backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))`（在 `@supports` 内，779-790）、inset 高光/描边、阴影 |
| `.glass-bar` | 306 | 顶栏：无浮阴影，改用 hairline |
| `.glass-panel` | 313 | 覆盖层面板：更高不透明度 + panel shadow |
| `.glass-control` / `:hover` / `:active` | 322-336 | 互动件不透明度阶梯 |
| `.glass-quiet` | 341 | 无 backdrop-filter 的低成本玻璃 |
| `.glass-refract` / `::before` | 395-437 | 伪折射镜边（装饰层） |
| `.glass-sheen` | 442-520 | 指针追踪高光 |
| `.glass-scroll-bar` | 531 | 滚动收敛 |
| `.glass-lens` / `.glass-lens-skin` / `.glass-tab` | 555-626 | 导航透镜与按压 |

**`-webkit-` 前缀**：只在真正的 `backdrop-filter` 上补（`app.css:788-789` 的 `@supports` 块）；`exchange-office-map.css` 同样成对书写（`54-55`、`90-91`、`127-128`）。

**降级矩阵**：

- `@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))`：`app.css:779-790`（`.glass-surface` 生效）、`787-796`（真折射 url() 仅在 `[data-glass-refraction="on"]` 时开）。
- `@media (prefers-reduced-transparency: reduce)`：`app.css:798-820` 把 `.glass-surface` 退回不透明 `var(--popover)` 并 `background-image: none`；`exchange-office-map.css:118-136` 对地图内 App 玻璃做同样回退。
- `@media (forced-colors: active)`：`app.css:822-842`。
- 真折射由根元素开关：`root-layout.tsx:25` 写死 `data-glass-refraction="on"`，决策依据见 `docs/architecture/glass-refraction-platform-strategy.md`（Chromium 用 `url(#glass-displacement)`，WebKit 静默丢弃，Gecko 曾整元素不渲染，因此挂在装饰伪元素上）。

**`exchange-office-map.css` 的地图专用玻璃**（未使用 `.glass-*` 工具类，是重复实现）：

- `exchange-map-app-viewport::before`（1-30 行）：顶部渐变 + `blur(10px) saturate(140%)` 的遮罩带。
- `.exchange-map-app-control, .exchange-map-app-surface`（45-60 行）：硬编码一组 `--background/--foreground/--primary/...` oklch 覆盖以强制浅色，背景 `rgb(255 255 255 / 88%)` + `blur(16px) saturate(180%)`。
- `.maplibregl-ctrl-group`（85-96 行）：同一套数值的第三份拷贝。

**结论**：已有可复用的集中 token 与 `.glass-*` 类；地图 CSS 目前是**第三套并行实现**，改造时存在把 `exchange-map-app-*` 收敛到 `.glass-surface` / `.glass-control` / `.glass-panel` 的空间，但要保留其「App 地图强制浅色」这一有意行为（`color-scheme: light` + 局部变量覆写）。

---

## 7. 平台识别机制

| 机制 | 位置 | 能力 |
| --- | --- | --- |
| 构建期 target 开关 | `app-target.ts:11` `IS_APP_TARGET = import.meta.env.VITE_IMS_APP_TARGET === "app"`；被 41 个 app 文件引用 | 只区分 App 打包 / Web，**不区分 iOS 与 Android**；Vite 内联，Web 包会丢弃 App 分支 |
| 派生常量 | `app-target.ts` 的 `VIEWPORT_CONTENT`（App 下加 `maximum-scale=1, user-scalable=no, viewport-fit=cover`）、`APP_STICKY_HEADER_OFFSET`、`APP_FLOATING_CONTROL_OFFSET` | 视口与浮动定位 |
| 文档根标记 | `root-layout.tsx:24-31` `data-app-target="app"` + `data-glass-refraction="on"`；`app-layout.tsx:58` `data-app-shell=""` | CSS 选择器入口 |
| iOS 运行时识别 | `native-glass.ts:46-56` `isIosRuntimeIdentity({maxTouchPoints, platform, userAgent})`：UA 含 `iPad/iPhone/iPod`，或 `platform === "MacIntel" && maxTouchPoints > 1`（iPadOS 桌面 UA 伪装） | **纯函数，可单独复用**；消费方 `native-glass.ts:58-68` `shouldAttemptNativeGlass()`（额外要求 `IS_APP_TARGET && isTauri()`）与 `lib/media/native-image.ts:34` |
| Tauri 判定 | `native-glass.ts:1` 从 `@tauri-apps/api/core` 引 `isTauri` | 运行时 |
| Android 专属判定 | `components/shared/theme-toggle.tsx:29-31`：`isTauri() && /\bAndroid\b/i.test(navigator.userAgent)` | 目前唯一 Android 分支 |
| Tauri 原生能力通道 | `native-glass.ts:70-86` 的 `configureNativeGlass` / `updateNativeGlass` / `destroyNativeGlass`，invoke `plugin:native-glass\|*`，权限见`src-tauri/plugins/native-glass/permissions/default.toml`（`allow-configure`、`allow-update`、`allow-destroy`） | **只覆盖底部 tab bar 的原生材质与浮层抑制，不暴露 iOS 版本号或通用原生能力** |
| iOS 版本判定 | `src-tauri/plugins/native-glass/ios/Sources/NativeGlassPlugin.swift:147,181` `guard #available(iOS 26.0, *)`，失败时 resolve `{supported: false, reason: "requires-ios-26"}` | 版本判据**只在 Swift 内部**，JS 侧只能拿到 `supported` 布尔与 `reason` 字符串（另有 `"lucide-icon-unavailable"`、`"native-glass-inactive"`），**没有版本号字段** |
| CSS 媒体查询 | `app.css:1041-1069`（`html[data-app-target="app"]`、`@media (max-width: 767px)`）；`exchange-office-map.css:75,118` | 无 iOS 专属媒体查询 |

**先例总结**：项目里区分 iOS 的做法是「`IS_APP_TARGET` + `isIosRuntimeIdentity`（UA/触摸点）」这一组合，见 `native-glass.ts`。没有 iOS 专属 CSS 类的先例。若本次要「仅 iOS 玻璃化」，最贴近现有约定的路径是新增一个 `IS_APP_TARGET && isIosRuntimeIdentity(...)` 派生的布尔/数据属性，而**不能**依赖 `data-app-target`（它同时覆盖 Android）。Tauri 侧目前没有现成的 iOS 版本通道可直接使用。

---

## 8. 测试与验收面

#### 与本次改造直接冲突的断言

| 文件 : 行 | 断言 | 冲突点 |
| --- | --- | --- |
| `apps/web/tests/e2e/community-exchange-map.spec.ts:235` | `.maplibregl-ctrl-compass` 数量为 0 | 仅在保留 NavigationControl 时才有意义 |
| 同上 `:236-237` | `.maplibregl-ctrl-zoom-in` / `-out` 可见 | **直接与「移除 +/-」冲突，必须删除或替换为手势断言** |
| `apps/web/tests/e2e/app-map.spec.ts:337` | 点击 `.maplibregl-ctrl-zoom-in` 触发 `mapBounds` 增长 | 依赖 zoom 按钮驱动 `moveend`，是 viewport 持久化用例的唯一触发器（`:336-372`） |
| `apps/web/tests/e2e/app-map.spec.ts:207-224` | 通过 `button[aria-controls="exchange-map-tools"]` 展开 `role="toolbar"`，断言其中三个入口按钮可见 | 若在工具栏加「地图数据来源」项，`getByRole` 断言仍是宽松的（未断言条目总数），但 `w-36` 面板高度会变化 |
| `apps/web/tests/e2e/app-map.spec.ts:325-340` | `role="dialog"` 名 `筛选地图`、Escape 关闭 | 新增授权 dialog 若也有 `role="dialog"`，需注意同页多 dialog 时的选择器歧义（现有写法用 accessible name 限定，风险较低） |
| `apps/web/tests/e2e/community-exchange-map.spec.ts:239-241` | 「回到我的位置」按钮可见 | 定位按钮保留即可，但其定位 class 若变动，纯 e2e 不受影响 |

#### 不冲突但会被波及的测试

| 文件 | 关注点 |
| --- | --- |
| `apps/web/tests/unit/pages/community/exchange/exchange-office-map.test.tsx` | `vi.mock("maplibre-gl")` 在 `:103-113` 显式列出了 `AttributionControl` 与 `NavigationControl` mock 类；`:76` 把 `IS_APP_TARGET` 固定为 `true`。用例覆盖 viewport 记忆（`:150`）、调色板（`:172`）、定位动画（`:205`、`:227`）、卸载后丢弃定位结果（`:274`）、样式变更使 in-flight 定位失效（`:298`）。删除控件不会破坏 mock，但 mock 出口会变成死代码 |
| `apps/web/tests/unit/pages/community/community-exchange-map-section.test.tsx` | 在 `:26` 用轻量 stub 替换 `~/pages/community/exchange/exchange-office-map`；覆盖配置加载、跨筛选丢弃过期 viewport、保留上次成功结果、地图配置失败时的目录逃生口 |
| `apps/web/tests/unit/pages/community/exchange/components/exchange-mobile-navigation.test.tsx` | 只测 App 变体：`:40` 断言 `展开地图工具` 触发钮的 `aria-expanded="false"`、类名 `exchange-map-app-control size-10 rounded-lg`、父容器 `bottom-[var(--app-floating-bottom)]` 且 `not md:hidden`、`lg:hidden`；`:113` 断言侧栏激活态与筛选角标。**新增菜单项需要在此补断言** |
| `apps/web/tests/unit/pages/community/community-exchange-app-page.test.tsx:60-88` | 断言 App 下 `main` 带 `exchange-map-app-viewport`、工具区带 `top-[calc(env(safe-area-inset-top)+0.75rem)]`、只有刷新按钮且带 `exchange-map-app-control size-10 rounded-lg`。**若把刷新按钮纳入统一的 iOS 玻璃体系并改类名，此用例需同步** |
| `apps/web/tests/unit/pages/community/community-exchange-page.test.tsx` | 未出现任何 `maplibregl` / 控件相关断言，主要覆盖筛选与名录流程 |
| `apps/web/tests/unit/e2e/unit-source-policy.test.ts:216-222` | 一份显式文件清单，包含 `community-exchange-app-page.test.tsx`、`community-exchange-map-section.test.tsx`、`exchange-mobile-navigation.test.tsx` 等；新增/改名测试文件需要同步此清单 |
| `apps/web/app/route-metadata.ts:153-161` | `/community/exchange` 的 route descriptor（`prerender: ["/community/exchange"]`），路由契约测试会读它；本次不涉及路由变更 |

#### 当前没有任何测试断言 attribution 的可见性、文案或交互

---

## 9. 对改造的边界提示（证据层结论，非方案）

1. `+/-` 是 MapLibre 内置控件，删除需要同时改 TS、两处 CSS、两处 e2e 断言，并补上「手势缩放」的替代验证；`app-map.spec.ts:337` 是最需要重新设计的用例。
2. 手势本身已就绪（`touchZoomRotate` + `dragPan` 默认开启），canvas 上的 `touch-action: none` 由 MapLibre 施加，App 的 `user-scalable=no` 不会破坏地图捏合；因此「纯手势」的主要工作量在删除控件与验收断言，而非启用交互。
3. attribution 目前是「compact + 程序化收起成 ⓘ」，不是外链也不是弹窗；文案完全来自 `exchange-style.json` 的单个 `source.attribution`。改为 dialog 时可复用 `components/ui/dialog.tsx` 或 `sheet.tsx`，两者都已带 `glass-surface glass-panel` 与原生 tab bar 抑制。
4. 折叠菜单是硬编码 JSX、只服务本页一处；App 侧栏有 `localToolsOnly` 分支可挂新项，Web 底栏 `grid-cols-5` 是固定栅格。
5. iOS 玻璃化的改造面共 17 项浮动控件，其中只有 3 项已套用 `exchange-map-app-control` / `-surface`；`app.css` 已有成熟的 `--glass-*` token 与 `.glass-surface/.glass-control/.glass-panel` 工具类，但地图 CSS 现在是第三套并行实现。
6. 「仅 iOS」在当前代码里没有现成开关：`IS_APP_TARGET` 不区分平台，唯一先例是 `native-glass.ts` 的 `isIosRuntimeIdentity` 纯函数；Tauri 侧只暴露 `supported` 布尔，没有 iOS 版本号通道。
