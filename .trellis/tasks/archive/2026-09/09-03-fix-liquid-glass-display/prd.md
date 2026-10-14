# 修复 Liquid Glass 导航显示

## Goal

修复桌面站点头部导航中选中态 Liquid Glass 胶囊过高、过度贴近外层边界的问题，同时保留现有玻璃材质和移动动画。

## Background

- 截图对应 `apps/web/app/components/shared/site-header.tsx:109` 的六项桌面主导航，仅在 `lg` 及以上断点显示。
- 外层胶囊由 36px 高的链接和上下各 4px 的内边距组成，总高 44px；选中镜片当前同样高 36px，静止时每侧只剩 4px。
- `apps/web/app/components/shared/site-header.tsx:133` 的 1px 外扩 ring，以及 `apps/web/app/app.css:646` 在移动动画中的纵向拉伸，会进一步缩小可见间距。
- 移动端使用 Sheet 导航；Tauri App 使用独立的五项标签栏或 iOS 原生标签栏，不经过这段六项导航代码。

## Requirements

- R1：桌面主导航的选中镜片在静止时必须完整位于外层胶囊内，并与外层边界保持清晰、均衡的上下间距。
- R2：选中项跨多个导航槽移动时，镜片的纵向拉伸不得碰触或越过外层胶囊边界。
- R3：保留六个导航链接当前的尺寸、点击区域、路由语义、材质、横向槽位和移动行为。
- R4：修复限定在桌面站点头部，不改变移动端 Sheet、App Web 标签栏、iOS 原生标签栏或共享 Liquid Glass 动画参数。

## Acceptance Criteria

- [x] AC1（R1）：在 `lg` 及以上视口，任一选中项的镜片静止后均完整位于外层胶囊内，上下可见间距各不少于 5 CSS px。
- [x] AC2（R2）：从首项切换到末项等长距离移动过程中，镜片和 ring 始终不与外层边界相交，也不发生裁切。
- [x] AC3（R3）：六个导航链接仍可见、可点击，活动路由匹配和键盘焦点行为保持不变。
- [x] AC4（R4）：移动端仍显示原有 Sheet 导航，App 标签栏相关组件和共享动画样式没有行为变化。
- [x] AC5：Web 格式化、lint、类型检查及相关单元或 Playwright 测试通过，并在桌面视口完成截图核对。

## Out of Scope

- 重设计 Liquid Glass 的颜色、透明度、模糊、ring 或动画曲线。
- 修改移动端站点菜单、Tauri App Web 标签栏或 iOS 系统标签栏。
- 调整导航文案、路由或页面布局。

## Key Decisions

- 在拥有该行为的桌面头部组件内收紧选中镜片的纵向尺寸，不通过裁切外层容器掩盖问题。
- 保持链接命中区域和共享 `.glass-lens` 动画不变，避免把局部视觉修复扩散到 App 标签栏。

## Risks and Verification Notes

- 选中镜片会在长距离切换时发生纵向缩放，验证不能只检查静止帧。
- 截图使用约 2 倍设备像素比；验收按 CSS px 和元素边界计算，并辅以实际截图。

## Verification

- Chromium 桌面实测外层胶囊为 44px、镜片为 32px；扣除 1px ring 后，上下可见间距均为 5px。
- 新增的桌面镜片 Playwright 回归在 Chromium 和 Firefox 项目通过，并覆盖最长 5 槽移动的四个关键动画状态。
- 桌面导航目录和移动端导航目录相关用例通过；移动端 Sheet 另经真实浏览器确认仍提供 `/events` 链接，当前文案为“社区动态”。
- `prettier`、Web lint、Web typecheck 和 `pnpm run check:rules` 均通过。
- 扩大运行整份 `home.smoke.spec.ts` 时，现有开发服务在全并行负载下出现大量超时。单 worker 复跑中，既有移动菜单用例仍因查找旧文案“活动”而失败；本任务未修改该菜单或文案，未扩大范围处理。
