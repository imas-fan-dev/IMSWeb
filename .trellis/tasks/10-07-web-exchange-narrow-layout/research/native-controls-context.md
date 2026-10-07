# 原生浮动控件上下文索引

## Authority and use

权威规范为 [tauri-mobile-integration.md](../../../spec/web/frontend/tauri-mobile-integration.md)，本页摘记其 `iOS Liquid Glass floating controls` 场景，服务本任务上下文注入，不替代规范。实施／检查时直接完整读取该场景，并按相关功能读取其图标交付、视口／返回导航等场景。

原文件超过单文件注入限制 32768 bytes。当前 Pi JSONL loader 不支持行号或章节范围；本任务注入这一短索引与 [搜索研究](./apple-maps-and-native-search.md)，不修改全局配置或既有 specs。

## Current contracts

- 当前客户端位于 `apps/web/app/lib/native-glass-panel.ts`，事件为 `ims:native-glass-control`，控件种类为 icon-button/menu。provider 与 hook 位于 `native-glass-controls.tsx`。
- 当前命令是 `plugin:native-glass|set_controls`，权限是 `native-glass:allow-set-controls`。它整体替换集合，不接受增量拼接；缺 Lucide 资源时整组拒绝原生渲染。
- frame 使用 WebView 视口左上角为原点的 CSS pixels；iOS 用 WebView 在 host 中的 origin 与 `adjustedContentInset` 转换，不重复使用 `safeAreaInsets`。
- 现有按钮／菜单的宽、高、圆角由 Web 测量，Swift 不写固定几何。圆角最大为短边一半；`rounded-full` 的巨大 CSS 数值不能原样传给 UIKit。
- `shouldUseNativeGlassControls()` 只是平台准入。仅插件返回 `supported: true` 后写 `data-native-glass="controls"` 隐藏 DOM twins；隐藏用 `display: none`，避免第二个焦点／可访问入口。
- 测量隐藏 twin 时同步临时设置 `display: block; visibility: hidden`，同一任务恢复，不能触发可见闪烁或 ResizeObserver 循环。
- 开 Sheet/Dialog 时沿用 `ims:native-tab-bar-suppression`，provider 推送空集合；不另建第二条全局抑制事件。
- 同步由 mount、ResizeObserver、resize、orientationchange、VisualViewport resize/scroll、菜单状态及标签栏显隐驱动；地图 move/moveend 不驱动浮动控件同步。
- 原生事件必须匹配有效注册 id；menu-item 必须有有效 itemId。非法或未知事件忽略，不建立第二条业务请求路径。
- 不支持、invoke 失败或后续失去支持时保持／恢复 DOM；卸载推送空集合，移除 marker、监听与帧回调。原生 teardown 不能留下透明点击层。
- trigger 使用唯一的 `data-native-glass-control` 与 controlRef；菜单 panel 使用 `data-native-glass-twin` 与 panelRef，不能重复 measurable id。

## Application to search

上述几何、集合和 marker 规定描述现有按钮／菜单。新的搜索 host 使用独立能力与 IPC；其动态键盘／拖动布局在 [设计](../design.md) 中明确规定宿主边界由 Web 提供，原生回传实际遮挡区域。不能把旧按钮的 capability 或 marker 直接当作搜索面板成功。

玻璃及对应文字、图标与按压反馈必须在 WKWebView 地图上方的原生层完整渲染。使用现有资产的新增图标需进入打包清单并核对两份 iOS inventory；系统搜索输入由原生系统控件呈现。业务状态与请求仍由共享 Web 模型负责。

## Verification owners

- `tests/unit/lib/native-glass-panel.test.ts`：准入和非法事件解析。
- `tests/unit/lib/native-glass-controls.test.tsx`：能力、marker、回退、抑制、几何、事件与卸载。
- `tests/unit/pages/community/community-exchange-app-page.test.tsx`：App refresh 注册和 DOM/native 互斥。
- `tests/tauri-build-configuration.test.js`：iOS 图标库存和打包矢量一致。
- iOS target Rust 检查与仓库 App wrapper 构建分别覆盖目标平台 Rust 和 Swift；真实折射、命中、旋转、展开与键盘仍须模拟器／设备证据。
