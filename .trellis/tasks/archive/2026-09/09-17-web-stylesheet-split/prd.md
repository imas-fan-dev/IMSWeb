# 拆分 app.css 为 styles 分层样式表

## Goal

把 `apps/web/app/app.css`（1085 行）按关注点拆到 `apps/web/app/styles/` 下的五个文件，
并在同一次改动里清掉全部未分层的全局样式规则与几处无消费者令牌，使"某个规则为什么会赢"
可以从文件结构直接读出，而不是靠级联副作用推断。渲染结果除下方列出的三处有意变更外保持不变。

## Requirements

- R1 拆分为 `app/styles/theme.css`、`glass.css`、`accessibility.css`、`media.css`、`app-shell.css`，
  `app/app.css` 只保留四个 Tailwind `@import` 与五条本地 `@import`，并显式声明本地导入顺序即级联顺序。
- R2 层级模型明确为三层：`@layer base` 放令牌与元素默认值，`@layer components` 放材质与组件类，
  新增 `@layer overrides` 放"必须压过工具类与文件顺序"的规则。**不再存在任何未分层的样式规则**，
  即 `app/app.css` 与 `app/styles/*.css` 中的每条样式规则都位于某个 `@layer` 内。
- R3 `@property`、`@keyframes`、`@custom-variant`、`@theme` 允许留在顶层，因为它们不参与级联；
  此例外必须写进 `theme.css` / `glass.css` 的头部注释，并在不变量测试中显式列出白名单。
- R4 删除无消费者令牌 `--safe-viewport-width`（保留在用的 `--safe-viewport-height`）。
- R5 补齐 `--radius-xs: calc(var(--radius) * 0.5)`，使 `rounded-xs` 从框架默认 2px 变为 4px，
  对齐 DESIGN.md"较小控件可使用 4px 至 6.4px"；同时在圆角令牌块加注释说明 lg 到 4xl 是刻意塌缩到同一个值。
- R6 把 `app/pages/wiki/modern/components/wiki-agency-dial.css:99` 的
  `560ms cubic-bezier(0.22, 1, 0.36, 1)` 改为 `var(--duration-reveal) var(--ease-interactive)`，
  让 `--duration-reveal` 有真实消费者，并消除 DESIGN.md 禁止的临时 cubic-bezier。
- R7 为停用的触点高光与形变实现（`.glass-sheen` / `.glass-control[data-glass-pressed]` 一组及三个 keyframes）
  补一段注释，说明其驱动方 `GlassSheenTracker` 当前未挂载、DESIGN.md 将其保留为停用实现。
- R8 1074-1084 两条 wiki 定位覆盖仍属全局样式表，但必须归入 `@layer overrides`，
  并把 4.25rem / 4.75rem 提成具名局部变量、注明其来自管理后台按钮的 `h-11` 与 `bottom-1rem` / `sm:bottom-1.5rem`。
- R9 三个按路径读取 `app/app.css` 的单测改为通过共享辅助读取新文件，断言语义与覆盖范围不减少。
- R10 同步引用 app.css 路径的 spec、docs、`apps/web/AGENTS.md` 与两处代码注释。

## Acceptance Criteria

- [ ] `app/app.css` 只含 4 条 Tailwind `@import`、`@layer overrides` 声明与 5 条本地 `@import`，无样式规则。
- [ ] `app/styles/` 五个文件存在，且 `app.css` 与它们的全部样式规则都在 `@layer base` / `components` / `overrides` 内。
- [ ] 新增不变量单测通过：`app.css` 的本地导入顺序固定、无未分层样式规则、`@layer overrides` 声明晚于 Tailwind 四个层。
- [ ] 三个既有 CSS 断言单测在改造后仍然通过，且断言的规则确实来自拆分后的真实文件。
- [ ] 构建产物中 `@layer overrides` 的位置晚于 `@layer utilities`；`pnpm --filter @imsweb/web build` 与
      `pnpm run test:web-routing` 通过。
- [ ] 拆分前后构建产物的样式规则集合（选择器 + 声明）一致，差异仅为 R5、R6 两处有意变更，且都出现在 diff 中。
- [ ] `pnpm --filter @imsweb/web check`（lint / typecheck / unit / build）通过。
- [ ] 引用 app.css 路径的 spec、docs、AGENTS.md 与代码注释已指向新位置；DESIGN.md 未因改动失同步。

## Out of Scope

- 把 1074-1084 的 wiki 定位覆盖搬到 wiki 页面样式或改成由布局层写令牌（只做归层与命名，不搬家）。
- `.glass-tab { touch-action: none }` 的作用域收敛（当前同时影响网站头部导航的滚动手势）。
- 删除停用的触点高光实现或 `glass-sheen-tracker.tsx`（DESIGN.md 明确保留）。
- 重构 `@theme inline` 里 lg 到 4xl 的塌缩策略，只补注释不改变取值。
- 把不变量规则推广到 `app/pages/**/*.css` 等页面级样式表（本任务只覆盖 `app.css` 与 `app/styles/*.css`）。
- 视觉重设计或任何非上述三处的观感变更。

## Confirmed Decisions

- 用户确认采用五个文件的拆分布局（theme / glass / accessibility / media / app-shell），不再合并成更少的文件。
- 用户确认本次同时修掉未分层规则与多余规则，不拆成"纯搬移"和"修复"两个任务。
- 保留 `--duration-hero`（720ms）：DESIGN.md 把它写成首页入场时长上界，属规范值；在令牌块注明它当前无消费者。
- 三处有意行为变更：R5 的 `rounded-xs` 由 2px 变 4px；R4 删除无消费者令牌；`@layer overrides` 内的
  可访问性覆盖将开始压过工具类（此前位于 `@layer components`，会被 `transition-*` 等工具类盖掉）。
