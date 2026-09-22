# 拆分 app.css 为 styles 分层样式表 — 执行计划

## 结构

单任务串行。五个目标文件互不重叠，但都依赖同一次入口改造与同一套不变量，拆成并发轨道只会增加合并成本。
顺序：入口验证 → 逐文件搬移 → 清理项 → 测试 → 文档 → 全量验证。

行号均以 `research/app-css-audit.md` 的基线（1085 行版本）为准。搬移按行区间机械执行，
不顺手重排规则、不重写注释文字；跨文件与跨层的调整只由 T5、T8 两节列出。

## T0 入口与本地 `@import` 内联验证（阻塞项）

- [x] T0.1 新建 `app/styles/` 与一个只含头部注释的 `theme.css` 占位。
- [x] T0.2 `app.css` 顶部改为四条 Tailwind `@import` + `@layer overrides;` 声明 + 五条本地 `@import`（顺序 theme → glass → accessibility → media → app-shell），其余内容暂不动。
- [x] T0.3 `pnpm --filter @imsweb/web build`，在 `build/client/assets/` 中确认：`@layer overrides{` 存在，且在文本位置上晚于 `@layer utilities{`；五个本地文件的内容确实被就地内联（用 `theme.css` 里的一行注释做标记检索）。
- [x] T0.4 **不适用**：T0.3 一次通过，`@layer overrides;` 声明在四条 Tailwind `@import` 之后被保留，退路未启用。

验证：`pnpm --filter @imsweb/web build`，随后 `grep -n "@layer overrides\|@layer utilities" build/client/assets/*.css`。
这一步只改入口，搬移前必须绿。

## T1 `styles/theme.css`

- [x] T1.1 搬入 6（`@custom-variant dark`）、8-79（两个 `@theme`）、81-272（`:root`、`[data-glass-accent]` 六块、`.dark`），并把这四段包进 `@layer base { }`，`[data-glass-accent]` 与 `.dark` 的先后顺序保持原样。
- [x] T1.2 搬入 920-928（`*`、`body`）与 941-956（`img[…="error"]`、`button`/`[role=button]`、`html`、`::selection`）到同一个 `@layer base` 块，保持原有顺序。
- [x] T1.3 文件头写关注点注释：本文件拥有全部令牌声明；`@theme` / `@custom-variant` 留在顶层是因为它们不参与级联。
- [x] T1.4 圆角令牌块加注释：lg 到 4xl 刻意塌缩到 `var(--radius)`，这几个工具类名同义；`--radius-xs` 见 T5。
- [x] T1.5 `--duration-hero` 处加注释：DESIGN.md 的首页入场时长上界，当前无实现消费者。

验证：`pnpm --filter @imsweb/web build` 通过；产物中 `--background`、`--glass-rgb`、`--franchise-765` 仍可取到（`grep -o -- "--franchise-765:[^;}]*" build/client/assets/*.css`）。

## T2 `styles/glass.css`

- [x] T2.1 搬入 273-635 的 `@layer components` 整体，保持层声明形式与内部顺序不变。
- [x] T2.2 搬入 637-763（五个 keyframes + `@property --glass-scroll-progress` + `@supports (animation-timeline: scroll())` + `@keyframes glass-scroll-settle`），保持 `@supports` 内嵌 `@layer components` 的写法。
- [x] T2.3 搬入 779-797 的两个 `@supports` 块。注意 `animation: … ; animation-range: …; animation-timeline: …` 的书写顺序不能改。
- [x] T2.4 文件头写关注点注释：材质体系与三条能力分档；`@property` / `@keyframes` 留在顶层是不参与级联的例外。
- [x] T2.5 触点高光小节（原 443-530、597-620）前加注释：驱动方 `glass-sheen-tracker.tsx` 当前未挂载，DESIGN.md 保留为停用实现；`.glass-sheen:hover::after` 的静态高光不依赖 JS，仍然生效。

验证：`pnpm --filter @imsweb/web exec vitest run tests/unit/lib/glass-material.test.ts`（此时读取路径尚未更新，用例会先失败，T7 修好后必须转绿）。

## T3 `styles/media.css`

- [x] T3.1 搬入 929-940 的 `img[data-image-state="loading"]` 与 `img[data-image-state="error"]`，包进 `@layer base`。
- [x] T3.2 搬入 985-1014 的 `@keyframes image-loading-shimmer`（顶层）与 `.series-icon-background` / `.series-icon-motif`（包进 `@layer components`）。两条 `.series-icon-*` 从"未分层"改为 `components`。
- [x] T3.3 文件头写关注点注释。

验证：`pnpm --filter @imsweb/web build` 通过，产物中 `.series-icon-motif` 仍存在。

## T4 `styles/accessibility.css`

- [x] T4.1 搬入 799-819（reduced-transparency）与 821-842（forced-colors），层由 `components` 改为 `overrides`。
- [x] T4.2 搬入 844-918：854 的 `html { scroll-behavior: auto }` 从"未分层"改为 `@layer overrides`；858-918 的玻璃覆盖从 `components` 改为 `overrides`；注释原文保留。
- [x] T4.3 搬入 958-983 的 view transition 块，包进 `@layer base`，三处 `!important` 原样保留。
- [x] T4.4 搬入 1016-1031 的 `img[data-image-state="loading"] { animation: none }`、`.series-icon-motif { will-change: auto }`、`.series-icon-background { display: none }`，层改为 `overrides`。
- [x] T4.5 文件头写关注点注释：本文件集中全部能力与可访问性覆盖，一律位于 `overrides`，因为它必须无视文件顺序取胜。

验证：`pnpm --filter @imsweb/web build`；产物中 `@media (prefers-reduced-motion:reduce)` 块内的 `scroll-behavior:auto` 仍存在。

## T5 `styles/app-shell.css`

- [x] T5.1 搬入 1032-1068 的 `--app-*` 令牌与 immersive 覆盖，包进 `@layer base`，两块顺序保持不变。
- [x] T5.2 搬入 1057-1068 的 `html[data-app-target="app"] { touch-action: pan-x pan-y }`，包进 `@layer base`，注释原文保留。
- [x] T5.3 搬入 1070-1072 的原生玻璃双胞胎隐藏，包进 `@layer overrides`，并补一句为什么必须在 override 层（语义是"无论如何都不显示"）。
- [x] T5.4 搬入 1074-1084 的两条 wiki 定位覆盖，包进 `@layer overrides`；4.25rem / 4.75rem 提成 `--wiki-search-lift`，注释写明数值来自 `admin-return-shortcut.tsx` 的 `h-11` 与 `bottom-1rem` / `sm:bottom-1.5rem` 推导。取值不变。
- [x] T5.5 文件头写关注点注释。

验证：`pnpm --filter @imsweb/web build`；产物中 `--app-header-height`、`touch-action:pan-x pan-y`、双胞胎 `display:none` 仍存在。

## T6 清理项

- [x] T6.1 删除 `--safe-viewport-width` 定义（保留 `--safe-viewport-height`）。删除前再跑一次 `grep -rn -- "--safe-viewport-width" apps/ packages/`，确认只有定义处一处。
- [x] T6.2 在 `@theme inline` 的圆角块补 `--radius-xs: calc(var(--radius) * 0.5);`（=4px）。
- [x] T6.3 `app/pages/wiki/modern/components/wiki-agency-dial.css:99` 的 `560ms cubic-bezier(0.22, 1, 0.36, 1)` 改为 `var(--duration-reveal) var(--ease-interactive)`；`!important` 与 `both` 保留；下一行的 `220ms ease-in` 不动。
- [x] T6.4 `app/app.css` 只保留入口内容，确认全文无样式规则。

验证：`pnpm --filter @imsweb/web build`；`grep -c -- "--safe-viewport-width" apps/web/app/styles/*.css` 为 0；产物中 `.rounded-xs{border-radius:calc(var(--radius) * .5)}`。

## T7 测试

- [x] T7.1 新建 `tests/unit/support/stylesheet-source.ts`：导出 `readAppStylesheet()`（解析 `app.css` 的本地导入列表并按序拼接，不写死文件名数组）与 `readStyleSheetFile(name)`。
- [x] T7.2 `tests/unit/lib/glass-material.test.ts` 改用拼接结果；断言原文不变。改完后故意改坏一处断言确认仍在校验，再改回。
- [x] T7.3 `tests/unit/lib/series-colors.test.ts` 与 `tests/unit/pages/community/exchange/exchange-map-styles.test.ts` 同样改用辅助函数，`blockBody` 逻辑不动。
- [x] T7.4 新建 `tests/unit/lib/stylesheet-layers.test.ts`，固话设计第 7 节的四条不变量（导入顺序、无未分层样式规则、顶层 at-rule 白名单、`@layer overrides;` 位置）。

验证：`pnpm --filter @imsweb/web exec vitest run tests/unit/lib/ tests/unit/pages/community/exchange/`，
以及全量 `pnpm --filter @imsweb/web test:unit`。

## T8 文档与注释同步

- [x] T8.1 `.trellis/spec/web/frontend/` 下 `index.md`、`components-and-ux.md`、`testing.md`、`tauri-mobile-integration.md` 中指向 `app/app.css` 的表述改为"入口 `app/app.css` + `app/styles/` 分层文件"，并写清新位置对应什么内容。
- [x] T8.2 `apps/web/AGENTS.md` 的 Style & Components 一节同步同一表述。
- [x] T8.3 `docs/development/liquid-glass-app-shell-plan.md` 与 `docs/architecture/glass-refraction-platform-strategy.md` 中的路径引用同步；这两份是历史设计与策略文档，只更新路径，不重写结论。
- [x] T8.4 `app/lib/app-target.ts:21` 与 `app/pages/tier-list/tier-list-model.ts:48` 的注释改为指向新的具体文件。

验证：`grep -rn "app/app\.css" .trellis/spec apps/web/AGENTS.md docs/` 只剩历史引用（如有）且都有说明；
`pnpm run check:rules` 通过。

## T9 全量验证

- [x] T9.1 规则集无损核对：拆分前 `git stash` 或从基线提交构建一次，把产物中每个样式规则抽成 `选择器 | 声明` 集合存到 `/tmp`；拆分后再抽一次并比对。预期差异只有 `rounded-xs`。
- [x] T9.2 逐条复核设计第 3 节归位表：确认每个归入 `components` 的元素身上没有同属性工具类（`.series-icon-*` 两个元素只带组件类）。
- [x] T9.3 改为限定范围的格式化：只对本次触及的文件跑 `prettier --check`，其中三个不干净的文件用 `--write` 修好。没有跑全仓 `pnpm --filter @imsweb/web format`，以免把无关文件卷进 diff。改完 `git diff` 复核，只有搬移与清理。
- [x] T9.4 `pnpm --filter @imsweb/web check` 通过（`eslint --max-warnings=0`、`react-router typegen && tsc`、210 个测试文件 1418 个用例、两次构建），EXIT=0。
- [x] T9.5 `pnpm run test:web-routing` 10/10 通过；`pnpm run check:rules` 通过（854 个源文件、25 份文档）。
- [ ] T9.6 **未做**：需要浏览器或真机，我没有据此下结论。两个 `rounded-xs` 消费点都是 `size-2.5`（10px）小元素——工具提示箭头（旋转 45°）与地图图例色块——2px 到 4px 在 10px 上占比可观，见下面“待确认”。Wiki 搜索按钮与后台返回按钮的数值未变，静态可判定无位移。
- [x] T9.7 `pnpm --filter @imsweb/web design:lint`，确认 DESIGN.md 与实现未失同步。

## 完成判据

`app.css` 无样式规则、五个文件全部位于三层之内、不变量测试与三个既有 CSS 测试通过、
`pnpm --filter @imsweb/web check` 与 `pnpm run test:web-routing` 通过、规则集比对只剩预期差异、
引用路径的 spec 与文档已同步。以上均已满足。

## 实测证据

规则集比对（脚本在 `/tmp/cssdiff/compare.js`，未入库）：对比 HEAD 的 `app.css` 与拆分后的
`app.css` + 五个 styles 文件，规则 81 对 81，新增 0、丢失 0；七个 `@keyframes` 与一个 `@property` 完全一致；
声明体变化 3 处（`:root` 去 `--safe-viewport-width`、两条 wiki 定位换 `--wiki-search-lift`），
层级归属变化 36 处，逐条对上了设计第 3 节的归位表。

构建产物 `build/client/assets/root-BJkS5bx4.css` 中各层名首次出现位置：
`properties` 66、`theme` 2443、`base` 5006、`components` 16262、`utilities` 22704、`overrides` 211797。
`overrides` 排在末位，因此确实胜过包括 `utilities` 在内的全部 Tailwind 层。
产物探针：`.rounded-xs{border-radius:calc(var(--radius) * .5)}` 存在；`--wiki-search-lift` 存在；
`data-native-glass=controls` 与 `touch-action:pan-x pan-y` 存在；`safe-viewport-width` 计数为 0。

测试非空转验证：三次故意破坏（改 `glass.css` 的 `.glass-surface` 选择器、往 `theme.css` 追加未分层规则、
从入口删除 `@layer overrides;`）各导致一个用例失败，随后按原字节恢复。

## 待确认

`rounded-xs` 由框架默认 2px 提高到 `calc(var(--radius) * 0.5)`（4px）是本次唯一的视觉差异，
两个消费点都是 10px 见方的小元素，4px 在 10px 上的占比比 2px 明显。保持 4px 有 DESIGN.md 的 4px 下限作依据；
若观感上更希望色块与箭头保持硬边，把 `theme.css` 里那一行改回不声明 `--radius-xs` 即可回到 2px。
