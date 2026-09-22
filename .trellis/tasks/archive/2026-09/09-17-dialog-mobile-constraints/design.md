# 移动端对话框约束完善 — 技术设计

## 1. 决策

在**基元内**增加一个显式的固定布局，而不是让每个调用方继续手写：

`DialogContent` 新增 `layout?: "scroll" | "pinned"`，默认 `"scroll"`（等于今天的行为）。
`pinned` 时根节点从 `grid overflow-y-auto` 变成 `flex flex-col overflow-hidden`，
页眉与页脚 `shrink-0`，滚动交给新的 `DialogBody`（`min-h-0 flex-1 overflow-y-auto overscroll-contain`）。

已选方案 A（用户确认）：保留居中玻璃弹窗形态，把安全区尺寸、内部滚动、固定页眉页脚收进
`ui/dialog.tsx`，再删掉调用方的 `max-h` 补丁。

## 2. 为什么默认值必须是 `"scroll"`

全仓有 30 个文件在用 `DialogFooter`，其中绝大多数把内容直接丢进 `DialogContent`。
若把根节点的 `overflow-y-auto` 直接挪走，这些弹窗会从「整块滚动」变成「内容溢出被裁」——
静默的功能回归。因此新布局必须显式选用，默认路径一行代码都不改。

## 3. 基元契约

```tsx
<DialogContent layout="pinned">        // 默认 "scroll"
  <DialogHeader>…</DialogHeader>       // shrink-0，常驻
  <DialogBody>…</DialogBody>           // min-h-0 flex-1 overflow-y-auto，唯一滚动区
  <DialogFooter>…</DialogFooter>       // shrink-0，常驻
</DialogContent>
```

- 根节点仍带 `glass-surface glass-panel fixed z-50 p-4`，安全区几何（`max-h-(--overlay-safe-height)`、
  `w-(--overlay-safe-width)`、居中位移）仍在两种 layout 下都由基元写入，并且仍然写在 `className` **之后**，
  以保证 `cn` 的 tailwind-merge 让基元的值胜出（这正是 R1 的机制，也是删除调用方补丁的依据）。
- `pinned` 时 `display` 由 `flex flex-col` 覆盖基元的 `grid`（同属 display 冲突组，后者胜）。
- **滚动能力不进基元默认类**：基元不再在公共类里写 `overflow-y-auto`，而是由 `layout` 决定——
  `scroll` 分支给 `overflow-y-auto overscroll-contain`，`pinned` 分支给 `overflow-hidden`。
  这样可以不依赖 tailwind-merge 对 `overflow` 与 `overflow-y` 的冲突判定（那属于实现细节，
  一旦不生效就会静默变成「两个 overflow 同时存在」），而默认路径的渲染结果与今天完全一致。
- 关闭按钮保持 `absolute top-2 right-2`，无需搬家：`pinned` 下根节点不再滚动，所以它天然固定在面板右上角（R3）；
  `scroll` 下维持今天的行为。
- `DialogBody` 需要 `min-h-0`，否则 flex 子项的 `min-height: auto` 会让内容撑破面板、绕过 `max-h`。
- 内容区滚动使用 `overscroll-contain`，避免滚动链把页面带走（R4）。
- 根节点的 `p-4` 与 `DialogBody` 的滚动盒关系：内容在 padding 盒内滚动即可，不做负边距通栏
  （`DialogFooter` 现有 `-mx-4 -mb-4` 在 pinned 下同样成立，视觉不变）。

## 4. 迁移范围

1. 删除 11 处调用方 `max-h-[...]` 补丁（`namecard-claim-dialog.tsx:145`、`namecard-upload-dialog.tsx`、
   `admin-config-dialog.tsx:52`、`producer-map/index.tsx:210`、`information-editor-dialog.tsx:90`、
   `homepage-link-form.tsx:64`、`producer-map-editor-dialogs.tsx:225,398`、
   `wiki-entity-editor-sheet.tsx:337,339`、`story-editor-dialog.tsx:376`、
   `story-source-catalog-dialog.tsx:132`、`admin/events/editor-page.tsx:1118`）。
   这些是死代码，删除不改变渲染结果；但要让后来者不再以为尺寸由调用方决定。
2. 名片认领与名片上传两个对话框改用 `layout="pinned"` + `DialogBody` 包住表单主体，
   `DialogFooter` 留在 `DialogBody` 之外、`<form>` 之内（提交按钮仍在表单里，`type="submit"` 不变）。
3. admin 那批手写 `grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden` 保持原样，列入后续统一项。

## 5. 被否决的方案

- **B 全屏 sheet**：`safeArea="viewport"` 一把梭。改动更大，且与本仓已有的原生 tab bar suppression /
  安全区变量交互更多；用户明确选了 A。
- **C 维持现状，只补调用方**：30 个调用方各写一遍 grid 行定义与滚动区，必然漂移；
  而且真正的问题是「底栏长得像固定底栏却不是」，属于基元的表达错误。
- **把 `overflow-y-auto` 从根节点直接拿掉**：会静默回归 30 个既有弹窗（见第 2 节）。

## 6. 验证策略

- 单测（jsdom，不能测布局）：断言两种 layout 渲染出的类名、`data-layout`、以及传入 `max-h-[90svh]`
  时基元的安全区高度仍然在最后（R1/R2 回归护栏）。
- 浏览器测试（唯一能证明几何的手段）：在既有 `namecard-claim-workflow.spec.ts` 的 fixture 基础上
  新增 `@mobile` 用例，显式 `test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })`
  （320×568 再跑一遍），断言视觉视口包含、无需滚动可见、footer/关闭按钮滚动前后位置不变、
  页面自身 `scrollTop` 为 0、可见控件不小于 44×44。
- 软键盘的 `dvh` 收缩没有可靠的自动化手段，只能真机观察；若不是本机可验证的场景，按 PRD 的要求记为未验证。

## 7. 回滚

`layout` 默认值等于现状，所以回滚 = 两个对话框去掉 `layout="pinned"` 与 `DialogBody` 包装；
基元的新增分支不参与默认路径，删除 `max-h` 补丁与回滚互不影响。
