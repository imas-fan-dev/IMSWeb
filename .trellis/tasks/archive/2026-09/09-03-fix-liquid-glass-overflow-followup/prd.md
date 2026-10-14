# 修复 Liquid Glass 选中态溢出

## Goal

消除桌面六项主导航中选中态 Liquid Glass 材质错位和侵入相邻槽位的问题，同时保留导航行为、文案承托和移动反馈。

## Background

- 新截图对应 `apps/web/app/components/shared/site-header.tsx:109` 的桌面六项主导航。
- 前置提交 `cb5f8d72` 只处理纵向间距；现有 Playwright 回归也只测量上下边界。
- 六个链接不是等宽槽。1024px 和 1600px 视口下的中文链接宽度约为 52、80、52、50.5、52、52px，而现有 `.glass-lens` 固定按容器内容宽度的六分之一取 56.4px。
- `/events` 的镜片中心因此比“社区动态”链接中心偏左约 7.4px。镜片的 1px 外扩 ring 和最大 `scaleX(1.22)` 会继续扩大视觉侵入。
- 已验证单纯给 56.4px 等宽镜片增加 12% inset 会把 skin 缩到 42.9px，小于 56px 文案，不能满足视觉承托要求。
- 外层六项容器的 `.glass-sheen::after` 是独立 pointer sheen。产品最新决定暂不启用整套 Web 交互高光，因此本任务同时停止生产环境 tracker 并移除 SiteHeader 的 sheen 标记。

## Requirements

- R1：`.glass-lens` 必须跟随当前活动链接的真实位置和宽度，不能继续假设六个链接等宽。
- R2：选中 skin 及其 ring 在静止和最大 22% 横向拉伸时均须位于当前 `.glass-lens` 框内，不得依靠裁切掩盖溢出。
- R3：收紧后的选中材质必须继续承托活动文案，不能出现胶囊明显短于文字的状态。
- R4：保留六个链接的尺寸、点击区域、路由语义、键盘焦点、导航总宽和共享 squash-and-stretch 动画。
- R5：停止生产环境挂载 `GlassSheenTracker`，并移除 SiteHeader 的 `.glass-sheen` 与 `data-glass-interactive` 标记；保留静态玻璃、折射、travelling lens、移动端 Sheet、App Web 标签栏、iOS 原生标签栏和共享 CSS 关键帧。
- R6：新增可观察的真实槽位、横向几何和文案承托回归，不能只测量纵向 bounding box。

## Acceptance Criteria

- [x] AC1（R1）：六个路由分别选中时，`.glass-lens` 的左右位置和宽度与对应活动链接相差不超过 1 CSS px。
- [x] AC2（R2）：最长五槽切换的 0%、28%、64% 和 100% 关键状态中，skin 和按实际缩放计入的 ring 均不越过移动中的 `.glass-lens` 框。
- [x] AC3（R3）：亮色和暗色模式下，选中材质的绘制宽度不小于活动文案宽度，并保持水平居中。
- [x] AC4（R4）：六个链接保持现有尺寸、点击、活动路由和键盘焦点行为；页面与头部没有新增横向滚动。
- [x] AC5（R5）：页面不再挂载全局交互高光 tracker，SiteHeader 不再渲染 pointer sheen；移动端 Sheet、App 标签栏和共享 `.glass-lens` 关键帧没有行为变化。
- [x] AC6（R6）：Chromium 和 Firefox 回归覆盖六个真实链接槽、ring 外扩及最长移动关键帧，并在 1024x768 与 1600x900 完成亮色和暗色截图核对。
- [x] AC7：Web 格式化、lint、类型检查、相关单元测试及聚焦 Playwright 测试通过。

## Out of Scope

- 重设计导航文案、路由、链接宽度、导航总宽或外层胶囊布局。
- 修改移动端站点菜单、Tauri App 标签栏或 iOS 原生标签栏。
- 全局修改共享 Liquid Glass 动画曲线。
- 删除暂时停用的 tracker、CSS 和单元测试实现；当前仅移除生产挂载与使用标记，保留实现供后续重新评估。

## Key Decisions

- 使用活动链接 DOM 的 `offsetLeft` 和 `offsetWidth` 作为 `.glass-lens` 的真实槽位几何，不改链接本身。
- 通过链接 refs、`useLayoutEffect` 和 `ResizeObserver` 在首次布局、路由切换、字体完成加载及容器尺寸变化后更新镜片几何。
- 镜片几何就绪前保持选中材质隐藏，避免 SSR 或首次水合时短暂显示在错误槽位。
- `.glass-lens` 继续负责位移，内部 skin 保留 12% 单侧 inset；真实活动链接中最窄槽仍能容纳最大拉伸，最长“社区动态”槽能承托 56px 文案。
- 不修改共享关键帧，也不使用 `overflow-hidden` 或 `overflow-clip`。
- 从 `RootAppLayout` 移除 `GlassSheenTracker`，并从 SiteHeader 移除 `.glass-sheen` 与 `data-glass-interactive`。停用高光不能影响静态玻璃和镜片动画。

## Risks and Verification Notes

- `getBoundingClientRect()` 不包含 ring 绘制外扩，测试必须按当前 transform 分别计算横向和纵向 ring outset。
- `ResizeObserver` 不可用时仍执行首次同步测量，但不安装持续观察；单元测试环境不得因此抛错。
- 路由切换时 inner skin 通过现有 key 重挂载并重播动画，外层镜片的 `translate` 仍由现有 transition 驱动。
- 需要检查页面直接加载、客户端路由切换、窗口缩放和字体就绪后的几何，防止旧尺寸残留。
