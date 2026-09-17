# App 整体导航体验现状

## 最新决策与交接摘要

用户已批准一级导航为“首页、社区、资料、我的”，地图归入社区，Wiki 内部不变。以下“五个入口”描述的是本次调查时的代码基线，不是待用户重新选择的方案。父代理已反馈在真实 App target 浏览器确认五个旧 tab 和历史栈行为；这份反馈不包含原生栏重复点按或系统返回的设备证据。

| 关注点 | 实现位置与已有结论 |
| --- | --- |
| App 外壳 | `apps/web/app/layouts/app-layout.tsx:29`，组合顶栏、Outlet、底栏；交换地图根页是隐藏顶栏的整屏例外 |
| 路由清单与目标筛选 | `apps/web/app/route-metadata.ts:51` 定义路径、页面模块和 App/Web 目标；`apps/web/app/routes.ts:10`、`:32` 选择 AppLayout 并装配路由 |
| 主导航模型 | `apps/web/app/components/app/app-tab-model.ts:5` 的 `APP_TABS` 定义旧五栏；`:56` 的 `appTabIdForPathname()` 决定选中归属 |
| tab 点击 | `apps/web/app/components/app/app-tab-bar.tsx:169` 的 `activateTab()` 与 `:295` 的 `handleTabClick()`：切换到固定根路径，当前根页重复点击回顶，地图除外 |
| 顶栏返回 | `apps/web/app/components/app/app-top-bar.tsx:31` 的 `goBack()`：key 非 default 时沿全局历史退一步，否则回所属栏目根页；根页无返回按钮 |
| 滚动恢复 | `apps/web/app/components/app/app-tab-bar.tsx:134`、`:157` 管理根页 effect；`apps/web/app/lib/app-shell-scroll.ts:34` 按 tab id 存会话位置；`apps/web/app/layouts/root-layout.tsx:36` 另挂 Router `ScrollRestoration` |
| 原生重选事件 | `apps/web/src-tauri/plugins/native-glass/ios/Sources/NativeGlassPlugin.swift:300` 的 delegate 不比较 previousTab，仅排除 JS 同步选择，再由 `:314` 派发 route 事件。JS 能处理相同根路径并回顶；iOS 是否对重复点按实际触发此 delegate，仍待设备验证 |

已停止额外检索。新四栏的根路由、页面归属与返回语义以父任务方案为准，本研究不自行补定。

## 范围与证据

本研究采用用户最后确认的范围：全局主入口组织、跨栏目切换、页面层级与返回路径、导航状态连续性。Wiki 内部交互保持不变；整页内容排版重设计不属于本轮范围。中途读取的布局信息仅用于说明外层导航如何承载页面。

依据为 `release/v1.1` 当前工作树中的代码和测试。已读任务 `prd.md`、根目录 `.rules`、`apps/web/.rules` 与 Humanizer。已执行 `python3 ./.trellis/scripts/task.py current --source`，结果为 `Current task: (none)`、`Source: none`；按调用方明确指定的规划任务路径保存研究，没有激活任务。

相关行为以完整函数及其调用关系为依据。原生层和测试清单由只读子调查核对，主调查另读了 App 外壳、标签栏、顶栏、路由、导航辅助函数、状态存储与代表测试。未修改产品代码，未运行测试或构建，未访问外部库文档，未检查浏览器视觉，也未检索历史任务或规范。

下文路径均相对仓库根目录。

## 1. 当前导航结构

### App 与移动 Web 的边界

`apps/web/app/routes.ts:10` 在构建时读取 `VITE_IMS_APP_TARGET`，在 `routes.ts:32` 选择 `AppLayout` 或 `PublicLayout`。App 不是移动网页通过屏幕宽度换出的样式。

- App 使用顶栏、内容 Outlet、底部主导航和浮动操作。普通页由窗口滚动。见 `apps/web/app/layouts/app-layout.tsx:29` 的完整 `AppLayout()`。
- 普通 Web 的桌面导航、移动端右侧 Sheet、页脚来自 `apps/web/app/layouts/public-layout.tsx:13` 和 `apps/web/app/components/shared/site-header.tsx:73`。移动 Sheet 中点击入口会关闭菜单。这些控件不挂载到 App。
- `/apps`、`/account/me`、`/account/me/:section` 是 App 专属路由；现代 Wiki 和多数内容页为两端共享；经典 Wiki、后台路由只进入 Web。见 `apps/web/app/route-metadata.ts:306`、`apps/web/app/routes.ts:36`。

### 底部五个主入口

顺序和目的地来自 `apps/web/app/components/app/app-tab-model.ts:5`。中文名称来自 `apps/web/app/i18n/resources.ts:59`、`:66`、`:91`。

| 名称 | 根目的地 | 选中状态归属 |
| --- | --- | --- |
| 首页 | `/` | 首页及 `/information/*` 内容详情 |
| 社区动态 | `/events` | 动态列表与 `/events/*` 详情 |
| 站内应用 | `/apps` | `/apps/*`，以及 Wiki、剧情、作品、社区、名片墙、推荐、年表、关于、制作人地图等内容 |
| 地图 | `/community/exchange` | 交换地图与事务所详情；个人工作区除外 |
| 帐号 | `/account/me` | `/account/*`，以及旧路径 `/community/exchange/me/*` |

归属函数 `appTabIdForPathname()` 在 `apps/web/app/components/app/app-tab-model.ts:56`：先判帐号，再判交换地图，再判宽泛的 Apps 前缀。它会去掉路径末尾斜杠。未知路径不选中任何 Web fallback 标签；原生更新也不会强行把未知路径改选为首页。

需要区分两个地图页面：底栏“地图”前往 `/community/exchange`；`/producer-map` 是地区与社群目录页，归“站内应用”，不是底栏地图根页。

### 首页、目录与帐号的入口组织

- App 首页保留动态、生日和活动内容，隐藏 Web 首页的 `PortalDirectory`。其底部“社区与支持”读取 `friend`、`support` 链接。见 `apps/web/app/pages/home/index.tsx:23`、`apps/web/app/pages/home/components/app-home-links-footer.tsx:9`。
- `/apps` 读取首页链接接口中的 `data.sections.navigation`，显示“全部入口”，采用两列卡片，较宽屏幕三列。具体条目和排序由接口数据决定，不能把 E2E fixture 当成线上目录。见 `apps/web/app/pages/apps/index.tsx:25`、`apps/web/app/components/homepage/homepage-links.tsx:65`。
- 首页动态区域可进入 `/events` 和 `/events/:id`。见 `apps/web/app/pages/home/components/home-feed.tsx:12`、`apps/web/app/pages/home/components/home-feed-items.tsx:37`。
- 帐号根页中，匿名用户可去登录、注册、重置密码；登录用户可去个人资料、名片、收藏、事务所、认领等 section，并有帐号安全、主题、关于、退出。App 使用 `/account/me/:section` 表达这些层级；无效 section replace 回根页。见 `apps/web/app/pages/account/me/account-me-page.tsx:61`、`apps/web/app/pages/account/me/account-me-section-page.tsx:8`。
- 交换地图的 App 浮动操作为筛选、事务所和名片。“我的”交给外层帐号入口；普通移动 Web 的地图内部另有“我的”。见 `apps/web/app/pages/community/exchange/components/exchange-mobile-navigation.tsx:45`、`:194`。

### 外层承载关系

顶栏高度为 `3rem + safe-area-top`。普通页底部预留 `5.25rem + safe-area-bottom`，浮动操作位于 `6rem + safe-area-bottom`；这些值集中在 `apps/web/app/app.css:1032`。`PageShell()` 给使用它的 App 页面提供横向安全区和 `py-5`，宽度有 read/default/wide 三档，见 `apps/web/app/components/shared/page-shell.tsx:12`。

`/community/exchange` 是唯一被 `isNonScrollingAppRoute()` 判为整屏、非窗口滚动的根页。它保留底栏，隐藏顶栏、普通背景和回顶操作，内容使用 `h-dvh overflow-hidden`。其他路由，包括事务所详情和 `/producer-map`，恢复普通文档外壳。见 `apps/web/app/lib/app-shell-scroll.ts:30`、`apps/web/app/layouts/app-layout.tsx:35`、`apps/web/app/components/app/app-top-bar.tsx:22`。

这能证明外层占用和显示规则，不能仅凭 CSS 数值断言内容已经被遮挡。视觉核对由父代理负责。

## 2. 已证实的交互行为

### 跨栏目切换与重复点按

Web fallback 的五个 `NavigationLink` 都直接指向根路径。原生选择事件也把固定根路径交给 `activateTab()`。没有在此层维护“每个栏目最后访问的详情路径”。例如，从 `/story/modern?...` 切到动态再点“站内应用”，目的地是 `/apps`。

在栏目根页重复点当前标签，会请求回到页面顶部，不新增这次导航；地图根页不回顶。在栏目详情页点当前所属标签，则前往栏目根页。Web fallback 会排除修饰键和非主鼠标按钮，并在回顶前把该栏目缓存位置设为 0；原生分支直接调用回顶。见 `apps/web/app/components/app/app-tab-bar.tsx:169` 的 `activateTab()`、`:295` 的 `handleTabClick()`、`:363` 的渲染入口，以及 `apps/web/app/lib/app-shell-scroll.ts:93` 的 `scrollAppViewToTop()`。

标签的颜色、透镜位置及 `aria-current="page"` 由 pathname 归属决定，而不是由用户从哪个入口到达决定。原生通过 selectedIndex 同步。见 `apps/web/app/components/app/app-tab-bar.tsx:104`、`:365`。

### 根页与详情返回

`AppTopBar()` 的规则见 `apps/web/app/components/app/app-top-bar.tsx:16`：

1. 首页显示品牌与主题切换；其他非地图根页显示栏目名称，都没有返回按钮。
2. 地图根页完全隐藏顶栏。
3. 非根页显示返回按钮，标题仍是所属栏目名，如作品详情、名片墙和 Wiki 外层都显示“站内应用”，不是具体页面标题。
4. `goBack()` 以 `location.key !== "default"` 判断是否执行 `navigate(-1)`。若 key 为 `default`，导航到所属栏目根页；未知归属则到 `/`。

这里没有检查上一条历史是否属于同一栏目。因此“返回”在正常历史下是回上一条记录，不保证回内容父级。初次直达 `/account/login` 回 `/account/me` 已有单测。根页之间的标签切换使用常规 Router 导航，没有 `replace` 参数，使用同一个 Router 历史。见 `apps/web/app/lib/navigation/use-navigation.ts:17`。

动态详情在 App 隐藏页面自带“返回社区动态”，依赖外层返回；名片墙也隐藏 Web 的“返回社区”。见 `apps/web/app/components/editorial/community-post-detail.tsx:115`、`apps/web/app/pages/community/community-cards-page.tsx:491`。帐号根页、动态根页已把内部同名 H1 隐藏为 `sr-only`；其他内容页仍用内部 H1 给出页面身份。这是当前标题分工，是否改为具体页面名需要产品决定。

### 状态连续性

| 状态 | 当前机制 | 能证明的范围 |
| --- | --- | --- |
| 每个栏目根页的窗口位置 | `sessionStorage["ims:app-tab-scroll"]` 按 tab id 保存；离开根页的 effect cleanup 记录 `window.scrollY`，进入根页后一个 RAF 恢复 | 只处理匹配 tab 根路径的可滚动页；不保存各栏目最后的详情 URL |
| 浏览历史的滚动 | 根文档挂载 `<ScrollRestoration />` | 代码有 Router 滚动恢复入口；不能推导所有异步内容场景都已正确恢复 |
| 交换地图筛选 | `city`、重复 `series`、`open` 在 URL 中；App 会话还存默认筛选 | URL 已带筛选时优先使用 URL；没有相关参数时可读会话默认值 |
| 交换地图视口 | App 在移动结束和卸载时保存中心、缩放；重新进入读取合法会话值 | 对地图有专门恢复，不是由根页 `scrollY` 处理 |
| 帐号 section | `/account/me/:section` | 可进入历史、可直达；再次点帐号标签仍到根页 |
| 名片墙与预览 | 分页、页大小写 URL；关闭预览恢复触发焦点、窗口和祖先滚动位置 | 这是预览返回机制，不能视作栏目栈；预览支持按钮跨页、翻面、缩放和平移，未实现滑动换卡 |
| 制作人地图 `/producer-map` | 搜索和地区筛选为组件 state | 不在 URL 或会话中，重挂载会初始化；是否需要跨栏目保留尚未确定 |

依据：`apps/web/app/components/app/app-tab-bar.tsx:134`、`:157`；`apps/web/app/lib/app-shell-scroll.ts:34`；`apps/web/app/layouts/root-layout.tsx:36`；`apps/web/app/pages/community/exchange/exchange-map-model.ts:62`、`:91`、`:127`、`:135`；`apps/web/app/pages/community/exchange/exchange-office-map.tsx:823`；`apps/web/app/pages/community/community-cards-page.tsx:335`；`apps/web/app/pages/community/hooks/use-namecard-preview-return.ts:49`；`apps/web/app/pages/community/hooks/use-namecard-preview-navigation.ts:67`；`apps/web/app/pages/producer-map/index.tsx:316`。

Wiki 只记为保留边界：目录 `/wiki`、`/wiki/modern` 和剧情 `/story`、`/story/modern` 仍属于 Apps，目录企划选择写 `agency` 并使用 `preventScrollReset`。见 `apps/web/app/pages/wiki/modern/index.tsx:131`。本研究不提出改动转盘、搜索、企划切换或剧情内部导航。

### 系统入口与原生边界

`NavigationLink` 与 `useNavigation` 共用 `resolveNavigation()`：普通站内路径走 Router，服务器资源走文档导航，App 的外链和显式公开站点页面走系统打开，Web-only 入口在 App 隐藏。外链打开失败显示提示。见 `apps/web/app/lib/navigation/resolve-navigation.ts:107`、`:173`，`apps/web/app/components/navigation/navigation-link.tsx:29`。调整目录时要保留这种目的地语义。

iOS 原生 tab bar 要同时满足 App target、Tauri、iOS runtime 检测，并由 Swift 检查 iOS 26 支持。失败时保留或恢复 React fallback。见 `apps/web/app/lib/native-glass.ts:57`、`apps/web/src-tauri/plugins/native-glass/ios/Sources/NativeGlassPlugin.swift:140`、`apps/web/app/components/app/app-tab-bar.tsx:218`。`didSelectTab:previousTab:` 不比较 previousTab，只排除 JS 同步选择，因此代码不会主动丢弃相同 tab 的选择回调；route 事件交给同一 `activateTab()`。系统是否在重复点按时触发该回调，仍待设备验证。原生 overlay 只拦截 tab bar 区域触摸，其余穿透 WebView，见 Swift 文件 `:70`、`:300`、`:314`。

Dialog、Sheet、AlertDialog 使用引用计数隐藏原生栏，最后一个释放时恢复；React fallback 并未由该状态移出 DOM，内容底部预留也不随原生栏隐藏而改变。见 `apps/web/app/lib/native-tab-bar-suppression.ts:14`、`apps/web/app/components/ui/dialog.tsx:55`。这是当前 modal 与外层导航的衔接方式，未据此断言遮挡缺陷。

在 `apps/web/app/**/*.{ts,tsx,css}`、`apps/web/src-tauri/src/**/*.rs` 和 native-glass 自有插件源文件范围内，未找到系统返回接管、iOS 边缘返回配置或 Android `OnBackPressedDispatcher` 实现。没有读取生成目录、依赖内部或运行设备，因此系统默认返回行为仍未验证，不能说系统返回不可用。

## 3. 最多五项候选验证与改进议题

入口结构已有上述四栏决策。下列其余议题仍区分现有行为与待验证风险，不自动转成需求。

| 候选议题 | 证据性质与位置 | 用户影响与应验证场景 |
| --- | --- | --- |
| 从旧五栏迁移到已批准的四栏 | 已证实行为。`app-tab-model.ts:38` 将多数内容收进 Apps；`pages/apps/index.tsx:25` 读取统一目录；App 首页不显示该目录 | 新一级入口已确定为首页、社区、资料、我的，地图归社区。需要在方案中映射原有入口与深层路径，保持 Wiki 内部行为 |
| 切回栏目应到根页还是续看详情 | 已证实行为。`app-tab-bar.tsx:169`、`:363` 总是使用固定根 URL，只保存根页滚动位置 | 详情中切走后再点原栏目会到目录，不能凭该标签回到刚才详情。用“作品详情 → 动态 → 站内应用”确认用户希望看到哪里；Wiki 内部功能不改 |
| 返回上一页与返回父级的预期 | 已证实行为。`app-top-bar.tsx:31` 使用全局历史，key 为 default 才回所属根页；`:43` 起根页无返回 | 从不同栏目进入同一详情时，返回目的地可不同。需要定义跨栏目进入、冷启动直达和根页连续切换后的行为，不宜直接把历史返回判成错误 |
| 根页位置能否在内容加载后稳定恢复 | 已证实机制加推测风险。`app-tab-bar.tsx:144` 只在一个 RAF 中恢复，`:165` 在 cleanup 读窗口位置；根文档同时挂 `ScrollRestoration` | 在长列表、较慢数据或返回时文档较短的情况下，可能恢复不到原位置。尚无跨栏目集成测试证明失败；应以“滚动动态 → 帐号 → 动态”实测后决定是否修复 |
| 触屏及系统返回是否与页面规则一致 | 待设备验证。原生 delegate 见 Swift `:300`；顶栏规则见 `app-top-bar.tsx:31`；现有 App E2E 使用浏览器 | 检查 Android 系统返回、iOS 边缘返回、原生当前标签重选以及打开 modal 时返回。当前证据只说明这些原生链路没有被现有浏览器测试证明，不能判定已坏 |

表内简写路径分别指 `apps/web/app/components/app/` 下的同名文件和上文完整路径。没有将整页留白、通用触控尺寸或 Wiki 内部交互列为问题。

## 4. 已定结构之外的产品取舍

一级导航名称与地图归属已经确定。当前证据没有决定以下细节；由父任务结合已有对话确认，不重复询问已批准的结构：

- 四个栏目各自的根路由、现有内容的完整归属与目录组织。地图归社区已经明确；其他细分映射不能只按旧路径前缀决定。
- 点击别的栏目后再切回来，是到根页、恢复最后详情，还是保留每个栏目的独立浏览历史。重复点当前栏目是否继续回顶或回根，也应一起确定。
- 详情顶栏显示所属栏目名还是具体页面名；返回按钮遵循历史还是固定父级；直达详情没有历史时的落点。
- 底栏是否在所有详情页持续显示，地图是否继续整屏；这是导航可达性的决定，不自动包含内容排版重设计。
- 连续性要求覆盖哪些状态：只保留位置，还是分页、筛选、详情路径；仅在本次 App 会话内，还是重启后继续。
- 设备验收优先级：iOS 原生栏、iOS fallback、Android 系统返回分别需要什么操作结果。Wiki 内部交互是保留边界。

底栏缩减为四个栏目已经获批。首页是否合并目录、是否引入每个栏目的独立历史，尚不能由这项批准推导。

## 5. 已有测试与验证入口

### 已读覆盖

| 测试路径 | 当前覆盖 |
| --- | --- |
| `apps/web/tests/unit/components/app/app-tab-model.test.ts:10` | 五根顺序、路径归属、帐号优先于地图、末尾斜杠、未知路径 |
| `apps/web/tests/unit/components/app/app-tab-bar.test.tsx:56` | fallback、原生安装后隐藏 fallback、原生选择事件、主题、modal 隐藏、Apps/Account 归属、未知路径；原生调用为 mock |
| `apps/web/tests/unit/components/app/app-top-bar.test.tsx:33` | 首页主题、从 `/works/sample` 按历史回 `/apps`、初始 `/account/login` 回 `/account/me` |
| `apps/web/tests/unit/lib/app-shell-scroll.test.ts:8` | 各 tab 位置独立存取、非负值与非法存储处理 |
| `apps/web/tests/unit/layouts/app-layout.test.tsx:67` | 顶栏和安全区、地图整屏、浮动操作与名片分页避让 |
| `apps/web/tests/unit/components/navigation/navigation-link.test.tsx:49`、`apps/web/tests/unit/lib/navigation/resolve-navigation.test.ts:23` | Router/document/system/Web-only 决策与外链失败；不是实际系统浏览器调用 |
| `apps/web/tests/unit/lib/native-glass.test.ts:23`、`apps/web/tests/unit/lib/native-tab-bar-suppression.test.ts:10` | runtime gate、plugin command、事件数据和多 modal 引用计数；不调用真实原生插件 |
| `apps/web/tests/e2e/app-shell.spec.ts:93` | 五个标签可见、注入安全区 token、无横向溢出；实际点击 Apps 并断言 URL 和选中状态 |
| `apps/web/tests/e2e/app-events.spec.ts:392` | 首页到动态列表、合成下拉刷新、延迟图片下列表稳定、分页、详情、外层返回列表、底栏避让；返回前已滚到列表顶部，没有断言深滚动恢复 |
| `apps/web/tests/e2e/app-interactive-pages.spec.ts:46` | 作品详情归属与视口、Tier List 控件避让；仅小屏与横屏项目 |
| `apps/web/tests/e2e/app-wiki.spec.ts:72` | App 外层安全区下 Wiki 转盘与搜索可达。作为 Wiki 保留边界回归，不新增内部改造 |

早期范围还读取了 Wiki 转盘拖动与 App 几何单测，以及普通 Web 的 `apps/web/tests/e2e/wiki-mobile.spec.ts:6`、`:67`。它们验证企划切换保留滚动、鼠标旋转与合成 pointer 拖动；不等于真实触屏或 Tauri 测试，本轮无需深入。

限定检索 `apps/web/tests` 并核对相关测试后，没有找到直接验证“跨栏目后恢复根页滚动”的集成测试，也没有找到当前根标签重复点按回顶的直接操作测试。存储单测不能证明这些交互链路；`app-tab-bar.test.tsx` 也没有直接测试重复点按。

App Playwright 项目名为 `app-small`、`app-iphone`、`app-android`、`app-landscape`、`app-webkit`，见 `apps/web/playwright.app.config.ts:34`。这些均是浏览器项目，iPhone 和横屏项目显式用 Chromium，只有 app-webkit 使用 WebKit。测试通过 CSS 注入模拟安全区，不证明原生屏幕 inset；原生返回、手势和栏重选需设备验证。

### 适用命令

以下从仓库根目录执行。本研究仅核对入口，没有运行。需要已安装 workspace 依赖；浏览器测试还需对应 Playwright 浏览器。仓库要求 Node >=22.13.0、pnpm 11。

聚焦全局导航单测：

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/components/app/app-tab-model.test.ts tests/unit/components/app/app-tab-bar.test.tsx tests/unit/components/app/app-top-bar.test.tsx tests/unit/lib/app-shell-scroll.test.ts tests/unit/layouts/app-layout.test.tsx
```

导航目的地与原生桥接单测：

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/components/navigation/navigation-link.test.tsx tests/unit/lib/navigation/resolve-navigation.test.ts tests/unit/lib/native-glass.test.ts tests/unit/lib/native-tab-bar-suppression.test.ts
```

先验证浏览器内主入口与返回，再用 Wiki 用例检查保留边界：

```sh
pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-shell.spec.ts tests/e2e/app-events.spec.ts tests/e2e/app-wiki.spec.ts --project=app-small --project=app-webkit
```

完整 App 浏览器回归入口：

```sh
pnpm --filter @imsweb/web run test:e2e:app
```

`apps/web/package.json:23` 的 test:unit 是 Web target 的 Vitest；App 分支由相关单测自身 stub/mock 环境，不会启动服务器或构建。`apps/web/playwright.app.config.ts:26` 默认自动启动 `pnpm dev:app`，不先 build；若设置 `E2E_APP_BASE_URL` 则由调用者提供已经运行的 App target 服务。父代理负责核对启动脚本，本报告不扩展启动流程。

若方案改路由归属，另运行根入口 `pnpm run test:web-routing`；它用于构建产物的 Web/API 路由与打包资源契约，不能代替 App 操作验证。原生验收沿用 `pnpm run app:doctor`、`pnpm run app ios`、`pnpm run app android` 设备入口；本研究没有执行或判断设备是否可用。

## 6. 推荐父代理深入阅读的六个路径/函数

1. `apps/web/app/components/app/app-tab-model.ts` 的 `APP_TABS`、`appTabIdForPathname()`：主栏目与内容归属的单一入口。
2. `apps/web/app/components/app/app-tab-bar.tsx` 的根页恢复 effects、`activateTab()`、`handleTabClick()`：跨栏目、当前标签重选和原生同步。
3. `apps/web/app/components/app/app-top-bar.tsx` 的 `AppTopBar()`、`goBack()`：根页、详情页、历史与直达回退。
4. `apps/web/app/lib/app-shell-scroll.ts`：保存的是根页位置，而不是每栏目的完整浏览栈。
5. `apps/web/app/layouts/app-layout.tsx` 的 `AppLayout()`：导航始终显示的范围、地图例外与浮动操作关系。
6. `apps/web/tests/e2e/app-events.spec.ts` 的 `App community flow respects safe areas and stable list geometry`：现有完整路径的操作证据，可据已选方案扩展跨栏目和返回验收。
