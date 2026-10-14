# App 导航宽度适配修订

## Requirement and authority

用户指出搜索／工具组比底部导航更宽，要求按不同机型适配。本修订继续现有 `in_progress`
任务和 `codex/exchange-ios-polish` 工作树，已授权实施及本地验证。R3 功能与视觉证据保留；
App 手机竖屏折叠／选点的 `hostWidth - 16` 规则被这次对齐要求覆盖。

## Source findings

- 修订前的 `GlassSearchView.swift` 手机宽为宿主减 16；402／440pt 分别为 386／424pt。
  R3 原图显示底部原生胶囊更窄，成为本次宽度修订依据。
- `NativeGlassPlugin.swift` 安装公开 `UITabBarController`，由 UIKit 拥有原生导航宽度、
  材质、安全区和选中状态。当前 IPC 没有可见导航胶囊矩形。
- 原生导航 AX frame 是完整布局条：402pt 为 `[0,791][402,874]`，440pt 为
  `[0,873][440,956]`。它包含透明区域，不能直接作为搜索表面宽度。
- App DOM 导航内层 `[data-glass-fallback]` 当前使用 `w-full max-w-sm`，外层 `px-3`。
  其实际宽度由容器、根字号与主题尺寸决定。回退按这层的真实几何或共同尺寸来源对齐。

## Layout and implementation boundary

手机竖屏浏览与选点时，搜索或摘要胶囊、工具组和导航可见轮廓共享左右边界。使用当前可用
宽度、公开系统内容边距／安全区与状态信息适配；不按营销机型名称分支，不恢复 360pt 上限。
原生导航不改 frame 或材质，不读取私有子视图。系统内容边距是布局输入，可见胶囊边界仍由
实际截图核对，不能把一般内容边距说成 UIKit 暴露的玻璃轮廓 API。

输入／结果展开后导航已抑制，继续使用较宽的阅读表面。短横屏保留 A 左侧停靠与右侧净空。
大字级可增高、换行或纵向排列，44pt 命中、48pt 侧控件、12pt 净空和 R3 完整 More 字体保持。
普通 Web 的宽度、桌面侧栏、全站导航和公共圆角不变。只在必要时添加 app-local 可选字段，
保持 TS／Rust／Swift 与旧 payload 默认；HTTP、数据与供应方不变。

UIKit 公开资料：[系统最小内容边距](https://developer.apple.com/documentation/uikit/uiviewcontroller/systemminimumlayoutmargins)
与 [内容边距布局](https://developer.apple.com/documentation/uikit/positioning-content-within-layout-margins)。
实施者需核实安装 SDK 声明及运行值。资料并未承诺这些属性直接返回导航可见胶囊 frame。

## Execution and evidence

由原实现 owner 单独写入，之后新上下文 checker 对产品只读；不并行写源文件。现有 read／
apply_patch／Bash 受限工具回退授权继续适用，保留真实 guard 拒绝与原预算。检查和截图使用
新的 `/tmp/imsweb-exchange-a-implementation/rework-r4/`，所有可变 fixture 路径重新分配。

DOM 检查 320／375／390／402／414／440 CSS px 的浏览／选点与实际导航边界，并覆盖展开、
短横屏、大字号、命中与来源返回。原生用一个 canonical optimized Release，在自有
402／440pt 和一个可用较小模拟机型上测量可见轮廓；较小机型须由实际 SDK/runtime 列表确认，
不能伪造设备或用截图缩放代替。保存公共布局值、CSS／pt／像素单位和误差；左右边界容差 2pt。

验证选点、五标签恢复、来源关闭、字体／更多、右侧定位净空与真实键盘／旋转。重新捕获受影响
的浏览／选点画面，展开与横屏只做相邻回归，不重跑无变化的旧矩阵。原始 R3 图库及失败记录
保持不可变；新检查明确源码、当前二进制、fixture、前台 App 和机型。恢复确切拥有的设备／
设置／fixture／runner；不授权物理手机安装、发布、权限重置或共享 SDK／signing 变更。

## Status

R4 已实现公开布局／安全区适配及两种混合呈现接口，DOM 检查通过；原生轮廓对齐通过，
保留界面实时变更字号的工具文字裁切保留为 REWORK。R5 修复该问题，独立检查在
375／402／440pt 完成同一界面的字号往返、当前包截图、16 次边界比较及键盘／来源相邻回归，
最大边界误差 1pt。详细范围、源码／包绑定、恢复和剩余验收见
[导航宽度与大字号复核](./a-navigation-review.md)。原 R3／R4 证据保留，任务继续 `in_progress`。

用户后续标注的纵向空白另经 R6 修订，当前可见间距约 12pt；水平宽度合同保留。
新截图、修改前后对照与验证范围见 [工具组与导航间距复核](./a-navigation-gap-review.md)。
