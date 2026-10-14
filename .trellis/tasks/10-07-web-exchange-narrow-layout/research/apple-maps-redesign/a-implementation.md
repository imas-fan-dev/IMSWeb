# A 设计与实施合同

## Approval and authority

用户已明确要求“全部按照A类进行施工”。继续现有任务和 `codex/exchange-ios-polish` 隔离工作树，基线 HEAD 为 `375820be0a1989ff5d356bc707434e5a58689661`。该批准包含 Web 窄屏、App DOM 回退和 UIKit 的 A 浏览／输入／结果／选点实现及本地验证。浏览态保留五标签栏，输入／展开仍使用现有抑制与恢复通道。B、隐藏浏览态导航、历史 360pt 上限均未采用。

## Smallest behavior gap

当前实现把 44pt 手柄、搜索行、刷新、工具和摘要堆在单一玻璃外卡内；原生折叠仍按旧上限收窄。新版把浏览搜索／摘要胶囊与工具组分开，把刷新移到右侧与定位组合，选点替换胶囊内容。输入和结果按 A 阅读层级展示；现有搜索模型、原生能力／清理确认与业务请求保留。

## Geometry and interaction

| 条件 | 新版适配 |
| --- | --- |
| 手机竖屏／宽小于 768 | 搜索与工具宽为可用宿主宽减 16；左右各 8。402pt 下宽 386，440pt 下宽 424，不设 360 上限 |
| Web 768 至 1023／App 平板 | 同一 A 结构，宽 `min(560, hostWidth - 16)`，居中；Web 从 1024 保留既有桌面侧栏 |
| 短横屏：可用高度不超过 500 且宽至少 640 | 左下停靠，目标宽 `min(420, max(320, hostWidth * 0.48))`，边距 8；右侧保留地图与控件净空 |
| 短高窄视口／键盘 | 优先让输入、查找与关闭可达；内容区滚动，宿主和地图不跟随正文滚动。档位按实际可见高度裁约 |
| 大字级／长名称 | 自然增高、换行、纵向工具排列或内部滚动；保留字体与 44pt 目标，重新测量几何 |

用户最新提出导航宽度不一致，要求按机型适配。App 手机竖屏浏览／选点的上方胶囊和工具组，现按
[导航宽度修订](./a-navigation-width.md) 与当前导航的可见左右边界对齐；这项要求覆盖表内旧 App
`hostWidth - 16` 规则。普通 Web、展开输入／结果、短横屏和其他交互合同继续适用。不得复用历史
346／360pt 固定上限，或把包含透明区域的原生导航外层 frame 当作可见胶囊宽度。

68pt 搜索、44pt 工具组和 74pt 选点是 A 图稿的默认密度参照，不是所有字级和视口的固定高度。44pt 专用拖动目标与实际按钮不能争抢同一点击；折叠可以将拖动区域整合进胶囊的非按钮区域，展开保留专用手柄。专用可访问操作提供等价档位切换。不得让透明外容器拦截两块表面之间或卡片外的地图。

搜索／摘要有胶囊轮廓，更多保持 44pt。筛选、事务所和名片位于独立圆润工具组，浏览／选点直接可见。刷新／定位右侧竖向组合沿真实底部遮挡矩形摆放；标准目标 48pt，最少 44pt，控件组与搜索表面至少 12pt 净空。刷新忙碌保留命中和几何，禁止重复请求；位置不因 spinner 变化。

输入和结果使用可读平面表面；结果列表不叠玻璃。查询、取消、清除、选择、保留结果与地图标记的语义不改变。App 完整来源继续由已有 Dialog 拥有；Web／桌面署名保留。UIKit 使用公开 regular interactive `UIGlassEffect`、系统文本与可访问性；DOM 使用既有主题和局部形状样式。

底部遮挡可继续用涵盖胶囊和工具组的联合矩形服务相机；原生实际命中只属于真实表面。右侧组合控件避让独立计算，不把 side frame 混成覆盖整图的 bounding box。仅在现有合同不能表达新布局时添加可选 app-local 字段，TS／Rust／Swift 同步、旧 payload 保留默认，HTTP 不改。

## Component ownership and gates

本轮为 multi-seam，组件顺序执行，同一时刻只有一个 writer。现有独立工作树保留所有未提交修订；不回退、不暂存、不合并父工作树。运行报告通过绑定 output 保存，原始运行证据进忽略 data 目录。

| 阶段 | 独占源码／合同 | 交付与门禁 |
| --- | --- | --- |
| Web A | `exchange-search-card.tsx`、`exchange-office-map.css`、`exchange-office-map.tsx` 与必要私有 DOM 几何帮助模块／对应测试 | A 分组、右侧刷新定位、自然选点摘要、适配和实际命中；focused units、lint／typecheck、Web／App DOM E2E，保存组件交接和精确差异 |
| Native A | `GlassSearchView.swift`、必要 `GlassControlView.swift`／`NativeGlassPlugin.swift` 与 TS／Rust／Swift app-local 搜索快照合同／对应桥接测试 | 稳定 native 对象、相同 A 分组／拟合、公共玻璃、IME、几何和确认；旧 payload 默认、focused bridge／delivery、目标 iOS 构建交接 |
| Integration | 必要 map-section／page／私有 hook 接线、跨端测试、局部设计与规范更新 | 仅整合组件交接，排查遮挡／导航／来源／回退；不重写两套组件。执行共享静态／单位／构建和联合浏览器门禁 |
| Independent check | `trellis-check` 新上下文，只读验收为主 | 对精确新版增量和 A 四单图审查，独立 UIKit Release／真实键盘／拖动／选点／刷新／导航恢复；返回 PASS、REWORK 或 BLOCKED 与证据 |

组件实现者先读真实源码和相邻测试，允许在该组件必要范围内拆分私有视图。需要跨归属修改时先向父会话报告，避免两个组件抢同一 owner。所有阶段禁止 spawn、commit、push、merge、发布、物理手机安装、私有材质改动、共享模拟器设置修改和生成目录手改。

## Required evidence

新单位／浏览器证据保护显式提交及至少两个字符、请求并发、429／503、选点清除、状态保留、filter URL、名录分页／刷新、来源／焦点和 native ready／remove ack。浏览器先测未自动滚动的 `getBoundingClientRect` 与 `elementFromPoint`，再驱动控件；保持零重试与既有超时。

矩阵包含 Web 320×568、390×844、768×1024、900×1200、1023×768、844×390、667×375 和桌面 1280×800。App DOM 覆盖旧系统、Android 和能力失败。UIKit 至少覆盖自有 402／440pt 设备尺寸、四状态、旋转、真实软键盘、刷新 pending、更多／来源 return、切页恢复、live Dynamic Type 与系统材质设置。检查图与 A 单图并列，原始 PNG 不缩放；合成地图截图注明用途。

使用 `app:*` canonical optimized Release wrapper，先 doctor，沿用已记录的命令范围内 Team 和隔离 swift-rs Xcode 27 修复。长构建 runner budget 14400000ms；不切 Debug、不直接 Tauri CLI、不改共享 SDK／signing、不增加 native assertion timeout。原始失败、旧截图及未验证平台／VoiceOver／IME 项明确保留，不把来源检查或浏览器回退称作原生验收。

完成后按 `trellis-update-spec` 更新本任务改变的局部设计、组件和原生合同；保护基线后仅提交任务范围内最终增量。发布与物理安装不属于本次批准。
