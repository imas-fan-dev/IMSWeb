# 移动端对话框约束完善（名片认领等）

## Goal

移动端（窄视口 + 安全区 + 软键盘）下，所有基于 `app/components/ui/dialog.tsx` 的居中弹窗都必须完整落在安全视口内、主操作无需滚动即可见、只有内容区滚动、触控目标不小于 44px。约束收敛进基元，调用方不再各自打补丁。

## 背景（已核对代码，不是猜测）

- `app/lib/utils.ts` 的 `cn` 是 `twMerge(clsx(...))`，而 `dialog.tsx` 的 `safeArea="inset"` 分支在 `className` **之后**又重复了一次 `top-1/2 left-1/2 max-h-(--overlay-safe-height) w-(--overlay-safe-width) -translate-1/2`。所以 11 处调用方自己写的 `max-h-[calc(100dvh-2rem)]`、`max-h-[calc(100svh-2rem)]`、`max-h-[90svh]` **已经被 tailwind-merge 丢掉**：它们既没有生效，也不提供任何防护，只是误导后来者以为自己改过尺寸。
- 当前 `inset` 布局下**整块面板**在滚动（根节点带 `overflow-y-auto`）。`DialogFooter` 虽然长成一条通栏底栏（`-mx-4 -mb-4 rounded-b-xl border-t bg-muted/40`），却会随内容滚出视口；`DialogContent` 自带的关闭按钮是 `absolute top-2 right-2`，同样会滚走。
- 名片认领对话框（`app/components/community/namecard-claim-dialog.tsx:145`）把页眉、整张表单（含一个 `h-44` 的内嵌列表）和 `DialogFooter` 放在同一个 `<form>` 里，375×667 机型上「提交认领审核」落在折叠线之下，用户必须先滚过整个表单才能提交。

## Requirements

- R1 **尺寸所有权归基元**：`safeArea="inset"` 下的最大高度/宽度始终由 `--overlay-safe-*` 决定，调用方传入的 `max-h` / `w` 不得生效；删除上述 11 处 `max-h` 补丁。
- R2 **固定页眉页脚 + 独立内容滚动**：`DialogContent` 支持 `layout="pinned"`（默认 `"scroll"`，即今天的行为）；pinned 下 `DialogHeader` 与 `DialogFooter` 常驻可见，滚动只发生在 `DialogBody` 内。默认值不得改变既有 30 处 `DialogFooter` 调用方的行为。
- R3 **关闭按钮始终可见**：pinned 下不再随内容滚走。
- R4 **移动端可达性**：375×667 与 320×568（含安全区）下弹窗完整落在视觉视口内，主操作按钮无需滚动即可见；内容溢出时只有内容区滚动，页面本身不滚动（无滚动链穿透）。
- R5 **软键盘**：聚焦输入框后（`dvh` 收缩）弹窗仍在视口内，聚焦元素保持可见。
- R6 **触控目标**不小于 44×44 CSS px。
- R7 **桌面不回归**：≥640px 时既有 `sm:max-w-*` 尺寸与外观不变。

## 范围外

- 不改 admin 那批已经手写 `grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden` 固定页脚的对话框（当前可用，列为后续统一项）。
- 不引入全屏 sheet 形态（`safeArea="viewport"` 仍是「全屏内容」而非移动端默认）。
- 不动 `alert-dialog.tsx`、`sheet.tsx` 与其他 overlay 基元。
- 不改任何弹窗的业务内容、字段与提交逻辑。

## Acceptance Criteria

- [x] pinned 布局契约：pinned 时根节点是 flex 列且 `overflow-hidden`，`DialogBody` 是唯一滚动容器；单测断言渲染出的类名与 `data-layout`。证据：`tests/unit/components/ui/dialog.test.tsx`（`tests/unit/components/ui/` + `components/community/` 共 5 文件 / 15 用例通过）。
- [x] 调用方 `max-h` 无法覆盖安全区高度：把 `max-h-[90svh]` 传进 `DialogContent` 后，渲染结果里基元的安全区高度仍是生效值。证据：同上单测。
- [x] 删除 11 处 `max-h` 补丁（10 个文件）后 lint / typecheck / 单测通过（209 文件 / 1360 用例）；生产构建与 `run check` 随 T5.1 一起跑。
- [x] 移动端尺寸/滚动（375×667 与 320×568）：打开名片认领对话框，「提交认领审核」的 boundingBox 完整位于 `window.visualViewport` 内且未发生滚动；滚动到底后 `DialogFooter` 与关闭按钮的 boundingBox 不变；`document.scrollingElement.scrollTop` 保持 0。证据：`namecard-claim-workflow.spec.ts` 新增两条 `@mobile` 用例，`CI=1 --workers=1 --retries=0` 下 8 通过（chromium-desktop + chromium-mobile）。
- [x] 触控目标：该弹窗内关闭按钮与每个候选行不小于 44×44。证据：同 T4 用例（关闭按钮同时改为 `max-sm:size-11`，候选行 `min-h-11`）。
- [ ] 名片上传对话框已迁移到 pinned 布局（`layout="pinned"` + flex 表单链 + `DialogBody`），其既有 spec 在回归矩阵里跑；**未单独写** pinned 几何断言 —— 记为未覆盖，不以共享基元为由当作已验证。
- [x] 桌面不回归：现有 Web E2E 在 `chromium-desktop` 与 `firefox-desktop` 下全绿。证据：`CI=1 ... playwright test --workers=1 --retries=0` → 113 通过 / 11 跳过 / 0 失败。
- [x] 未验证项必须显式记录：真机 iOS 软键盘下的 `dvh` 收缩只能靠设备观察（本机无法自动化），记为未验证，不以单测通过冒充。

## Notes

- 验收里凡「设备观感」类条目都要写成未验证或给出具体证据，不允许用「构建成功」替代。
- 本任务只碰 Web 前端；不涉及 API、contracts 与 Tauri 原生代码。
