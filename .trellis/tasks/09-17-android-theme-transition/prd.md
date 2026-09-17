# 修复 Android 主题切换动画

## Goal

修复 Android 端在明暗主题之间切换时出现异常的过渡动画，使切换过程稳定、符合产品预期，并保留既有主题偏好行为。

## Confirmed facts

- Android 客户端由 `apps/web` 的 Tauri 移动端壳承载。
- `apps/web/app/components/shared/theme-toggle.tsx` 是主题切换入口。它通过 `next-themes` 更改 `html.dark`，并负责动画选择、快速重复切换的清理和减少动态效果分支。
- 支持 View Transition API 和根伪元素动画的 Android Tauri WebView 已使用 500ms 的 `data-theme-transition="circle"` 圆形扩散；缺少该能力时才降级为 300ms `fade`。
- `apps/web/app/styles/accessibility.css` 中的淡入淡出分支会对 `html` 及其所有后代的颜色、阴影和变形统一过渡；这不是设计规范定义的主题切换效果。
- `apps/web/DESIGN.md` 规定：用户主动切换主题时，使用从切换按钮中心向视口最远角展开的 500ms 圆形扩散；仅不支持 View Transition 的运行时降级为 300ms 全局颜色过渡。减少动态效果时立即切换。
- 现有 `apps/web/tests/unit/components/shared/theme-toggle.test.tsx` 固定了 Android Tauri WebView 总是走淡入淡出的旧行为；该测试需随修复更新。
- View Transition 是渐进增强：API 函数存在不等于 `::view-transition-new(root)` 伪元素可用。伪元素选择器不受支持或 `startViewTransition()` 同步失败时，主题更新仍必须走淡入淡出路径。
- Android 原生窗口的状态栏和导航栏图标外观目前只由启动时的系统 DayNight 状态决定，未接收 WebView 运行时主题变更；该同步需要通过已存在的 Tauri 移动插件完成。
- 本任务只处理 Android 主题切换动画，不扩大为全局视觉重设计。

## Requirements

- 找出 Android 端主题切换动画异常的责任层，并以最小范围修复。
- Android Tauri WebView 在具备 View Transition API 时与其他受支持运行时一样使用 500ms 按钮中心圆形扩散，不再因平台身份被强制降级。
- 当 Android WebView 缺少所需 API、无法识别圆形过渡伪元素选择器，或无法启动 View Transition 时，保留现有 300ms 全局颜色过渡作为能力降级。
- 系统启用减少动态效果时，Android 和其他平台均立即切换主题，不创建过渡动画。
- 保留主题图标的现有轻量变化、快速连续切换时的取消与清理行为。
- Android 上的主题切换过程必须连贯：系统栏与 WebView 的颜色更新不能与圆形扩散或淡入淡出动画相互叠加，造成明显跳变或卡顿。
- Android 系统导航栏图标必须在主题切换后使用与当前导航栏背景具有足够对比度的亮色或暗色外观，不能保留上一个主题的图标颜色。
- 不改变已保存主题偏好、系统主题跟随规则或非 Android 平台的既有主题行为，除非修复必需且经确认。

## Acceptance Criteria

- [ ] Android 设备或模拟器上的明暗主题切换不再出现当前异常动画。
- [ ] 具备 View Transition API 的 Android Tauri WebView 使用 `circle` 过渡、500ms 时长和按钮中心作为扩散原点。
- [ ] 不具备该 API 的 Android WebView 仍使用 `fade` 降级，且不会调用 View Transition 或 Web Animations API。
- [ ] 伪元素选择器不受支持或 `startViewTransition()` 同步失败时，Android WebView 使用 `fade` 降级，且主题偏好仍正确生效。
- [ ] 减少动态效果启用时，主题立即切换且不设置 `data-theme-transition`。
- [ ] Android 上手动切换主题时，WebView 过渡、原生系统栏颜色和系统栏图标外观保持同步，不发生明显的二次闪烁或卡顿。
- [ ] Android 系统导航栏图标在浅色导航栏上使用深色外观，在深色导航栏上使用浅色外观，并在主题切换后立即生效。
- [ ] 主题切换后的颜色、页面状态和用户主题偏好正确生效。
- [ ] 相关 Web 单元测试、静态检查和可执行的 Android 验证均通过，或明确记录无法在本机执行的前置条件。

## Out of scope

- 全局配色重设计、主题选项扩展或 iOS/桌面端视觉改版。
- 与主题切换无关的 Tauri Android 构建、签名或发布流程改动。

## Open question

- 无。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
