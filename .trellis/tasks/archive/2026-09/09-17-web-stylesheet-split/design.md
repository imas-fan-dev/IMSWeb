# 拆分 app.css 为 styles 分层样式表 — 技术设计

## 1. 决策摘要

`app.css` 从"一个大文件 + 十九处未分层规则"改成"一个入口 + 五个按关注点分层的文件 + 一个具名 override 层"。

三层模型是这次改动的核心，其它内容都服从它：

| 层 | 放什么 | 谁能盖过它 |
| --- | --- | --- |
| `@layer base` | 令牌声明（`:root` / `.dark` / `[data-glass-accent]` / `--app-*`）与元素默认值（`*`、`body`、`html`、`::selection`、`img[data-image-state]`） | components、utilities、overrides |
| `@layer components` | 材质体系（`.glass-*`、`.media-hover`、`.edge-fade-x`）与 `.series-icon-*` 这类组件类 | utilities、overrides |
| `@layer overrides` | 必须无视层与文件顺序取胜的规则：可访问性能力覆盖、属性驱动的隐藏、reduced-motion 的 `scroll-behavior`、wiki 与管理后台按钮的定位消解 | 只剩内联样式与 `!important` |

新增层的顺序声明是这次唯一需要动打包行为的点。Tailwind 的 `@import "tailwindcss"` 内部声明
`theme, base, components, utilities`，所以只要在它之后再声明一次 `overrides`，该层就排在 `utilities` 之后：

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";

/* overrides 排在 Tailwind 四个层之后：它是"必须赢"的规则的家。 */
@layer overrides;

@import "./styles/theme.css";
@import "./styles/glass.css";
@import "./styles/accessibility.css";
@import "./styles/media.css";
@import "./styles/app-shell.css";
```

`@layer` 语句允许出现在 `@import` 之间（CSS 级联规范显式豁免），因此这个写法合法。
若 Vite/Lightning CSS 处理链路把它重排或丢弃，退路是把 `@layer overrides;` 移到五条本地导入之后：
层的优先级由名字首次出现的顺序决定，`overrides` 仍是第五个，语义不变。这条退路在 T0 里先验证。

## 2. 为什么选具名 override 层，而不是继续用未分层

未分层作者规则的优先级高于所有层，这是今天那 19 处规则实际取胜的机制。它的代价是事后不可读：
`.series-icon-motif { position: absolute; top: 0 }` 之所以能压过元素上的 `absolute` 工具类，
只是因为作者忘了分层，而不是因为有人决定它应该赢。

用 `@layer overrides` 表达同一件事之后，"这条规则为什么赢"变成了文件里的一个词。
同时它比 `!important` 更可控：`overrides` 之间仍按源顺序比较，而 `!important` 会把后续所有正常声明一起挡掉。

分层归位需要逐条判断"这条规则是否真的需要压过工具类"，答案决定它进 `components` 还是 `overrides`。
判断依据是元素上是否存在同属性的工具类，见下一节。

## 3. 未分层规则的归位决定

| 现状位置 | 内容 | 归入 | 依据 |
| --- | --- | --- | --- |
| `:root` 82-188、`.dark` 216-270 | 颜色、圆角、动效时长、安全区、`--app-*` 之外的令牌 | `base` | 令牌是默认值，工具类应当能覆盖。同名令牌的竞争者只有 Tailwind `@layer theme` 里的默认值（如 `--radius-xs`），`base` 已在 `theme` 之后。 |
| `[data-glass-accent]` 191-213、`.dark` 的 `--glass-*` 257-270 | 玻璃令牌与序列色调 | `base` | 同上；且 `.dark` 与 `:root` 同层同特异性，靠同层内源顺序取胜，二者必须留在同一文件内相邻。 |
| `.series-icon-background` 991、`.series-icon-motif` 1001 | 组件类的定位与外观 | `components` | 元素只带这两个类、不带工具类（`series-icon-background.tsx:229,244`）。归 `components` 让未来加 `hidden`、`w-12` 等工具类能正常生效。 |
| `html[data-app-target="app"], [data-app-shell]` 1032-1055 | `--app-*` 令牌与 immersive 覆盖 | `base` | 同为令牌；两块的先后顺序保持，后者要覆盖前者。 |
| `html[data-app-target="app"] { touch-action: pan-x pan-y }` 1057-1068 | App 视口手势策略 | `base` | html 上没有同属性工具类，无需 override。 |
| `html[data-native-glass="controls"] …{ display: none }` 1070-1072 | 原生玻璃双胞胎隐藏 | `overrides` | 语义就是"无论如何都不显示"。twin 元素目前带 `absolute` / `w-36` / `visible` 但无 display 工具类（`exchange-mobile-navigation.tsx:245-265`），未来一旦加上 `flex` 之类，只有 override 层能继续保证隐藏。 |
| `html { scroll-behavior: auto }` 854 | reduced-motion 下关闭平滑滚动 | `overrides` | 原先靠"未分层 > base"取胜；放进 override 层后不再依赖 `scroll-behavior: smooth` 与它的文件顺序。 |
| 799-842 的 reduced-transparency、forced-colors | 玻璃的能力降级 | `overrides` | 见第 4 节的行为变更。 |
| 844-918 的 reduced-motion 玻璃覆盖 | 取消过渡与动画 | `overrides` | 同上。 |
| 958-983 view transition | 主题切换动画 | `base` | 目标是 `::view-transition-*` 伪元素，Tailwind 无法为其生成工具类，无竞争。三处 `!important` 原样保留。 |
| 1016-1031 series-icon / img 的能力覆盖 | reduced-motion 与 forced-colors | `overrides` | `will-change: auto` 必须盖过 `media.css` 里 `components` 层的 `will-change: transform`；跨文件时只有 override 层能保证顺序，这也是把可访问性覆盖统一上收的原因。 |
| 1074-1084 wiki 定位覆盖 | 与管理后台返回按钮消解重叠 | `overrides` | 必须盖过同一元素上的 `bottom-[calc(1rem+env(safe-area-inset-bottom))]` 工具类（`wiki-mobile-search.tsx:60`）。 |

## 4. 行为变更（三处，均已列进 prd）

1. R5 `rounded-xs` 由 2px 变 4px。消费者是 `ui/tooltip.tsx:61` 的箭头与
   `admin/producer-map/components/region-map-manager.tsx` 的三个图例色块。需人工过一眼。
2. R4 删除 `--safe-viewport-width`。无消费者，删除不影响任何计算；`--overlay-safe-width` 有自己的实现。
3. 可访问性覆盖上移到 `overrides` 后开始压过工具类。此前它们在 `@layer components`，
   会被元素上的 `transition-*`、`bg-*`、`animate-*` 工具类盖掉。变化方向就是降级承诺本身：
   reduced-motion 用户不再被 `transition-colors` 之类重新引入动画，reduced-transparency 用户不再被
   `bg-*` 工具类重新画上透明背景。`motion-reduce:transition-none` 这类组件级工具类与它同向，不会冲突。

## 5. 顺带清理项

- R4 / R5 见上。
- R6 `wiki-agency-dial.css:99` 的 `560ms cubic-bezier(0.22, 1, 0.36, 1)` 换成
  `var(--duration-reveal) var(--ease-interactive)`，`!important` 保持不变以免改变覆盖关系。
  该行下方的 `220ms ease-in`（回落动画）与 `--duration-ui`(240ms) 不同值，不属令牌别名，保持原样。
- R7 在 `glass.css` 的触点高光小节前加注释：驱动方 `glass-sheen-tracker.tsx` 当前未挂载，
  DESIGN.md 保留其为停用实现；同时注明 `.glass-sheen:hover::after` 的静态高光不依赖 JS，仍然生效。
- R8 wiki 覆盖提成 `--wiki-search-lift: 4.25rem` 与 `--wiki-search-lift: 4.75rem` 两个具名局部变量，
  注释写明数值来自 `admin-return-shortcut.tsx` 的 `h-11` 与 `bottom-1rem` / `sm:bottom-1.5rem` 推导。
  不改变取值，不解决页面耦合。
- `--duration-hero` 保留，在令牌块注明它是 DESIGN.md 的首页入场时长上界、当前无实现消费者。
- 圆角令牌块加注释说明 lg 到 4xl 刻意塌缩到 `var(--radius)`，代价是这几个工具类名同义。

## 6. 文件与行区间映射

行号基线为拆分前的 `app.css`（见 `research/app-css-audit.md` 第 1 节）。拆分按行区间机械搬运，
不顺手重排规则顺序，唯一例外是第 3 节列出的跨文件搬家项。

| 目标文件 | 来源行区间 |
| --- | --- |
| `styles/theme.css` | 6、8-79、81-272（`:root`、`[data-glass-accent]` 六块、`.dark` 三个整体搬入，不切开）、920-928、941-956 |
| `styles/glass.css` | 273-635、637-763、779-797 |
| `styles/accessibility.css` | 799-918、958-983、1016-1031 |
| `styles/media.css` | 929-940、985-1014 |
| `styles/app-shell.css` | 1032-1068、1070-1072、1074-1084 |

`theme.css` 收纳全部令牌声明（含玻璃令牌与序列色调属性选择器），`glass.css` 只放材质规则。
这样 `:root` 与 `.dark` 各自保持一个完整块，不因为令牌服务于哪个子系统而被切成两半。

实现时把原 941-943 的 `img[data-image-state="error"]` 一并放进 `media.css`，与 loading 规则相邻，
使它和 `series-icon` 一起构成“图片与装饰媒体”这一件事；`theme.css` 因此只保留 920-928 与 944-956。
这样 `media.css` 的头部注释与实际内容一致，代价是偏离了上面那行的行区间切法。

每个文件头部写一段注释说明它的关注点与它使用的层，落笔位置与 `classic-wiki.css` 的头部注释风格一致。

## 7. 测试同步

三个既有单测都按路径读 `app/app.css` 并对文本做切片断言。新增
`tests/unit/support/stylesheet-source.ts` 作为唯一读取入口：

```ts
export function readAppStylesheet(): string          // app.css + 五个文件按导入顺序拼接
export function readStyleSheetFile(name: string): string  // 单文件，用于定位断言
```

拼接顺序按 `app.css` 的导入声明解析，而不是写死数组，这样下次再拆文件时测试自动跟上。
三个测试只改读取方式，断言原文与覆盖面不变：

- `glass-material.test.ts` 的 `ruleBody` / `keyframesBody` 改从拼接结果取，`.glass-surface` 与三个 keyframes 仍在其中。
- `series-colors.test.ts` 的 `--franchise-*` 仍能从拼接结果取到。
- `exchange-map-styles.test.ts` 的 `appStylesheet` 换成拼接结果，`blockBody` 逻辑不变。

新增 `tests/unit/lib/stylesheet-layers.test.ts` 固化不变量：

1. `app.css` 恰好导入四个 Tailwind 包与五个本地文件，本地导入顺序为 theme → glass → accessibility → media → app-shell。
2. `app.css` 与 `app/styles/*.css` 中不存在位于任何 `@layer` 之外的样式规则。实现方式：去注释后按花括号深度遍历，
   记录当前的 at-rule 栈；命中 `{` 时若前一串不是 at-rule，则要求栈内存在 `@layer`。
3. 顶层允许的非级联 at-rule 白名单为 `@import`、`@layer`、`@custom-variant`、`@theme`、`@property`、`@keyframes`、`@font-face`；
   其余顶层 at-rule（`@media`、`@supports`、`@container`）内部同样必须命中第 2 条。
4. `@layer overrides;` 的声明位置晚于四条 Tailwind `@import`。

第 2 条的解析器用正则 + 深度计数即可，参考 `exchange-map-styles.test.ts` 已有的 `blockBody` 写法，
不引入 PostCSS 依赖。

## 8. 验证策略

除了常规 lint / typecheck / unit / build / `test:web-routing`，这次加一道"搬移无损"核对，
因为纯文本 diff 在千行搬移下不可读：

1. 拆分前在 `build/client/assets/` 找到含 `@layer components{` 的那个产物，用脚本把每个样式规则抽成
   `选择器 | 声明块` 的排序列表，存到 `/tmp`。
2. 拆分后重复同一步骤。
3. 比对两个集合：预期只出现 R5（`rounded-xs` 相关）与 R6（`wiki-agency-dial` 不在该产物内，应在页面产物比对）两处差异。
   任何其它差异都说明搬移丢规则或改了声明。

这一步是这次改动的主要护栏，比逐行读 diff 可靠。脚本一次性使用，不进仓库。
`@layer` 归属变化不会体现在声明集合里，因此第 3 节那张表需要人工核对一遍：
逐条确认归入 `components` 的元素身上确实没有同属性工具类。审计已给出结论，实现时复核。

## 9. 风险与回滚

| 风险 | 概率 | 应对 |
| --- | --- | --- |
| Vite/Tailwind 未把本地 `@import` 就地内联，导致层与源顺序错位 | 中 | T0 先只做入口改造（`app.css` 引一个空 `theme.css`）并构建，确认产物里出现 `@layer overrides{` 且位于 `utilities` 之后，再搬正文 |
| 某条规则从 components 挪到 overrides 后压过了本该生效的工具类 | 低 | 只对第 3 节表格中列为 `overrides` 的条目使用该层；产物规则集比对 + 相关页面截图复核 |
| 三个既有单测因读取路径失效而静默变绿 | 中 | 辅助函数解析 `app.css` 的导入列表，测试断言的内容必须仍来自真实文件；改造后先制造一次断言失败确认测试仍在校验 |
| 拆分过程中漏搬一行导致静默样式缺失 | 中 | 第 8 节的集合比对；行区间映射表逐段打勾 |
| 构建产物哈希与体积变化触发路由契约测试失败 | 低 | `pnpm run test:web-routing` 在 build 之后执行，按它的报错调整 |

回滚方式：整个改动是样式表文件级搬移，`git revert` 单个提交即可；不涉及数据、配置或契约，
也没有需要清理的中间状态。

## 10. 范围外

见 prd 的 Out of Scope。特别提示两点会在此次改动后更容易做，但不在本次：
`.glass-tab { touch-action: none }` 的作用域收敛，以及把 wiki 定位覆盖搬到 wiki 页面样式。
