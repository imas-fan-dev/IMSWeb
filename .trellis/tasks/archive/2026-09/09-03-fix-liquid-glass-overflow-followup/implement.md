# Implementation plan

- [x] 在 `SiteHeader` 中增加桌面导航段和六个链接 refs，以及活动镜片几何状态。
- [x] 用 `useLayoutEffect` 完成首次测量、路由切换、ResizeObserver 和字体就绪后的几何同步。
- [x] 让外层 `.glass-lens` 使用活动链接的真实宽度和 translate，几何就绪后再显示。
- [x] 保留 inner skin 的 12% 横向 inset、现有纵向 inset、ring 和共享动画。
- [x] 从 `RootAppLayout` 移除 `GlassSheenTracker` 挂载，并从 SiteHeader 移除 `.glass-sheen` 与 `data-glass-interactive`。
- [x] 更新 Playwright 回归，断言六个 lens 框与活动链接匹配，选中材质承托文字，并覆盖四个最长移动关键状态。
- [x] 验证页面不再安装或触发 pointer sheen，同时静态玻璃和 travelling lens 仍然可见。
- [x] 运行相关 SiteHeader 单元测试，确认无 ResizeObserver 的测试环境不报错。
- [x] 在现有开发服务器上运行 Chromium 和 Firefox 聚焦测试。
- [x] 在 1024x768、1600x900 的亮色和暗色状态测量并截图，确认文案、ring 和页面 overflow。
- [x] 运行 changed-file Prettier、Web lint、Web typecheck、LSP diagnostics 和 `git diff --check`。
- [x] 审查最终 diff，只保留 `root-layout.tsx`、`site-header.tsx`、`home.smoke.spec.ts`、设计文档及任务材料的预期修改。
