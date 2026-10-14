# Apple Maps 搜索与 App 原生能力

## Evidence and scope

本记录依据本地源码及 Apple 官方资料。用户最新请求明确要求 Apple Maps 风格地点查找、移动 App 同类设计和 iOS 液态玻璃；任务因此包含跨端呈现。没有运行 Apple Maps 实机测量，也没有构建或验证本任务原生 UI。尺寸与状态取舍属于设计提案。

## Apple reference

- [Search for places in Maps on iPhone，iOS 26](https://support.apple.com/guide/iphone/search-for-places-iph1df24639/26/ios/26)：搜索框位于卡片顶部，结果在其下；用户拖动卡片顶部改变高度。参照的是这一信息与交互结构。
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)：系统 bars、sheets、popovers 与 controls 可采用新材质；应控制自定义玻璃用量，验证透明度、动效及可访问性设置。
- [UIGlassEffect](https://developer.apple.com/documentation/uikit/uiglasseffect)：iOS/iPadOS 26.0 起可用。Web 的模糊或 SVG 预览不能证明原生 Liquid Glass。
- [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)：介绍 UIKit 搜索、控件及自定义玻璃表面，作为现有 UIKit 插件扩展的依据。
- [Sheet detents](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller/detents)：停靠高度按从小到大排列；[largestUndimmedDetentIdentifier](https://developer.apple.com/documentation/uikit/uisheetpresentationcontroller/largestundimmeddetentidentifier) 提供背景交互相关能力。本方案使用同类档位概念，但为标签栏净空选择独立停靠 host。
- [keyboardLayoutGuide](https://developer.apple.com/documentation/uikit/uiview/keyboardlayoutguide)、[UISearchTextField](https://developer.apple.com/documentation/uikit/uisearchtextfield)、[UIPanGestureRecognizer](https://developer.apple.com/documentation/uikit/uipangesturerecognizer)：分别提供原生键盘布局、搜索输入和拖动机制；其具体配置需实施时按官方声明与目标 SDK 核实。

不从 Apple Maps 的实时搜索或自然语言能力推导当前搜索供应方具备相同 API。本任务沿用现有显式提交，未引入 Apple Maps 数据、路线或历史记录。

## Repository capabilities

| 位置 | 观察与设计约束 |
| --- | --- |
| `apps/web/app/layouts/app-layout.tsx` | 交换地图使用固定高度沉浸式外壳，仍有 AppTopBar/AppTabBar；新卡片须协调已有导航 |
| `apps/web/app/lib/native-glass-panel.ts` | 当前 native 控件合同只有 icon-button/menu、frame、事件和 supported 确认；搜索需独立扩展 |
| `apps/web/app/lib/native-glass-controls.tsx` | DOM twin／几何同步和原生控件抑制有现成路径；搜索不能仅沿用按钮 capability 隐藏输入 |
| `apps/web/src-tauri/plugins/native-glass/src/models.rs` | 与 TS/Swift 对应的本地插件模型；新增搜索 payload 不属于 HTTP contracts |
| `apps/web/src-tauri/plugins/native-glass/ios/Sources/NativeGlassPlugin.swift:207` | setControls 在 iOS 26 guard 内安装原生 host，空集合负责 teardown，不支持时回退 |
| 同上 `:238`、`:442` | 布局后测量 WebView 与原生层 offset；安全区／content inset 不能重复计入 |
| `apps/web/src-tauri/plugins/native-glass/ios/Sources/GlassControlView.swift` | 已有 UIGlassEffect/UIGlassContainerEffect 控件原生渲染；没有搜索输入、结果或伸缩 host |
| `docs/architecture/glass-refraction-platform-strategy.md` | 地图 WKWebView 内容不透明；玻璃与对应文字／控制须在其上的原生层完整呈现 |
| `apps/web/app/pages/community/exchange/exchange-place-search.tsx` | query/results/loading/error 由组件管理，至少两个字符、显式提交、阻止并发提交、429/503 特定反馈 |

## Proposed native boundary

搜索模型仍在 Web 业务层，原生 renderer 不访问地点服务。提案新增面板同步／销毁命令及原生事件，payload 包含 panel 身份、呈现代次、查询、请求状态、完整结果标识／文字、选点摘要、i18n 文案、宿主边界与导航净空。事件包含输入、提交、取消、选点、清除、档位与实际几何；JS 校验当前会话及有效结果。

原生 capability 仅在完整面板安装成功后确认。DOM twin 的隐藏必须等待搜索专属确认；失败移除 host、结束输入、释放导航抑制，并恢复 DOM。旧插件缺命令与 iOS <26 均回退。命令名和最终字段在实现时与 TS/Rust/Swift 对齐，不作为已存在 API。

原生输入不能被每次数据回传重建；IME 组合文字需要保留。原生拖动本地完成，几何事件节流，不让 Web 预测 frame 持续覆盖当前原生 frame。模态工具和切页必须清理输入及覆盖层。

## Verification limits

Web/App Playwright 可以证明 DOM 回退、状态和业务事件。只有目标 iOS 构建及模拟器／设备能验证原生玻璃、输入、键盘、图层和 VoiceOver。实施后先运行 `pnpm run app:doctor`，通过仓库 `app:*` wrapper 交付本地验证；当前没有这类通过证据。
