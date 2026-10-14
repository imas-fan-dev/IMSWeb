# 交换地图底部查找设计

## Review boundary

用户已明确批准“全部按照A类进行施工”。当前权威布局为 [A 设计合同](./research/apple-maps-redesign/a-implementation.md) 和 A 四张单图：分组胶囊、右侧刷新／定位、浏览态五标签栏、平面结果。下面旧 Layout、几何及 iOS 修订作为历史保留，遇到冲突以新版合同为准；346／360pt 宽度不再约束手机竖屏。

原结构图见 [layout-wireframe.svg](./layout-wireframe.svg)，原预览见 [layout-preview.png](./layout-preview.png)。图中地图与结果均为占位示意；实现验证见 [verification.md](./verification.md)。历史依据见 [当前布局](./research/current-layout.md) 和 [Apple Maps／原生能力研究](./research/apple-maps-and-native-search.md)。原始图片不重绘覆盖。

参考研究见 [Apple Maps 参考与新版设计](./research/apple-maps-redesign/README.md)；[总览](./research/apple-maps-redesign/preview/overview.png) 同时保留已批准 A 和未采用 B／导航对照。实际 Apple Maps 的宽度随状态变化，本产品按新版 A 合同适配，不推广任一 Apple 状态为统一宽度。

## Layout

### Current A integration

The current implementation uses separate browse search/selected-summary and filter/directory
surfaces. Selection replaces the capsule content. Refresh and locate occupy the right-side group;
the measured bottom occlusion excludes that group and covers the search/tool union. R3 phone
widths are host minus 16, tablets cap at 560, and short landscape follows the 48%/320/420 rule.
The transparent gap passes map hits through. Expanded editing/results use a flat reading surface.
The old layout and width tables below remain historical records.

The user has now requested per-device alignment with the bottom navigation. The new
[navigation-width correction](./research/apple-maps-redesign/a-navigation-width.md) supersedes
the App collapsed/selected phone width rule. It leaves UIKit navigation ownership, ordinary Web,
expanded reading width and short-landscape docking intact. Public content margins guide native
adaptation; actual screenshot contours confirm the visible navigation capsule, whose outer
accessibility frame includes transparent space. The correction is approved for implementation.

The native snapshot now sends `selectedLabel` and `selectedAddress` from `selectedPlace`, alongside
the legacy `selected` string. Deselection clears all three while preserving the draft and results.
Existing page/modal, private-hook acknowledgment, source focus and navigation-suppression owners
remain in place. New integration evidence is recorded in
[a-integration.md](./research/apple-maps-redesign/a-integration.md); browser evidence does not
establish native visual acceptance.

Implementation clarification: `/community/exchange` is the Map tab root. It has no back control,
following `app-navigation.md`; the schematic's generic return decoration is not a requirement.

```text
Web：保留网站顶栏      App：沿用沉浸式地图外壳
┌────────────────────────────────────┐
│              地图                  │
│                          定位      │
│  按需反馈                          │
│ ┌────────────────────────────────┐ │
│ │           拖动手柄             │ │
│ │  查找地点          刷新  更多   │ │
│ │  筛选       事务所       名片   │ │
│ └────────────────────────────────┘ │
│       App 标签栏（折叠时保留）      │
└────────────────────────────────────┘
```

搜索入口是一张常驻可伸缩卡片。刷新名录和更多与搜索并排，筛选和两类名录位于卡片第二行；地点查找不再与这些工具共用五等分操作栏。定位独立放在右侧、卡片上方，随面板实际遮挡区域移动。正常浏览没有地图标题或统计摘要。

Web 卡片使用既有语义表面、边框和品牌色。App 使用同一结构与交互模型；iOS 26+ 的搜索与操作表面由原生 UIKit Liquid Glass 呈现。展开后的结果正文使用可读背景与平面列表，不给每条结果叠加玻璃卡片。

## Web rounded surfaces

按用户要求，Web 地图搜索表面采用更圆润的局部形状。折叠、结果展开和选点摘要使用同一家族的外轮廓；无需为了圆角增加面板高度或减少地图空间。

| 元素 | 设计目标 |
| --- | --- |
| 底部搜索面板 | 28px 外圆角，细淡边界与轻微浮层投影；深色主题保持边界可辨 |
| 搜索入口／输入框 | 48px 高，24px 圆角，胶囊轮廓；焦点环不裁切 |
| 定位、更多、清除等独立图标动作 | 44×44px 圆形，圆角为短边一半；保留可访问名称与必要 tooltip |
| 筛选、事务所、名片 | 至少 44px 高的圆润文字按钮，胶囊形、浅语义背景；保留文字和已应用提示 |
| 查找、取消／收起 | 圆润按钮，明确主次；触控区域至少 44px |

减少竖向分隔线和深色描边，通过留白、浅背景和按下／焦点状态区分操作。面板仅使用轻微单层投影，不添加追踪高光或额外折射效果。长列表仍为平面行，圆角不替代阅读层级。

`apps/web/DESIGN.md` 的全站基础圆角目前为 8px。此处是用户指定的地图搜索局部例外，实施时将范围记录进该文档，不修改全站 `--radius` 或其他页面的公共 primitive。移动 App 和 iOS 原生材质继续使用已规划的平台规则。

## Search states

| 状态 | 卡片内容与地图 | 进入／退出 |
| --- | --- | --- |
| collapsed | 搜索、更多及三项工具；地图保留最大空间 | 初始状态；上拉或激活搜索进入展开 |
| editing | 搜索框、显式查找、取消；让出软键盘空间，正文可滚动 | 输入只更新草稿；提交使用现有搜索服务 |
| results | 搜索框和结果列表；中档约半屏，大档可查看更多 | 提交后结束键盘输入；拖动或按钮在折叠／中档／大档间切换 |
| selected | 恢复折叠工具，附选中地点摘要、清除与署名 | 选点收起结果并定位；再次展开保留当前结果 |

展开程度与搜索内容分别建模：例如收起结果不丢失查询、结果或选中地点。取消结束编辑并收起，保留此前选中的地点和搜索草稿；清除地点只移除搜索标记。搜索输入自己的清除按钮只清除输入文字。

折叠时的搜索框外观由非编辑按钮呈现，点击／Enter 才展开并聚焦实际输入。取消和选点后，Web 焦点回到该按钮；iOS 将辅助技术焦点交回原生可见按钮，不重新启动文本编辑。这样焦点恢复不会立刻重开键盘。编辑和结果态的实际文本框在数据同步时保持身份，保护组合输入。

结果选择沿用当前 map-section 的地点所有权与地图 `easeTo`／减少动效路径。收起后的长地点名称最多两行；可以重新展开阅读完整名称与地址。署名随地点摘要或搜索内容显示，不被加载／错误反馈遮掉。

保留显式提交和现有最少字符限制。Apple Maps 的参照范围是搜索卡片位置、伸缩和结果浏览；本任务没有实时联想服务，输入时不向现有供应方发送自动请求。

## Geometry and gestures

| 条件 | 折叠与展开 |
| --- | --- |
| Web 320 至 767px | 卡片左右各 12px，正常折叠目标高度约 144px；搜索行至少 48px、工具行至少 44px。底部留 `max(12px, safe-area-inset-bottom)` |
| Web 768 至 1023px | 同一结构，卡片居中、最大宽 560px；不重新出现顶部工具横条 |
| 常规竖屏 | 中档目标为可用地图高度约 50%，大档最多约 85%；实际值受最小内容、顶栏和键盘空间限制 |
| 可用高度 ≤500px、宽 ≥640px | 卡片停靠左下、最大宽 360px；展开大档覆盖左侧安全高度，右侧仍可浏览地图，定位移到右侧净空 |
| 可用高度 ≤500px、宽 <640px | 使用全宽安全高度，压缩留白、允许正文滚动；不强制保留无法容纳内容的中档 |
| App 折叠 | 卡片位于现有标签栏净空上方；安全区不重复计入 |
| App 编辑／展开 | 隐藏标签栏和会重叠的地图原生按钮，卡片对齐键盘上沿或底部安全区；收起后恢复 |

这些是设计目标，不能作为不经测量的固定高度。以宿主容器和真实可见视口计算可用空间；Web 顶栏高度继续由布局拥有。Web 使用 `VisualViewport` 处理键盘与视口偏移并有无该 API 的回退；iOS 使用原生键盘布局。

拖动限于手柄／专用头部区域，使用指针捕获，避免与结果滚动、文本选择或地图拖动争抢。结果列表到顶也不自动接管为卡片拖动。拖动结束吸附至最近可用档位，短视口只暴露可容纳的档位；旋转或键盘变化重新约束高度。

手柄不是唯一操作方式：搜索入口能展开，结果区提供至少 44px 的“展开结果／收起”操作，编辑区保留取消。Web 搜索卡片为非模态 section/form，无遮罩和焦点锁；Escape 先结束编辑、再收起。卡片外地图可操作，卡片背景不透传点击。模态工具继续使用既有 Sheet/Dialog。

定位与反馈按面板实际占用区域避让；不能只把原来的 `bottom-20` 改成另一个常量。短横屏停靠左侧后，定位使用右侧净空；选点的地图视野也按可见地图矩形调整，不能将标记放在面板背后。

## Filters, directories and feedback

- 筛选保留已应用提示和 URL；事务所／名片继续打开对应名录，保留 Tabs 和分页。加载数量在名录内明确标为“已加载”。
- 打开筛选、名录、区域详情或来源时，先结束搜索编辑并暂时隐藏搜索表面，再打开现有模态内容；关闭后恢复折叠卡片及可见焦点。
- 更多包含当前范围只读状态、我的交换账号和地图来源；没有 attribution 时移除来源项。刷新位于常驻搜索行，保持 `loadFirstPage()` 的名录语义，名录刷新期间保留原尺寸并显示忙碌状态。
- 加载、空结果、截断、地图错误和定位失败放入卡片上方的按需反馈；搜索展开时把相关反馈放到可见内容区，避免额外占满地图。优先级为地图不可用、地图数据错误、定位失败、截断、加载、空结果。
- 成功数量只在更多中显示“当前范围：N 个区域点”，变化通过 polite live region 告知辅助技术。错误保留重试与查看名录；不能清掉仍可用的旧结果。
- 地图来源继续使用实际样式和安全解析。更多转到来源 Dialog 时先关闭菜单／工具面板；来源关闭后回到常驻更多，桌面回到原来源触发器。

## Shared ownership and component seams

- `community-exchange-page.tsx` 继续拥有筛选、名录和来源；移除窄屏标题栏，协调主工具面板互斥。Web 网站顶栏保留，App 不增加 Web 顶栏。
- `community-exchange-map-section.tsx` 保留地图范围、区域选择及选中地点所有权；通过明确接口连接查找内容和反馈，不与 page 各自保存一套选中地点／搜索开关。
- 从 `exchange-place-search.tsx` 提取页面私有搜索模型，复用到现有桌面组件、Web 卡片和原生呈现。单一模型管理 query、请求阶段、结果、错误；请求仍走 `searchFudabaPlaces`，保留并发提交保护和错误语义。
- 新增页面私有卡片控制器与 DOM 呈现，负责展开程度、编辑和工具互斥。native renderer 仅接收模型快照并回传用户事件，不单独请求数据。
- `exchange-mobile-navigation.tsx` 的窄屏入口由卡片承接；现有 App map button/menu primitive 继续为独立控件服务，不给每条搜索结果注册按钮 frame。
- `exchange-office-map.tsx` 接收真实遮挡区域，协调定位按钮和选点视野；样式变更归属现有 stylesheet 层和主题令牌。
- CSS、JS 和 SSR 使用相同 Web 1024px 边界。跨断点时结束失效呈现、回到桌面等价入口；SSR 不渲染两套可见操作。

搜索、展开程度和原生可用性是三种独立状态。渲染器切换时保留搜索模型；使用 presentation generation 与结果身份校验，忽略卸载、切页、旧会话或旧结果的异步事件。控件值更新不能重新创建文本框或覆盖尚未提交的原生输入法组合文本。

## iOS native presentation

现有插件只有 `icon-button` 和 `menu`。本方案在同一插件新增独立搜索面板命令／事件与能力确认，不把文本输入伪装成按钮，也不改变现有控件 union 的含义。新增 IPC 属于 app-local 原生合同，TS、Rust 与 Swift 一起维护，HTTP contracts 不变。

原生搜索 host 是位于 WKWebView 上方的 child view controller：使用 `UISearchTextField`、`UIGlassEffect`／`UIVisualEffectView` 和可访问的原生结果列表。玻璃及其文字、按钮均在原生层，不能只给 DOM 下方放一层原生玻璃背景。

使用自定义非模态停靠 host，原因是折叠时需停在现有标签栏上方，展开时仍允许卡片外地图交互。Apple `UISheetPresentationController` 的 detents 可作为伸缩参照，但不是此处全局常驻模态 Sheet 的实现承诺。原生拖动由 UIKit 本地处理，不逐帧等待 JS 往返。

原生 host 按 Web 提供的宿主边界、标签栏净空和状态布局，用 `keyboardLayoutGuide` 适配键盘，完成布局后将实际遮挡 frame 转回 CSS 视口坐标。原生拖动期间可节流回传几何，结束时提交最终 frame；DOM fallback 的预测高度不能反过来覆盖原生拖动。

沿用现有 App bar／glass-controls suppression 通道：搜索展开的拥有者申请抑制标签栏和独立地图控件，折叠／失败／卸载必须释放；不另建第二条全局隐藏事件。搜索 host 独立于被抑制的 icon/menu 集合。其他模态内容打开前明确结束／隐藏搜索 host，防止原生层遮住 Web Dialog。

地图的 DOM 标签栏回退也监听同一抑制通道，展开时隐藏、收起后恢复。原生同步失败后先确认 host 清理再恢复 DOM；连续清理失败时允许取消／工具退出，并在后续状态更新重试，避免同时显示两套搜索表面。

只有搜索面板自己的同步确认成功、监听就绪且内容完整时，才隐藏对应 DOM twin，并使其不可聚焦／不进入可访问树。不能根据现有按钮的 `supported` 提前隐藏输入。失败先移除原生 host／结束键盘，再恢复 DOM 和焦点；旧版本插件、Android 和 iOS <26 均走 DOM。显式 teardown、切页及原生 destroy 都应覆盖搜索 host。

系统字级、明暗模式、减少透明度和减少动效优先使用 UIKit 行为。原生界面的可访问名称和可见文案由 Web 现有 i18n 传入；不在 Swift 重写一套业务文案。

## iOS appearance follow-up boundaries

The smallest gap is presentation: refresh is hidden in More, the native search card follows document darkness beside intentionally light map chrome, and its buttons inherit system tint and nested glass styling. `exchange-search-card.tsx` owns the visible refresh and appearance snapshot; `community-exchange-map-section.tsx` owns feedback visibility. `GlassSearchView.swift` owns the capsule, neutral grabber, native button hierarchy and fitting layout. Optional palette fields stay aligned in the TS/Rust/Swift app-local models. No HTTP or map request changes are needed.

Keep one 28pt outer glass surface. Search uses a magnifier and semantic label in a capsule; secondary tools use plain, readable buttons. A neutral grabber retains its 44pt interaction area. One refresh-cw button stays beside search and More at every detent, with no duplicate menu item. Native appearance follows the map surface color scheme, currently light in App, rather than the document class. Action tint comes from the current CSS primary palette. UIKit continues to own material accessibility adaptations.

## Native correction ownership

Occlusion repair is limited to the card's renderer ownership, the private bridge's generation cleanup and acknowledged fallback callback, plus focused lifecycle regressions. Native frame data survives measurement subscription, readiness and position changes. Modal teardown, host disappearance and unmount release it; acknowledged fallback gives measurement back to DOM. Generation cleanup removes its native session without clearing the new session's current snapshot; actual unmount suppresses its events. The geometry scheduler remains unchanged. The native reviewer observed More/locate overlap; runtime IPC ordering was not instrumented and is not asserted as fact.

`GlassSearchView.swift` owns stable search/tool buttons, UIKit activity and configuration transitions, and removal of its inline attribution label. `GlassControlView.swift` owns existing standalone press feedback and identity reconciliation for ungrouped icon controls such as locate. The existing tab bar remains the baseline and needs no edits.

The map section preserves selected-place attribution separately from current result metadata and reports deduplicated App notices to the page. The page keeps source availability and Dialog state; the existing Dialog renders these notices as plain text alongside its safe loaded-style segments. The App card suppresses its inline notices. An optional app-local return-focus field in TS/Rust/Swift carries source-close intent to native More; it is consumed only on the returning native session. The private search hook acknowledges readiness before the card clears that intent, including a quick close while old teardown is pending. Ordinary Web and desktop behavior remain unchanged.

Expected source edits are those owners plus aligned local search models, focused tests, and the authored search preview. No stylesheet, generated project, API, private fixture or global tab changes are required. Stable buttons retain existing callbacks and 44pt constraints; readiness still validates the complete asset set before rendering.

## Historical iOS dock width amendment and visual refinement

本节是历史修订及实现记录。用户最新请求重新确定宽度和样式，本节数值不作为新版设计目标。

The user's follow-up narrows only the collapsed/selected iOS dock to
`min(360pt, host viewport width - 56pt)`, centered in the measured host. At
402pt this is 346pt with 28pt sides; at 440pt it is 360pt with 40pt sides;
at 320pt it is 264pt with 28pt sides. Original PNG/SVG references and their
renderer remain immutable. This amendment does not scale typography or targets.

Implementation stays in the native search presenter and its complete-glyph
readiness gate, with localized reading labels in the existing string dictionary.
Use 17pt system body search text, a subdued idle magnifier/prompt, lighter neutral
capsule fill, 18pt existing tool glyphs and a metrics-scaled 16pt medium tool font.
Keep the 28pt dock radius, 48pt search row, 44pt action/drag targets, real fitted
height and geometry events. Reflow tools vertically when inline content cannot
fit; keep persistent input and buttons through live text-size changes.
The native content viewport scrolls when fitted content exceeds available height;
the results table keeps its own normal scrolling and whole-row selection.

Expanded results use an independent sheet width, a flat system reading surface,
23pt semibold heading, 14pt subtitle, 18pt medium result titles, 14pt addresses
and neutral location/direction glyphs. Explicit submit/cancel and detent actions
remain accessible, so the real header is taller than the drawing's header.
The 44pt grabber can likewise make the dock taller than the illustrated 144pt.

Keep public interactive regular UIGlassEffect for the dock; its OS-owned rim
and highlights are accepted differences requiring actual backdrop comparison.
Project refresh tint, modal suppression, system tab geometry and accessibility
material adaptations remain intentional. No global primitives, map provider,
HTTP contracts, dependencies, navigation or ordinary Web/Android changes.

Visual approval requires new full native device-pixel captures and measured
component comparison against immutable references plus this amendment: dock
width/insets/radius/height, capsule fill/foreground/geometry, tool text/glyph sizes,
action hits, expanded hierarchy, scrolling, live Dynamic Type and locate clearance
of at least 12pt. Historical functional PASS does not approve this presentation.

## Validation and rollback

### Recovered native visual review: capsule and source Dialog

The next independent review confirmed capsule luminance and the local source
Dialog repair. It measured an oversized idle magnifier and a status-bar overlap
at largest Dynamic Type on a constrained 320pt host. Render the existing system
magnifier into a 21pt template image to prevent automatic UIButton symbol growth.
Constrain available native dock height from the measured safe-area top, reserving
the existing 44pt locate target and 12pt clearance when collapsed. Oversized dock
content remains scrollable; fonts and hit areas retain their current sizes.
Default geometry is unchanged when fitted content already has this clearance.

The optimized Release review confirms the amended 346pt dock and point-sized
glyph/reading hierarchy. The capsule still measures about 219 luminance bytes
against the immutable reference's 242. Use adaptive UIKit `systemGray6` for the
search capsule and field background, preserving secondary idle ink and genuine
regular interactive outer glass. Actual blank and synthetic-backdrop captures
must establish the new fill; source color selection alone is not approval.

The existing source Dialog receives an explicit iOS App admission from the map
caller. Its local presentation uses viewport width minus 48px, 25px radius,
24px padding, centered 20px system-font heading, 44px close target and a separator
before search notices. Height follows complete actual tile and independent search
licensing, with safe viewport scrolling. Ordinary Web/Android and the shared
Dialog primitive keep their current presentation. Native suppression and More
return remain owned by the existing modal lifecycle.


浏览器验证状态、命中、焦点和回退；iOS 模拟器／设备验证原生玻璃、真实键盘、拖动、VoiceOver 和导航恢复。截图、视频需标明平台与实际 native capability；DOM 预览不能代替原生证据。

单个任务保留共享模型、两类呈现和联合验收，实施按 Web 回退、原生桥接、原生 UI 分阶段。native capability 未完成时保持 DOM 可用；任何原生回退都要清理 host。代码可按共享模型／Web 卡片／native 搜索单元回退，没有后端上线或数据迁移步骤。
