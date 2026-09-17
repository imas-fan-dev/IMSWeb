# App 全局导航技术方案

状态：完整方案已获用户批准，开始在导航 worktree 中实施。产品要求以 [prd.md](prd.md) 为准。

## 改动边界与当前行为

`apps/web/app/routes.ts` 已按构建目标选择 AppLayout 与 PublicLayout。本轮复用现有路由清单和页面地址，在 App 外层及其目录入口完成五栏调整，普通 Web 的导航结构不变。

规划时记录的旧实现：

- `app/components/app/app-tab-model.ts` 定义五栏，多个内容域归入 apps。
- `app/components/app/app-tab-bar.tsx` 的原生和 Web 点击分支都会前往固定根路径；两个 effect 只尝试保存、恢复根页位置。
- `app/lib/app-shell-scroll.ts` 管理窗口滚动与整屏地图例外，旧位置保存在 `ims:app-tab-scroll`。
- `app/layouts/root-layout.tsx` 另外挂载 React Router `ScrollRestoration`。现有根页恢复与它的执行顺序需要在交互测试中处理。
- `app/components/app/app-top-bar.tsx` 沿实际历史返回，初始入口回栏目根页；顶栏显示栏目名。
- `app/pages/community/index.tsx` 已有名片、交换地图、全国支部地图及 App/Web 分支；`app/pages/apps/index.tsx` 是 App 专属目录。

以上路径均相对 `apps/web`。代码与浏览器证据见 [现状调查](research/navigation-current-state.md) 和 [浏览器记录](research/navigation-options.md)。

## 一级入口与路径归属

`app-tab-model.ts` 继续作为标签与归属的单一来源。保留 home、map、account 的内部 ID，将 events/apps 改为 community、resources；所有调用者和测试在同一次改动中迁移。

| ID | 显示名 | 根地址 | Lucide ID |
| --- | --- | --- | --- |
| home | 首页 | `/` | `house` |
| community | 社区 | `/community` | `users` |
| map | 交换地图 | `/community/exchange` | `map-pinned` |
| resources | 资料 | `/apps` | `book-open-text` |
| account | 我的 | `/account/me` | `circle-user` |

归属判定按以下优先级执行，保留末尾斜杠规范化与未知路径不强行选中首页的行为：

1. `/account`、`/community/exchange/me` 及子路径、`/about` 归 account。
2. `/community/exchange` 及公开子路径归 map；个人工作区已由上一条优先处理。
3. `/community`、`/events`、`/producer-map` 及子路径归 community。
4. `/apps`、`/wiki`、`/story`、`/works`、`/chronicle`、`/recommendations`、`/live`、`/tier-list`、`/packages` 及子路径归 resources。
5. `/` 与 `/information` 下内容归 home。
6. 未知路径返回空归属。外链和 Web-only 页面继续由现有导航解析器决定如何打开。

`/community/cards/submissions/:id` 归社区；个人工作区的旧路径在通用社区前缀之前判定。路径归属与用户进入来源无关，来源只影响实际历史返回。

使用 App 专属翻译键表示五栏名称，避免把共享的社区动态或帐号文案一起改名。沿用仓库已支持的中文和英文资源，保持翻译键完整；本轮不新增语言。

## 栏目首页与目录

交换地图直接出现在底栏中，中文显示「交换地图」，英文显示「Map」。入口不等待社区目录请求；服务不可用时沿用地图页面的错误和重试处理。地图根页重选保留 URL、筛选和视角，不触发窗口回顶。公开事务所详情由 map 快照独立保存，不覆盖社区名片阅读位置。

社区复用现有页面。App 分支增加社区动态入口，保留名片墙、交换地图和全国支部地图。交换区关闭、检测中和检测失败继续使用已有可用性判定；不能把被服务关闭的功能包装成已可用。普通 Web 的标题、游戏入口和布局沿用现状。

资料复用 `/apps` 与 `HomepageLinkGrid`，以 Wiki、剧情等资料和工具入口为目录主体。目录仍读取 `useHomepageLinks()`，复用现有解析、缓存、失败重试与空状态；不新增接口或复制 API 响应到导航状态中。

目录整理按规范目的地判断归属，不按标题猜测，也不硬编码 E2E fixture 中的线上条目清单。社区、我的已有标准入口放在各自首页。合并重复入口时只有相同规范地址可去重，带参数的别名和预设链接不能直接丢弃；这类扩展项可保留在资料页的扩展入口区。无法明确归组的外链和扩展入口也保留在该区，并沿用 `NavigationLink` 的系统浏览器和可用性语义。加载失败时仍保留已知的核心导航入口，并为动态目录显示重试状态；不伪造接口数据。

我的沿用 `/account/me` 的匿名、加载、错误、受限和登录状态页面，更新 App 页名和栏目归属。现有登录、个人工作区、主题、关于与帮助入口不迁入资料，不重设计身份流程。

## 导航状态与数据流

增加 App 所有的导航协调层，放在 AppLayout 内，为顶栏、原生底栏和 Web 回退底栏提供同一组动作。纯状态逻辑与 React/DOM 副作用分开，建议分别放在 `app/lib/app-navigation-state.ts` 和 `app/components/app/app-navigation-provider.tsx`。

每个栏目记录当前 App 生命周期内的最近页面快照：

- 完整的站内地址：pathname、search、hash。
- 可滚动文档的窗口位置。
- 关联的路由提交标识，用于拒绝过期的恢复任务。

快照只描述导航和位置。无需新增依赖、HTTP JSON 契约、页面数据缓存或常驻的隐藏页面树；不序列化任意 `location.state`、表单草稿和弹层状态，不把会话令牌写入存储。五栏最近页快照留在内存，本轮不承诺刷新或进程重启后续看。地图已有的会话筛选和视角存储继续由地图所有。

数据流：

```text
Web 标签点击 / iOS 选择事件
  → 统一 activateTab(tabId)
  → 在发起跳转前记录当前地址和窗口位置
  → 根据当前栏目、根路径和目标快照决定动作
  → 通过 useNavigation 进行现有 Router 导航
  → 路由提交后核对目标标识
  → 恢复目标位置或完成回根/回顶动作
```

正常页面链接和页面内跳转仍走现有 `NavigationLink` / `useNavigation`。协调层观察已提交的位置，更新栏目的最近地址；不重写页面点击事件，不包装浏览器 history API。

动作规则：

| 条件 | 动作 |
| --- | --- |
| 点击不同栏目，有有效快照 | 导航到快照地址并恢复阅读位置 |
| 点击不同栏目，无快照 | 导航到该栏目根页顶部 |
| 点击当前栏目，当前是子页面 | 导航到根页顶部，并以根页替代旧的最近页 |
| 点击当前栏目，已在根页 | 仅回顶；保留地址、参数和历史长度 |
| 地址未知或快照已不属于该栏目 | 丢弃该快照并回相应根页 |
| 恢复过程中出现更新的导航 | 取消旧恢复，只有最后一次有效动作能控制位置 |

路由提交前的连续点按按 pending request 的 `tabId` 与完整地址判断，不再只读尚未提交的 `useLocation`。来源在第一次排队前保存，排队期间禁止旧文档覆盖新意图。A → B → A 是往返续看，之后再点 A 才是重选；即使重选根页又立即切走，下次也应进入已请求的根页。该规则由同一 React 提交前的批量单测和同一事件轮次的浏览器点击固定覆盖。

Web 标签仍是带正确 `href` 的链接；仅拦截普通主按钮点击，保留修饰键和辅助点击。原生事件先按五栏根地址允许列表解析，再转换为 tab ID，不将原生事件中的任意字符串当目的地。

## 滚动恢复与页面状态

移除底栏中只负责根页的两套 effect，统一由协调层管理显式栏目切换的保存和恢复。旧 `ims:app-tab-scroll` 数据不迁成新的详情快照；不需要删除用户的其他存储。

普通浏览历史继续由现有 Router 滚动恢复机制管理。显式栏目恢复使用 `preventScrollReset` 配合自己的目标位置，防止先恢复后被自动归零。需要以浏览器测试证明二者不会争抢；若必须调整共享根布局，只允许 App 条件分支，普通 Web 的 `ScrollRestoration` 保持原行为。

位置保存发生在导航开始前，不能在路由切换后的 cleanup 中把目标页的零位置记到来源页。初始恢复使用即时定位，非零目标最多保留五秒的尺寸和锚定观察，内容第一次达到目标高度后仍处理迟到的增长。零位置即时完成。下一次导航、组件卸载、用户开始滚动或期限到达时，都要清理观察器与待执行帧；不能无限轮询，也不能持续把主动滚动的用户拉回旧位置。

恢复保留 URL 中已有的分页、筛选和 hash。页面内容已缩短时定位到当前可用范围；错误页也不能让恢复任务一直存活。地图由 `isNonScrollingAppRoute()` 排除出窗口恢复，继续使用其原有 URL、筛选和视角逻辑。Wiki 内部的参数更新与 `preventScrollReset` 不改。

身份变化后避免恢复不再适用的个人工作区地址；这只清理导航快照，页面访问权限仍由现有帐号逻辑负责。

## 返回、顶栏与全屏地图

本轮保留一份实际浏览历史。顶栏通过已知 App 导航记录判断能否返回；缺少可用来源时回栏目根页，避免仅凭一个非 default key 误判外部历史。直接入口的兜底使用替换导航，防止在兜底页和原入口之间来回循环。

不引入栏目私有返回栈。栏目切换和恢复仍是正常历史记录，因此从名片墙切去我的、再切回名片墙后，返回会回到我的。用户通过重选社区标签回社区首页。此规则在最终方案摘要中明确展示。

顶栏继续显示所属栏目名，详情身份由页面内标题提供。原先作为一级入口的社区动态页恢复紧凑的可见 App H1，并使用外壳提供的横向安全区。五个栏目根页不显示返回。`AppTopBar` 对交换地图的隐藏判断依赖 `isNonScrollingAppRoute()`，公开事务所详情仍有顶栏与返回；地图的全屏模式、安全区和内部控件不变。

## 原生底栏与视觉边界

React fallback 的透镜宽度由标签数量派生，移除固定除以 5 的几何表达式。沿用已有高度、底部距离、选中动画、触控面积、安全区和 reduced-motion 规则，不加入新的指针跟随高光。

iOS 继续由 Swift `UITabBarController` 决定尺寸、材质与动画。已核对 `NativeGlassPlugin.swift` 的选项来自动态 items；JS 同步选中状态不会向上重复派发事件。是否收到真正的当前标签重选事件仍需要设备验证。

五个 Lucide ID 对应的 PDF 与 `Contents.json` 已存在于 `src-tauri/plugins/native-glass/ios/Sources/Resources/Lucide.xcassets`。`src-tauri/build.rs` 的 `LUCIDE_TAB_ICONS` 必须按五栏顺序复制这些 ID，并核对打包后的主 Asset Catalog。否则 `UIImage(named:)` 加载失败会让原生栏回退。复用已有 `users` 和 `book-open-text` 资源，不新建图标、不手改 `src-tauri/gen/`。

只有设备证据表明现有 delegate 无法传达重选时才修改 Swift 事件处理；仍使用当前 route 事件形状，保留 scene、权限、plist 和弹层抑制行为。

## 文件范围

主要实现文件：

- `app/components/app/app-tab-model.ts`、`app-tab-bar.tsx`、`app-top-bar.tsx`。
- 新增的 App 导航状态与协调组件，以及 `app/layouts/app-layout.tsx`。
- `app/lib/app-shell-scroll.ts`；必要时是 `app/layouts/root-layout.tsx` 的 App 条件分支。
- `app/pages/community/index.tsx`、`app/pages/apps/index.tsx`、`app/pages/account/me/account-me-page.tsx` 与其必要的 App 目录辅助组件；`app/pages/events/index.tsx` 只恢复 App 页内标题。
- `app/i18n/resources.ts`、`src-tauri/build.rs`，原生插件 README 和图标资源说明。
- 对应单测、App E2E、原生资源一致性检查，以及描述现有导航行为的 Web README/DESIGN 和 Trellis 规范。

不改 Wiki、名片预览和地图业务组件；若实现发现必须修改这些所有者才能满足已确认行为，先用证据说明原因并修订方案，不能顺手扩大范围。

## 验证与风险

验证命令、执行顺序及证据要求见 [implement.md](implement.md)。重点风险是异步内容导致的位置恢复失败、快速切换留下的过期任务、路径迁移后个人工作区归属错误、遗漏原生图标，以及原生重选事件在设备上的实际行为。

规划阶段浏览器检查只证明壳层和路由行为。实施阶段使用严格的 API fixture 覆盖成功、失败和延迟，并已启动本地 API 检查真实页面；结果以 [验证记录](validation.md) 为准。测试数据不作为线上目录配置的事实来源。

无后端或数据迁移。回滚时撤回本任务的 App 导航、目录与资源复制改动；既有 URL 不变，旧客户端不需要数据修复。保留工作区已有的发布说明脚本修改和其他任务记录。
