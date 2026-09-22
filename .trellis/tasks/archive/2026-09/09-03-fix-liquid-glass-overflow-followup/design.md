# Technical design

## Boundary

桌面头部 `SiteHeader` 拥有链接布局和 travelling lens，因此真实槽位测量也留在该组件内。测试扩展留在现有 `home.smoke.spec.ts` 镜片回归。`RootAppLayout` 停止挂载交互高光 tracker，SiteHeader 移除 sheen 使用标记。共享 `app.css`、AppTabBar、移动端 Sheet 和原生层不变。

## Geometry flow

1. 桌面导航段保存一个容器 ref，六个 `NavigationNavLink` 保存对应 anchor ref。
2. `useLayoutEffect` 在活动路由变化后读取活动链接的 `offsetLeft` 和 `offsetWidth`。
3. 有效几何写入组件状态，并作为 `.glass-lens` 的像素宽度和独立 `translate` 值。
4. `.glass-lens` 沿用现有 `translate` transition；keyed `.glass-lens-skin` 沿用共享 `glass-lens-travel` 动画。
5. inner skin 使用单侧 12% inset。由于外框现在等于真实活动链接宽度，最窄约 50.5px 的槽在 1.22 倍拉伸及 ring 外扩后仍能容纳 skin；80px 的“社区动态”槽在静止时也能包住 56px 文案。

## Resize and font handling

首次 effect 总会同步测量。浏览器支持 `ResizeObserver` 时观察导航段和当前活动链接；`document.fonts.ready` 完成后再校准一次。清理函数断开 observer，并阻止已经结束的异步字体回调写入状态。

若 `ResizeObserver` 不存在，只保留首次测量。这让 jsdom 单元测试不会因为缺少浏览器 API 而失败。

## Interactive highlight state

Web 交互高光暂不启用。`RootAppLayout` 不挂载 `GlassSheenTracker`，SiteHeader 不使用 `.glass-sheen` 或 `data-glass-interactive`，因此页面没有 pointer sheen，也不会安装全局指针监听。静态 `.glass-surface`、`.glass-refract` 和 travelling lens 保持启用。tracker 与 CSS 实现暂时保留，后续重新评估时必须重新经过设计和浏览器验证。

## Visibility and unsupported routes

几何尚未有效或当前 URL 不属于六项导航时，不设置 `data-visible`。这样 SSR、首次水合和未归属路由都不会显示错误位置的镜片。

## Testing contract

- 直接加载六个路由，等待镜片几何稳定后比较 lens 与活动链接的 x、宽度和中心。
- 比较 skin 加 ring 的绘制宽度与文案 Range 宽度。
- 首项点击末项后，按名称选择 `glass-lens-travel` 和 `translate` transition，在 0%、28%、64%、100% 同步暂停并采样。
- ring outset 乘以从 transform matrix 取得的 `scaleX` 和 `scaleY`。
- 真实浏览器在 1024x768、1600x900 的亮色和暗色状态保存临时截图，并检查页面横向 overflow。
- 检查根布局没有 tracker 挂载，SiteHeader 没有 sheen 标记，浏览器移动指针后也不出现相关 CSS 变量或状态属性。

## Rollback

回滚涉及 `site-header.tsx` 的测量逻辑、refs 和 lens style，`root-layout.tsx` 的 tracker 挂载，以及 `home.smoke.spec.ts` 的新增断言。没有数据迁移、公共接口或共享样式回滚步骤。
