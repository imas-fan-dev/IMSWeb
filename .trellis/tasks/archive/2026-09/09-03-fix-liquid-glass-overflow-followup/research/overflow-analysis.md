# Liquid Glass 横向溢出分析

## 结论

前置修复只处理纵向边界。进一步浏览器测量发现，根因不仅是 ring 和动画拉伸，还包括镜片对导航布局的错误假设：六个链接按文案自然宽度布局，但镜片固定使用容器内容宽度的六分之一。

1024px 和 1600px 视口下，中文链接宽度约为 52、80、52、50.5、52、52px，固定镜片宽度则为 56.4px。`/events` 选中时，镜片中心比“社区动态”链接中心偏左约 7.4px。

外层导航段的 `.glass-sheen::after` 是独立 pointer sheen。产品最初决定保留这一层，随后根据实际交互质量改为暂不启用整套 Web 交互高光；最终实现同时移除生产 tracker 挂载和 SiteHeader 的 sheen 标记。

## 被否决的单独 inset 方案

在固定 56.4px 镜片内增加单侧 12% inset 后，skin 静止宽度只有 42.9px，而“社区动态”文案宽 56px。该方案虽然能通过镜片框内的 ring 边界测试，却让选中材质明显短于文字，因此不能作为最终修复。

## 修正方案

`.glass-lens` 应使用当前活动链接的真实 `offsetLeft` 和 `offsetWidth`。链接布局、点击区域和导航总宽保持不变。inner skin 仍使用单侧 12% inset。

设真实活动链接宽度为 `W`。inner skin 静止宽度为 `0.76W`。最大拉伸时，计入两侧 1px ring 的近似绘制宽度为：

```text
painted width = 1.22 * (0.76W + 2px)
```

当 `W >= 34px` 时，绘制宽度不超过真实槽位。当前最窄链接约 50.5px，因此有余量；“社区动态”链接为 80px，静止 skin 为 60.8px，也能承托 56px 文案。

## 实现边界

- 修改 `apps/web/app/components/shared/site-header.tsx`，测量当前活动链接并驱动桌面 lens 的宽度和 translate。
- 扩展 `apps/web/tests/e2e/home.smoke.spec.ts` 的现有镜片回归，测量真实链接槽、文字和动画状态。
- 不修改 `apps/web/app/app.css` 的共享关键帧。
- 不修改链接尺寸、导航总宽、移动端 Sheet、App Web 标签栏或 iOS 原生标签栏。
- 从根布局移除 `GlassSheenTracker` 挂载，并从 SiteHeader 移除 `.glass-sheen` 与 `data-glass-interactive`；静态玻璃、折射和 travelling lens 保持启用。

## 验证重点

- 六个路由中，lens 与活动链接的 x、宽度和中心一致。
- skin 与 ring 在静止和四个最长移动关键状态中都位于 lens 框内。
- 选中材质绘制宽度不小于活动文案宽度。
- 首次加载、客户端路由、字体就绪和容器尺寸变化后没有旧几何残留。
- Chromium 与 Firefox 聚焦回归通过，并检查两种视口和两种主题截图。
- 移动指针后没有生产高光标记、pointer CSS 变量或页面横向溢出。
