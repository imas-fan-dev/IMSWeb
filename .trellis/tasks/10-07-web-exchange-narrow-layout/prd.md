# Web 与 App 交换地图底部搜索卡片

## 新一轮设计需求修订

用户指出上一版宽度和样式仍不符合设计需求，要求研究最新 Apple Maps 后重新设计。参考研究与六张提案已完成，用户现明确批准“全部按照A类进行施工”。本轮按 A 完成浏览、输入、结果和选点呈现，浏览态保留五标签导航。现有实现、旧预览及验收作为历史记录保留；此前的 346／360pt 固定宽度、28／40pt 边距不作为新版验收依据。

研究分别记录官方版本资料、实际 Apple Maps 界面、截图／几何观察和 IMSWeb 适配提案。功能门禁通过不等于实际画面符合批准的 A 设计；本轮需新的运行界面证据。现有数据与交互合同继续有效，施工范围为 Web 窄屏、App DOM 回退与 iOS 原生呈现。

批准参照为 [A 浏览／输入／结果／选点](./research/apple-maps-redesign/README.md)，适配和施工边界见 [A 设计合同](./research/apple-maps-redesign/a-implementation.md)。B 与隐藏浏览态底栏的对照保留为研究历史。下面的新版验收项需重新验证，历史技术证据不直接勾选。

## Goal

让用户在浏览交换地图时直接找到地点搜索、筛选和名录，减少顶部遮挡。地点查找采用 Apple Maps 风格的常驻底部卡片，同样覆盖移动 App；iOS 使用原生液态玻璃。

## Background

- 用户要求移除地图内“名片交换事务所”标题栏，保留承载 logo、账号、主题和导航的网站顶栏；最新请求把 Apple Maps 风格地点查找和移动 App 纳入范围。
- Web `/community/exchange` 使用固定视口与紧凑网站顶栏，地图页没有页脚，见 `apps/web/app/layouts/public-layout.tsx:20`。
- 768 至 1023px 时，底部导航与桌面侧栏同时隐藏，工具集中在顶部，见 `community-exchange-page.tsx:789`、`:818`、`exchange-mobile-navigation.tsx:299`。地图内地点查找和统计仍在顶部，见 `community-exchange-map-section.tsx:413`、`:486`。
- 事务所和名片入口打开分页名录，已加载长度不是总数；刷新调用名录的 `loadFirstPage()`，见 `community-exchange-page.tsx:629`、`:803`、`:812`。
- App 已有原生液态玻璃按钮和菜单，现有接口尚不支持搜索输入和伸缩结果卡片，见 `apps/web/app/lib/native-glass-panel.ts` 与 `apps/web/src-tauri/plugins/native-glass/ios/Sources/GlassControlView.swift`。详细证据见 [跨端研究](./research/apple-maps-and-native-search.md)。

## Requirements

- R1：覆盖 Web 320 至 1023 CSS px、移动 App 的竖屏与短横屏。Web 1024px 起保留桌面侧栏；不能依赖截图像素判断断点。
- R2：移除地图内可见标题栏和成功统计浮层。浏览态采用 A：搜索胶囊与筛选／事务所／名片工具组分开，刷新名录与定位组成右侧控件组；更多仍在搜索／摘要表面，可访问账号和来源。首次可用呈现及地图加载／空状态均保留刷新，不在更多内重复。
- R3：同一搜索会话支持折叠、输入／结果展开和选中地点摘要；选点摘要替换浏览搜索胶囊内容，不追加一整行。用户可以拖动专用区域调整展开程度，也能通过可访问按钮完成同样操作。选点后收起结果并定位地图，重新展开保留结果；展开结果时卡片外的地图仍可操作。输入和结果使用 A 的可读平面表面。
- R4：沿用显式提交、至少两个字符、限流／失败反馈、选点清除、减少动效及 OpenStreetMap 署名。保留筛选 URL、名录分页和区域详情；地点定位不改变城市筛选，名录入口不成为图层切换。
- R5：加载、空结果、截断和错误按需反馈，正常成功状态不常驻统计。错误保留重试与查看名录；区域点、已加载名录数量和全量统计保持区别。
- R6：iOS 26 及以上采用原生 Liquid Glass 搜索与控制表面、原生文本输入和原生结果交互。Android、较旧 iOS、能力不可用或原生同步失败时，提供行为一致的 Web 卡片回退。
- R7：浏览和选点时保留 App 五标签栏，胶囊／工具组避开标签栏；输入与展开时沿用已有抑制通道协调键盘、标签栏和地图按钮，关闭后恢复导航。切页、开其他面板或能力回退时不残留原生输入、键盘或透明点击层。
- R8：地图来源在所有尺寸都可访问，取自已加载样式 attribution；没有来源时不显示空入口。搜索地点的署名独立保留。关闭来源后焦点回到可见的更多或桌面入口。
- R9：文字与操作可读可点，交互目标至少 44×44，支持键盘、VoiceOver、焦点恢复、明暗主题、减少动效／透明度和开面板调整窗口。延续既有品牌、字体和语义色。
- R10：各渲染器采用 A 的分组和轻薄浏览轮廓；手机竖屏搜索／摘要使用接近可用视口宽度的布局，不保留 360pt 全局上限。Web 搜索为胶囊、工具组圆润、右侧控件竖向组合；阅读表面使用浅边界和平面列表。字体缩放可增高、换行和滚动，不能缩小字体或命中目标来保持绘图高度。形状调整限定于地图页面。
- R11：App 手机竖屏浏览／选点时，搜索或摘要胶囊、工具组与底部导航的可见胶囊左右边界对齐，随设备可用宽度、安全区和系统布局适配。原生导航仍由 UIKit 拥有，DOM 回退按其实际导航宽度对齐。展开输入／结果时保留必要阅读宽度，短横屏保留左侧停靠；不通过固定机型名单、历史 360pt 上限、缩小字体或改写全站导航实现。
- R12：按用户标注缩小 App 手机竖屏浏览／选点工具组与底部导航之间的空白，目标可见间距约 12pt，并随实际导航位置、安全区和机型适配。保留两组独立触控目标、导航宽度、右侧控件净空和实时大字号行为；完成后提供新构建的原始界面截图。
- R13：按用户最新截图统一调整地图搜索输入与查找／搜索提交按钮之间的间距，覆盖 Web、App DOM 和 UIKit 的输入／结果状态及桌面同类搜索入口。输入与提交需有清晰留白，短横屏、真实键盘及大字号下仍完整可达；不缩小字号或触控目标来换取间距。保留 A 分组、搜索状态和导航恢复行为。

## Scope exclusions

- 不重设计全站导航、其他页面、交换业务或桌面地图侧栏。
- 不变更 HTTP API、数据库、数据权限、地图供应方和地点搜索供应方。
- 本轮不增加输入实时联想、Apple Maps 数据服务、路线规划、收藏或搜索历史。
- 不包含制品发布或线上部署；原生实现完成后的本地调试构建和模拟器／设备验证属于验收。

## Acceptance criteria

- [ ] AC1 / R1、R2、R9：320×568、390×844、768×1024、900×1200、1023×768 都能直接找到搜索、筛选和两类名录，无水平溢出、重复入口或地图标题栏。
- [ ] AC2 / R3、R4：激活搜索入口后展开卡片并聚焦输入；显式提交后结果在卡片内展示；拖动和按钮均能调整展开程度；选点定位并收起，重新展开可回到结果，清除地点不改变筛选。地图可见区域仍可拖动与缩放。
- [ ] AC3 / R4、R5：空结果、429、503、地图／定位失败及长文案有可达恢复操作；ready 区域点数量在更多中可读，分页数量明确为已加载。
- [ ] AC4 / R1、R7、R9：844×390、667×375 与真实软键盘下输入、查找、取消／收起可达，正文滚动不推动地图或外壳。不得依赖测试自动滚动掩盖遮挡。
- [ ] AC5 / R6、R7：iOS 26+ 的输入和液态玻璃由 UIKit 原生渲染；新 A 实现经模拟器／设备验证键盘、拖动、选点、导航恢复和 native/DOM 互斥。浏览器截图只能证明 Web 回退。
- [ ] AC6 / R6、R7：Android、旧 iOS、不支持和同步失败时保留完整 DOM 搜索卡片；失败后能继续操作，且没有重复可见表面或拦截地图的原生残留。
- [ ] AC7 / R7、R8：筛选、名录、区域详情与来源 Dialog 互斥；从更多打开来源，关闭后恢复可见入口。切页、767↔768、1023↔1024 与旋转后清理失效面板并恢复焦点。
- [ ] AC8 / R8、R9：有／无 attribution、长地点名、明暗主题、减少动效／透明度、键盘与 VoiceOver 均可用；44×44 目标经几何及实际命中验证。1280×800 桌面既有流程通过回归。
- [ ] AC9 / R9、R10：Web／App 浏览、输入、结果、选点均与 A 的分组及阅读层级一致；手机 320／390／402／440 宽度无历史 360 上限，工具、右侧组和焦点环完整。真实运行截图与 A 单图并列检查；其他页面保持其形状规则。
- [ ] AC10 / R7、R9、R11：App DOM 在 320／375／390／402／414／440 CSS px 的竖屏浏览与选点状态，与实际底部导航左右边界对齐；原生在自有 402／440pt 及一个可用较小机型上，用运行截图核对导航的可见轮廓。边界误差不超过 2pt／CSS px；安全区、大字号、旋转和来源返回后仍可达，定位净空、44pt 命中及五标签恢复不退化。展开和短横屏分别按其可用布局验收。
- [ ] AC11 / R7、R9、R11、R12：当前 iOS 模拟器构建在 375／402／440pt 的浏览与选点状态，工具组至导航的可见间距为约 12pt（10 至 16pt），不重叠；正常和实时放大字号下文字完整，工具／导航至少 44pt、侧控件净空至少 12pt，来源关闭与旋转恢复不退化。交付标明平台、机型和当前包绑定的真实截图。
- [ ] AC12 / R1、R3、R7、R9、R13：新的 Web／App DOM／UIKit 原图和实际几何证明输入与提交按钮有一致留白。覆盖输入、结果、错误／空结果、窄竖屏、短横屏与键盘，正常基准约12px／pt，大字号可增加但不压缩。按钮和输入保持原命中尺寸，正文可滚动，收起及导航恢复通过；R7旧图与判定保留为历史。

## iOS appearance and refresh follow-up

The first usable search card must expose one recognizable refresh action without opening More, including pending or empty map data. Refresh still reloads directories through `loadFirstPage()`; it does not reload the map or submit a place search. The native card must match the existing light map chrome, resolve action tint from the current project palette, and preserve UIKit semantic colors and accessibility settings. Collapsed map feedback belongs above the card; expanded feedback belongs inside it, once.

This follow-up keeps the existing task and acceptance items. Native appearance, large text, keyboard and drag proof require a new simulator/device run; source checks alone do not satisfy those items.

## Native Liquid Glass correction

Keep this correction principally in UIKit, using the existing native bottom navigation as the material and interaction baseline. App map, results and selected-place surfaces show no standalone source notice. Complete loaded-style licensing and retained-results/selected-place search attribution remain accessible through the existing source Dialog, including when tile attribution is absent. Ordinary Web and desktop presentation retain their current notices.

Refresh busy state follows actual directory requests and blocks duplicate activation. Native press, loading and state changes use UIKit and respect Reduce Motion, including changes while controls are active. Preserve control identity, geometry, Dynamic Type, IME, readiness, modal exclusivity and cleanup. No provider, HTTP, dependency, global navigation or ordinary-content redesign is included.

## Planning status

用户已批准全部按 A 施工，继续现有 `in_progress` 任务和隔离工作树；无需新建任务或再次询问批准。旧实施与验证见 execution.md 和 verification.md，新实施记录独立保存，原目录和原图保持可追溯。
