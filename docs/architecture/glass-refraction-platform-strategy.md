# 玻璃折射的平台策略

> 文档类型：架构
> 状态：Decision
> 权威来源：`apps/web/app/styles/glass.css`、`apps/web/app/styles/accessibility.css`、`apps/web/app/layouts/root-layout.tsx`、`apps/web/app/components/shared/glass-filter-defs.tsx`、`apps/web/app/lib/native-glass.ts`、`apps/web/src-tauri/plugins/native-glass/` 和 `apps/web/DESIGN.md`

Web 与 App DOM 共用 CSS 玻璃材质，折射滤镜只作用于装饰层；iOS 26 及以上的 App 底栏和地图
浮动控件在能力协商成功后使用 UIKit。材质 token 和组件采纳规则见
[Web 设计系统](../../apps/web/DESIGN.md)，构建、跨源和设备链路见
[Tauri 移动端基础设施](../development/tauri-mobile.md)。

## 背景

IMSWeb 需要在浏览器、Android WebView 与 iOS WKWebView 中保持可读、可操作的表面。引用式
`backdrop-filter` 的渲染效果不能仅凭普通 blur 的 CSS 支持判断，因而内容可见性不得依赖该滤镜。
不支持引用滤镜或没有稳定性能证据时，静态材质和导航仍必须完整可用。

## 平台矩阵

| 运行环境 | 材质路径 | 维护边界 |
| --- | --- | --- |
| Web 各浏览器 | CSS 静态材质、blur 与装饰层引用滤镜 | 内容始终留在父元素，按目标引擎验证渲染 |
| Android App、旧 iOS 与原生能力失败回退 | 共用 CSS 材质与 DOM 导航 | 不依赖原生插件成功，不启用指针跟随高光 |
| iOS 26+ App 底栏 | UIKit `UITabBarController` | 插件确认支持后才隐藏 Web 回退 |
| iOS 26+ App 地图浮动控件 | UIKit `UIGlassEffect` 与 `UIGlassContainerEffect` | 定位与搜索独立协商，成功后隐藏对应 DOM 孪生 |

本表描述仓库选择的实现路径，不将某次引擎探测结果作为长期兼容性保证。

## 决策

WebView 和浏览器内容采用地板加封顶的两层结构；iOS 26 及以上的 App 底栏与地图页浮动控件采用
UIKit 原生例外。

**静态材质是基础。** 边缘渐变、内阴影、高光和填色不依赖引用式滤镜。普通 blur 与 saturation
位于 `@supports` 内；密集列表、表格和虚拟滚动使用不承担 backdrop blur 的 `.glass-quiet`。

**引用滤镜作为增强。** 根布局统一设置 `data-glass-refraction="on"` 并挂载 `GlassFilterDefs`，
没有按浏览器品牌关闭的分支。`glass.css` 在普通 blur 支持条件内为装饰层设置
`url("#glass-displacement")`；这项 CSS 条件不能证明引用滤镜一定生效，实际效果由目标引擎验收。

**折射只挂在装饰层上。** 真折射施加于 `.glass-refract::before`，一个不承载任何
内容的伪元素。这把引擎层面的不确定性转化为有界损失：即使某个引擎拒绝渲染它，
代价也只是缺少装饰。父元素使用 `isolation: isolate`，装饰层不接收指针事件，不承载文字、
焦点或操作区域。不得把引用滤镜移到内容容器。

两层叠加时需要保证边缘处理不重复，避免出现双重轮廓。

**iOS 26+ App 底栏：原生 Liquid Glass。** 仓库内 Tauri 插件在 WKWebView 上方安装系统
`UITabBarController`，由 UIKit 负责原生材质、按压反馈、安全区和宽度。原生 tab 复用 React 的 Lucide
图标 ID。Web 底栏只有在插件返回 `supported: true` 后才隐藏。iOS 26 以下与 Android 保留 Web 回退，
生产 DOM 表面均不启用指针位置追踪或白色触点高光。根布局不挂载 `GlassSheenTracker`，
不得重新给生产表面加上 `glass-sheen`、`glass-control` 或 `data-glass-interactive`。
Web 回退保留静态材质、单枚透镜和常规按压缩放。

**iOS 26+ App 地图浮动控件：原生绘制。** 交换地图页的定位按钮与底部搜索卡片交给 UIKit 绘制，
玻璃折射其下方实时地图。搜索卡片包含原生输入、结果和更多工具，使用独立的能力确认与 IPC。
这条例外的边界比底栏更窄：

- 只在 `IS_APP_TARGET` 且运行时为 iOS 26 及以上的 App 生效；Android、iOS 26 以下、以及 Web
  全部保留 CSS 玻璃。
- 定位与搜索卡片走原生。地图页的详情/筛选/名录 Sheet、来源 Dialog 和地图不可用占位卡
  仍由 DOM 呈现；搜索卡片内的状态反馈由当前渲染器呈现。
- 原生控件自带图标、文案、按压反馈与可访问名称；Web 侧只推送几何、状态与菜单项，并接收点击事件。
- 原生路径启用时对应 DOM 孪生以 `display: none` 退出布局，而不是变成透明。透明会留下第二个焦点位、
  第二份按压反馈和一层压在原生气泡下的 tooltip。插件返回 `supported: false` 时不写该标记，界面上
  只有 CSS 玻璃，不出现空白占位或双份控件。

**为什么页面内控件只能原生绘制内容。** `UIGlassEffect` 采样的是原生层树中位于它下方的内容，而本页
背景是不透明的 MapLibre canvas。玻璃视图放在 WKWebView 之下会被 canvas 完全遮住，放在之上则会盖住
DOM 控件本身。这一层无法同时拿到真折射与 DOM 内容，因此只能由原生绘制控件本体，再把点击转发回
Web。这与底栏受的约束同源，也是它没有推广到全部页面 UI 的原因：每个控件都要付出一次几何同步和一套
原生可访问性。

除上述两处例外，页面内容的 CSS 玻璃仍走两层策略。

## 可访问性与性能

- `prefers-reduced-transparency` 使用不透明表面，移除 backdrop 滤镜和装饰高光。
- `forced-colors` 移除渐变、阴影、滤镜和边缘蒙版，使用系统颜色边框。
- `prefers-reduced-motion` 停止滚动凝结、透镜移动、形变、图标弹跳和按压缩放，并关闭相关
  transition 和平滑滚动。UIKit 控件单独读取系统 Reduce Motion，不能用 CSS 验证替代原生设置验证。
- backdrop blur 半径不得参与动画。调节 alpha、位置或 transform 前也应验证低端设备开销。
- 玻璃材质不设跨 GPU 的精确像素截图基线；行为、焦点、遮挡、滚动和操作可达性仍须有回归。
  截图可以作为当次人工验收证据。性能阈值必须建立在目标设备测量上，不在文档中保存一次测量快照。

## 后果

- CSS 与 UIKit 材质存在预期观感差异，验收关注各路径的可读性、反馈和操作完整性，不要求逐像素一致。
- 定位按钮的几何由 Web 侧测量后推送给原生层。搜索卡片由 Web 提供宿主边界和导航净空，
  UIKit 处理键盘与本地拖动并回传实际遮挡矩形；两类渲染器使用同一份业务状态和文案。
- 原生控件的折射无法在浏览器里验证。`pnpm run app ios` 构建通过不等于观感通过，必须跑 iOS 26 模拟器
  或真机，并覆盖有刘海与无刘海两种情况、旋转与菜单展开三类布局变化。
- CSS 与原生实现分别维护材质和可访问性，业务状态、文案和导航仍由同一应用模型提供。
- 变更引用滤镜时必须检查 Chromium、Firefox 和 WebKit 的内容可见性；不能以 CSS 源码测试
  通过替代实际渲染。Firefox 已在 Web extended tier 中，无需另建关闭开关或重复 project。

## 验证入口

- `apps/web/tests/unit/lib/glass-material.test.ts` 守护 CSS 降级和 reduced-motion 源码约束；
  `native-glass*` 单测守护能力协商、IPC 和 DOM 回退。
- 核心 Web 浏览器验证使用 `pnpm --filter @imsweb/web run test:e2e`；Firefox 和广泛布局使用
  `node scripts/testing/run-test-owner.mjs web extended`。
- App DOM 验证使用 `pnpm --filter @imsweb/web run test:e2e:app`，UIKit 材质、几何、动态字体和
  实时 Reduce Motion 使用 iOS 模拟器或真机。记录运行系统、构建来源和观察结果到 PR 或 release
  record。测试所有权与证据边界见 [测试规范](../development/testing.md)。
