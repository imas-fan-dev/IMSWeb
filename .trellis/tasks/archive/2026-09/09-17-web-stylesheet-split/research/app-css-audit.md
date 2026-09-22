# app.css 现状审计（拆分前基线）

基线：`apps/web/app/app.css`，1085 行 / 32169 字节，工作区干净，HEAD 含 `2601712a`。
本文只记录已核实的事实与行号，供拆分时做机械映射；不含设计结论。

## 1. 顶层构造与行区间

| 行区间 | 构造 | 当前分层 |
| --- | --- | --- |
| 1-4 | `@import "tailwindcss"` / `tw-animate-css` / `shadcn/tailwind.css` / `@fontsource-variable/geist` | 无 |
| 6 | `@custom-variant dark (&:is(.dark *))` | 无（指令，不参与级联） |
| 8-72 | `@theme inline`（font / color / radius 命名空间） | 无（Tailwind 指令） |
| 74-79 | `@theme`（`--ease-emphasized` / `interactive` / `ui` / `card`） | 无（Tailwind 指令） |
| 81-189 | `:root`，其中 82-162 为非玻璃令牌，163-167 注释，168-188 为 `--glass-*` | 未分层 |
| 191-213 | `[data-glass-accent]` 六个块（765 / cg / ml / sidem / sc / gk） | 未分层 |
| 215-272 | `.dark`，其中 216-255 为非玻璃令牌，257 注释，258-270 为 `--glass-*` | 未分层 |
| 273-635 | `@layer components` 材质体系（`.glass-surface` 起，`.glass-tab[aria-current]` 止） | components |
| 637-737 | `@keyframes`：lens-travel 637、tab-settle 657、touch-glow 672、touch-exit 695、control-release 708 | 无（不参与级联） |
| 740-744 | `@property --glass-scroll-progress`（`initial-value: 1`） | 无（不参与级联） |
| 746-754 | `@supports (animation-timeline: scroll())` → 内含 `@layer components` | components |
| 756-763 | `@keyframes glass-scroll-settle` | 无（不参与级联） |
| 779-786 | `@supports (backdrop-filter…)` → `[data-glass-refraction="on"] .glass-refract::before` | components |
| 788-797 | `@supports (backdrop-filter…)` → `.glass-surface` 的 blur+saturate | components |
| 799-819 | `@media (prefers-reduced-transparency: reduce)` → `@layer components` | components |
| 821-842 | `@media (forced-colors: active)` → `@layer components` | components |
| 844-918 | `@media (prefers-reduced-motion: reduce)`；854 的 `html { scroll-behavior: auto }` 未分层，858-918 为 `@layer components` | 混合 |
| 920-956 | `@layer base`（`*` 921、`body` 925、`img[data-image-state="loading"]` 929、`img[…="error"]` 941、`button`/`[role=button]` 944、`html` 948、`::selection` 953） | base |
| 958-983 | `@media (prefers-reduced-motion: no-preference)` view transition（含 977/980/981 三处 `!important`） | 未分层 |
| 985-989 | `@keyframes image-loading-shimmer` | 无（不参与级联） |
| 991-1014 | `.series-icon-background`（991）、`.series-icon-motif`（1001） | 未分层 |
| 1016-1024 | `@media (prefers-reduced-motion: reduce)`：`img[data-image-state="loading"]` 1017、`.series-icon-motif { will-change: auto }` 1021 | 未分层 |
| 1026-1031 | `@media (forced-colors: active)`：`.series-icon-background { display: none }` 1027 | 未分层 |
| 1032-1055 | app shell 令牌：`html[data-app-target="app"], [data-app-shell]` 1032-1033（`--app-*`）、immersive 覆盖 1045-1046 | 未分层 |
| 1057-1068 | `html[data-app-target="app"] { touch-action: pan-x pan-y }` | 未分层 |
| 1070-1072 | `html[data-native-glass="controls"]` 下的 control 与 twin 隐藏 | 未分层 |
| 1074-1084 | 两条 `body:has([data-admin-return-shortcut]) [data-wiki-mobile-search="modern"]` 定位覆盖（767px 以下与 640-767px） | 未分层 |

未分层的**样式规则**（不含 `@property` / `@keyframes` / Tailwind 指令）共 19 处：
`:root`、`.dark`、`[data-glass-accent]`×6、`html { scroll-behavior }`、view-transition 四条选择器、
`.series-icon-*`×2、两个 `@media` 内的 3 条、app shell 令牌×2、`touch-action`、native glass 隐藏、wiki 覆盖×2。

## 2. Tailwind 分层已生效的证据

`apps/web/build/client/assets/root-BvgnC6dA.css` 内存在 `@layer theme{`、`@layer base{`、
`@layer components{`（6 次，来自 app.css）、`@layer utilities{`、`@layer properties{`。
即工具类位于 `@layer utilities`，未分层的作者规则优先级高于它。

这条特性目前被刻意依赖：`body:has([data-admin-return-shortcut]) [data-wiki-mobile-search="modern"] { bottom: … }`
必须压过同一元素上的 `bottom-[calc(1rem+env(safe-area-inset-bottom))]` 工具类
（`app/components/wiki/wiki-mobile-search.tsx:60`）。

## 3. `@theme inline` 的取值与塌缩（构建产物实测）

- `--radius: .5rem` 来自 app.css 的 `:root`；`--radius-md: calc(var(--radius) * .8)`；`--radius-xs: .125rem` 来自 Tailwind 默认 theme。
- `.rounded-sm{border-radius:calc(var(--radius) * .6)}`、`.rounded-md{border-radius:calc(var(--radius) * .8)}`、
  `.rounded-lg/.rounded-xl/.rounded-4xl{border-radius:var(--radius)}`、`.rounded-xs{border-radius:var(--radius-xs)}`。
- 全仓无 `var(--color-*)` 引用，`inline` 不产生悬空引用。

## 4. 令牌消费者统计（`apps/web/app` + `apps/web/tests`）

| 令牌 | app.css 内出现 | app/tests 其他引用 | 结论 |
| --- | --- | --- | --- |
| `--safe-viewport-height` | 1（定义） | 6 | 在用 |
| `--safe-viewport-width` | 1（定义） | 0 | 无消费者 |
| `--duration-reveal`（560ms） | 1（定义） | 0 | 无消费者；`wiki-agency-dial.css:99` 硬编码同值 `560ms cubic-bezier(0.22, 1, 0.36, 1)` |
| `--duration-hero`（720ms） | 1（定义） | 0 | 无消费者；DESIGN.md 只把它写成"控制在 720ms 内"的上界 |
| `--radius-xs` | 0 | 0 | 未定义，`rounded-xs` 落到框架默认 2px；DESIGN.md 写小控件 4px 至 6.4px |
| `--font-heading` | 1（定义） | TSX 有 7 处 `font-heading`，无 `--font-heading` 引用 | 由 Tailwind 生成工具类，在用 |

## 5. 按路径读取 app.css 的测试（拆分后必须同步）

| 文件 | 读取方式 | 断言对象 |
| --- | --- | --- |
| `tests/unit/lib/glass-material.test.ts:7` | `readFileSync("app/app.css")` | `ruleBody()` / `keyframesBody()` 字符串切片，覆盖 `.glass-surface`、keyframes、不可动画属性清单 |
| `tests/unit/lib/series-colors.test.ts:25` | 同上 | `--franchise-*` 六色与 DESIGN.md 一致 |
| `tests/unit/pages/community/exchange/exchange-map-styles.test.ts:14` | 同上 | `blockBody()` 切片，地图侧读取 `--glass-blur` / `--glass-saturate` 而非私有副本 |

`tests/unit/support/` 是既有共享测试辅助目录（`api-client.ts`、`auth-cookies.ts`、`dom-events.ts`、`harness.tsx`）。
`tests/unit/lib/api/bundle-client.test.ts:199` 里的 `/assets/app.css` 只是 baseURL 直通用例的字符串，不是产物契约。

## 6. 引用 app.css 路径的文档与注释

- spec：`.trellis/spec/web/frontend/` 下 `index.md`、`components-and-ux.md`、`testing.md`、`tauri-mobile-integration.md`。
- docs：`docs/development/liquid-glass-app-shell-plan.md`、`docs/architecture/glass-refraction-platform-strategy.md`。
- `apps/web/AGENTS.md` Style & Components 一节。
- 代码注释：`app/lib/app-target.ts:21`、`app/pages/tier-list/tier-list-model.ts:48`。

## 7. 本地 `@import` 的既有先例

- `app/pages/wiki/classic/components/wiki/classic-wiki.css:1-2`：注释"Keep the base and overrides in one entry so production preserves the cascade." + `@import "../styles/classic-base.css";`
- `app/pages/wiki/classic/components/story/classic-story.css:2`：`@import "../styles/classic-base.css" layer(classic-story-base);`
- `scripts/check-classic-wiki-css-build.mjs` 在 postbuild 校验"恰好一个产物含 `.wiki-classic-shell`"，是该仓库守卫 CSS 打包成型的既有手法。

## 8. 未挂载的驱动代码

`app/components/shared/glass-sheen-tracker.tsx:119` 导出 `GlassSheenTracker`，全仓（`app/`、`scripts/`）无 import。
它写入 `data-glass-pressed` / `-releasing` / `-exiting` 与 `--glass-pointer-x|y`，即 app.css 中
443-530 与 597-620 的触点高光、形变、释放动画的驱动方。DESIGN.md 明确写这套交互"当前停用，不属于生产交互"，
并说明"现有 tracker 与 CSS 规则只作为停用实现保留"。其中 `@media (hover: hover) and (pointer: fine)` 下的
`.glass-sheen:hover::after { opacity: 0.6 }`（492-499）不依赖 JS，仍然生效。

## 9. 相关但本次不处理

- `.glass-tab { touch-action: none }`（581）同时作用于网站头部导航（`site-header.tsx:49` 的 `desktopLinkClass`）
  与 App tab bar。在浏览器里从导航条目起手的手势不能滚动。
- 1074-1084 两条 wiki 定位覆盖把页面耦合与魔法数字（4.25rem / 4.75rem）编码进全局样式表，
  并手动复刻 Tailwind 的 640px 断点。
