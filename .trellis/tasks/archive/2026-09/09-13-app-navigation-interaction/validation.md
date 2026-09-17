# App 导航实施与验证记录

## 工作区与范围

实现目录为 `/Users/texas/Workspace/IMSWeb/.worktrees/app-navigation-interaction`。按用户要求，与原目录共同检出 `release/v1.1`；临时分支 `codex/app-navigation-interaction` 已删除。任务状态为 `in_progress`，implement/check 清单各有 10 条引用。

初始基线为 `8123bddcd80938b6ca39f5f19d17ef27d564f2ea`。共享分支前进后，已同步至 `fb5a7cbe2f37aeb7392751d236c88654060647a2`：46 个上游路径与 30 个导航修改无交集，SHA-256 核对确认导航内容未变，索引清空。备份在 `data/qa/app-navigation-base-sync/`。原目录的发布说明、邮件 Worker 任务等并行工作不属于本次提交。

最终五栏「首页、社区、交换地图、资料、我的」已完成实现与验收，公开交换区归 map；包含 URL 与阅读位置续看、重选、实际历史返回和原生图标打包。以下保留四栏阶段的诊断历史，最终五栏结果见「追加交换地图底栏入口」及文末验收结论。普通 Web 导航及 Wiki 内部交互保持原有范围。相关名片任务的原生键盘分页后旋转问题不纳入本次导航修复。

## 环境

- worktree 的 `pnpm install --frozen-lockfile` 已成功。初次 `dev:doctor`、`app:doctor`、设备清单检查均通过；重查报告 Valkey 6379 端口占用，本轮继续使用已能提供 API 的本地环境。
- 本地 API 为 `http://127.0.0.1:3101`，普通 Web 为 `http://127.0.0.1:5176`，服务任务 `babab54bc`。
- App preview 的 API 代理指向 3101。旧任务 `b16f0ff0b` 已停止，重启任务为 `b0aa18c2e`，地址 `http://localhost:1420`。
- iOS 目标：iPhone 18 Pro，iOS 27，`5607CB3B-7E75-45D6-B1F1-618F05A397E3`。Android：`Pixel_10_Pro` AVD，`emulator-5554`。
- 本地名片 API 返回 680 张、57 页。交换系列 API 返回 404 `Not Found`，社区目录按既有规则隐藏该入口；新增底栏入口保持可达，地图数据成功状态使用严格 fixture 验证。

## 已完成的检查

| 检查 | 结果与范围 |
| --- | --- |
| `task.py validate` | 规划与上下文清单通过 |
| `node --check tests/tauri-build-configuration.test.js`、`rustfmt --check apps/web/src-tauri/build.rs` | 图标检查与 Rust 清单语法、格式通过 |
| 同步基线后 `test:infra`，`b2fd25d23` | 通过，包含模型图标与 Rust 清单一致、有效矢量资源断言 |
| 同步基线后 `check:web`、`check:rules`、`check:boundaries`，`bf4442024` | 180 文件、1081 项单测通过；lint、typecheck、普通 Web 构建、Classic Wiki CSS、文档与边界检查通过。此轮早于下述最终修复 |
| 最终聚焦单测 | 2026-09-13 19:24，5 文件、77 项通过，覆盖身份边界、协调层、状态、滚动、栏目模型和动态标题 |
| 完整检查，`bedaeace7` | ESLint 通过，tsc 报 5 处可空 pending 类型错误；已改为捕获明确的 pendingTarget 对象并使用空值守卫 |
| 修正后的完整检查，`bfcca825b` | 180 文件、1100 项单测、lint、typecheck、普通 Web 构建、Wiki CSS、规则和边界检查全部通过；早于后续动态页滚动修复 |
| 最终源码检查，`b18527c02` | 180 文件、1101 项单测通过；lint、typecheck、普通 Web 构建、Classic Wiki CSS、文档与边界检查均通过，包含最终动态页修复 |

## 复现与修复

早期五视口矩阵 `b684248bd` 为 65 通过、16 跳过、9 失败。七处为过时或未限定主导航的断言；另两处揭示了提交前快速往返被当成重选的问题。已固定为单测并按最新 pending 意图判断，保留 query/hash，禁止旧来源覆盖新选择。

复核 `d994f169-a052-47d` 指出身份切换时 pending Account 地址仍可提交，以及事件页 H1 的负字距。复现任务 `bce0764bc` 有 5 项失败、14 项通过：旧帐号地址继续恢复、旧位置恢复未取消、重复点选 pending 根页增加历史。现已将身份处理移到提交保存前，失效地址回到 `/account/me`，保留真正的来源历史；浏览器提交早于 React 绘制的情况使用实际 browser key 判断。慢路由不再因三秒超时丢失 pending 元数据；更晚的普通链接导航优先。H1 已移除负字距。

Android 实包任务 `bb332c43c` 复现了 88 像素续看偏移。`data/qa/app-navigation-android/diagnostic.json` 记录：来源 Y 为 1376、高度 2635；返回时高度先为 2547，恢复 Y=1376 后，后续反应行与浏览器锚定又把 Y 改为 1420、1464，最后一次变化距开始约 2.63 秒。新增单测在旧实现上失败（1288 而非 1200）。恢复器现对非零位置保留最长五秒的观察，处理后续布局和锚定；零位置立即完成，用户操作取消恢复。

`sol` / `xhigh` 复核 `29dff851-d1af-485` 的唯一发现为空格键激活返回按钮时过早取消；已修正并加入与指针激活并列的回归。报告见 [滚动复核](research/scroll-followup-review.md)。最终身份与历史复核 `8ca488df-968e-4d7` 已完成，见 [身份复核](research/identity-followup-review.md)。它发现 `/about` 虽归属「我的」，却是公开页面，不能按个人页面失效。已先复现 4 项失败，再用统一的个人路径判断限制清理范围；公开 About 的已保存位置、进行中的恢复和慢路由请求均保留。修正后上述 77 项聚焦测试通过。

## 浏览器验收

聚焦 iPhone 与 WebKit 的旧轮次 `b024d9e27` 为 14 项通过。随后完整矩阵 `b54bb853a` 为 4 通过、70 失败、16 跳过，截图任务 `be88aec05` 也失败。直接检查浏览器确认：基线同步后的旧 Vite 进程把新增 `platform/admin-email.js` 作为原始 CommonJS 提供，导致应用启动失败。该轮结果不用于最终验收。

新增导航用例延迟名片反应行超过两秒，并在反应和页面高度恢复后检查阅读位置。这组新增用例使用 contracts schema 校验的 fixture 与精确调用预算。

重启后的矩阵 `bf4a74323` 为 75 通过、16 跳过、4 失败；全部导航用例通过，失败均为动态标题边界断言。横屏把包含安全区 padding 的 H1 外框当成文字边界，竖屏在 Router 滚动尚未结束时读取坐标。已将 padding 放到外层容器。增加归零等待后的 `b2922d30c` 仍有 5 项动态页失败（74 通过、16 跳过），说明竖向偏移并非单纯的断言时机。跟踪任务 `baee653c2` 记录了虚拟列表与 Router 对同一窗口的滚动写入：全局平滑滚动与加载视图提前绑定窗口会留下旧目标。App 动态页现仅在挂载期间将文档滚动样式设为 `auto`，读取计算样式使其在 Router 恢复前生效，并在列表就绪后启用虚拟器；退出时还原原值与优先级。测量链接坐标的测试使用显式即时滚动。无跟踪的五视口双轮回归 `b99b6c2c0` 已通过全部 10 项（53.5 秒）。普通 Web 和 Wiki 的滚动设置未改。普通 Web 旧预览也有 CommonJS 启动错误；已重启，并在 App 1420、Web 5176 两处浏览器确认无 pageerror。

最终完整矩阵 `bdfdf4293` 为 78 通过、16 跳过、1 失败。唯一失败发生于 WebKit 的延迟恢复测试：测试未等「我的」渲染就返回社区，正确的快速往返保留了原名片组件，因此没有预期的第二次请求。测试现确认帐号页标题已显示后再启动需要重新取数的流程，保留独立的同一事件循环快速往返用例；产品代码未因此调整。受影响导航文件的五视口复验 `b4541418c` 全部 40 项通过（3.0 分钟）。这些结果与完整运行中其他通过项共同覆盖本轮适用矩阵；没有把前一轮退出码写成成功。

该任务随后完成 App 社区、资料、我的、动态和普通 Web 社区截图，路径为 `data/qa/app-navigation-browser/`。五页均为 390 像素视口、文档宽度 390，未捕获 pageerror。App 和普通 Web 的社区入口均通过实际点击进入名片墙，并确认同一文档内完成路由切换。社区及动态截图已人工核对。

## iOS 验收

默认 Release 构建 `bb8f7bc9d` 在 Swift/Rust 链接阶段失败，缺少 `_release_object`、`_retain_object`、`_string_from_bytes`。诊断见 [iOS 链接问题](research/ios-linker.md)：Xcode 27 的 SwiftPM Release 归档含局部 SwiftRs C 符号，而 `swift-rs` helper 遗漏依赖对象的符号提升。

任务 `b4ca9099b` 一次性设置 `CARGO_PROFILE_RELEASE_DEBUG=true` 后，应用构建、安装、运行均成功。Rust 使用 release profile，Swift 包使用 debug；这证明模拟器兼容参数有效，不能称为默认优化 Release 已修复。API/map origin 仅在构建进程设置为 LAN 代理 `http://192.168.31.169:1420`，未写入仓库或 shell 配置。

该轮 XCTest 把登录按钮按链接查找而失败。UI hierarchy 确认它是 `Button`，修正 runner 后任务 `bfec6e6e7` 通过，执行 59.674 秒、零失败：四个 UIKit 标签、切换和重选、真实名片分页续看、实际返回、预览隐藏/恢复原生栏、横竖屏均通过。四个图标也已在截图中人工核对。结果为 `data/qa/app-navigation-ios/Navigation-ui.xcresult`，该包早于最终身份与锚定修复。

默认 Debug 包与更新后的 UIKit runner 通过任务 `b2d97c8ad` 完成构建、安装和实际执行，1 项测试、零失败、72.442 秒，包含最终动态页进入、四个原生标签、分页续看、返回、重选、预览抑制和旋转。结果为 `data/qa/app-navigation-ios/Navigation-final-debug.xcresult`，导出 9 个附件；四栏、动态页标题与横屏预览截图已人工核对。此轮无 Release 兼容参数，默认优化 Release 的链接限制仍保留。五栏追加入口尚未包含在该包中。

## Android 验收

任务 `b8af79152` 已构建、安装并启动 `top.idol_master.imsweb.debug`；该包早于最终修复和完整基线同步。任务 `b66440c71` 因 PNG 截图超过 subprocess 缓冲区失败，已改为输出到文件描述符。重跑 `bb332c43c` 才确认上述实际位置偏移。

原生 QA 使用 Node 连接 WebView CDP；本环境的 Bun WebSocket 连接返回 404，不能用于此检查。runner 为 `data/qa/app-navigation-android/run.cjs`，会恢复语言与旋转设置。现已加入 contracts 校验的公开反应基线读取，并在所有反应行、页面高度和布局帧稳定后检查位置。最终 APK 构建任务 `b5a18d022` 成功安装，但首次启动在 Android 17 模拟器的 `GoldfishMapper` / `libhwui` 图形栈中因已销毁 mutex 崩溃。应用重试 `b4078defd` 通过：四栏、真实分页续看、预览关闭、系统返回、重选和横屏边界全部通过。来源与恢复后的 Y 均为 1376，页面为 `/community/cards?page=2&size=12`；横竖屏文档宽度分别为 952、426，未捕获 pageerror。竖屏、横屏截图已人工核对。此包早于后续动态页滚动修复。

任务 `bfbbbeb6e` 随后完成最终四栏 Debug APK 的构建、安装和交互验收，包含真实分页续看、预览返回、硬件返回、重选、动态页进入归零及退出还原滚动样式、横屏边界。runner 输出完整 PASS。该包包含动态页修复，尚不包含后续五栏入口。

## 追加交换地图底栏入口

用户追加后，模型顺序为 home/community/map/resources/account；公开交换区归 map，个人工作区判定仍优先。五项 Lucide 图标按同一顺序复制，已更新目录说明和测试预期。地图根页不执行窗口恢复，公开事务所详情仍正常保存阅读位置。

初次聚焦测试 `bc39da041` 为 52 通过、1 失败，失败来自旧用例仍要求点「社区」恢复地图；新增地图独立续看、完整 URL 与根页重选用例已通过。旧用例现改为社区进入自身根页、交换地图恢复原地址。旧断言修正前的 `b9a02ab19` 为 94 通过、1 失败，同样只失败于该旧预期。修正后的 `bee5e274c` 全部通过：8 个文件、95 项单测，以及 5 项 Tauri 构建与资源检查。

五栏 iOS 默认 Debug 包 `b05c1426d` 已构建、安装成功。UIKit runner 已补上地图往返、重选与不可用状态识别；`b766b73ba` 实际执行通过，1 项测试、零失败、89.745 秒。五个 UIKit 标签、地图选中/返回/重选，以及名片续看、实际返回、预览抑制和旋转、资料重选与动态页进入均通过。结果为 `data/qa/app-navigation-ios/Navigation-five-tabs-debug.xcresult`，共导出 11 个附件；首页五栏及地图页已人工核对，图标与标签完整，地图在中央选中。该环境记录 `IMS_NAV_MAP_STATE api-unavailable`，正确显示既有未开放提示，未把它记作在线地图数据通过。

地图浏览器专项 `b6702b191` 通过全部 3 项（59.1 秒）：浏览器定位、地图控件边界，以及底栏直达、筛选/缩放视角恢复、根页重选不增加历史或调用窗口滚动、个人路径仍选中我的。该专项使用 contracts 校验的成功响应 fixture；不作为本地交换服务在线的证据。

五栏源码检查 `b94001553` 全部通过：180 个测试文件、1105 项单测，以及格式、lint、typecheck、普通 Web 构建、规则和工作区边界检查。源规则检查覆盖 833 个生产源文件，文档检查覆盖 25 个 docs Markdown 文件，未报告违规。

五栏增量的 `sol` / `xhigh` 静态复核已完成，无发现，见 [地图入口复核](research/map-entry-review.md)。它没有执行测试，运行证据仍分别取自上述检查与设备任务。

完整五视口矩阵 `b62e69bbd` 一次运行成功退出：80 项通过、20 项按项目分工跳过，耗时 5.2 分钟。跳过项为 account 4、map 10、interactive-pages 6；地图画布覆盖一组竖屏/横屏，新增筛选/视角续看覆盖竖屏。五个 App 项目中的导航、壳层、Wiki 和适用页面用例均通过。

同一任务随后完成 App 社区、地图、资料、我的、动态及普通 Web 社区六页截图，均为 390px 视口与文档宽度、零 pageerror。App 五栏顺序正确，普通 Web 保留原有菜单；两种目标下社区至名片墙的实际链接均保留同一文档。App 社区和地图截图已人工核对，地图不可用提示不影响底栏使用。结果与截图位于 `data/qa/app-navigation-browser/`。

Android 五栏 Debug 包 `bc12a6b9d` 构建、安装及交互验收全部通过，WebView 实包 PID 为 10685。验证底栏地图直达、社区往返、地图根页重选保留历史和零窗口位置、名片分页续看、预览关闭、硬件返回、栏目重选、动态页滚动样式进入/退出及横屏边界。`nativeRuntime` 为 true，来源与恢复后的 Y 均为 1376，地址为 `/community/cards?page=2&size=12`；横竖屏文档宽度分别为 952、426，与视口一致，零 pageerror。地图同样为 `api-unavailable`。结果位于 `data/qa/app-navigation-android/result.json`，地图与横屏资料截图已人工核对。

提交前共享分支推进至 `7f38ec6585153af958b25bfa2bcaed4fb5430012`，新增已提交的邮件 Worker。41 个上游路径与导航改动无交集，已仅同步这些未修改路径；94 个本地文件（68 个拟提交文件及 26 个生成图标）的 SHA-256 在同步前后全部一致，索引为空。证据位于 `data/qa/app-navigation-final-base-sync/`。两个 package.json 仅更新邮件 Worker 相关 scripts，Web、contracts、锁文件与 App 构建代码均未变，因此保留上述源码与设备证据；新基线复验 `b51b75516` 全部通过：规则覆盖 840 个生产源文件、25 个 docs Markdown，边界检查通过；infra 的 Node 分组为 58、29、21 项全通过，Python 为 120 项及 2 项全通过。

两个 sol 子代理中，检索代理因服务 503 无可用账号退出。QA 代理的完成通知已收到，但句柄已被清理，完整报告无法取回；已直接核对它留下的 E2E 与设备脚本，并由主代理继续完成检查。未把未取回的执行结果当作通过证据。

## 验收结论与提交状态

| 标准 | 最终证据 |
| --- | --- |
| AC1：入口、归属与目录 | 五栏聚焦 95 项单测、5 项 Tauri 资源检查、完整浏览器矩阵及两端实包；公开事务所归 map，个人路径归我的 |
| AC2：续看、重选与返回 | 1105 项 Web 单测中的协调层/身份/滚动回归，五视口导航用例，以及两端名片分页真实数据续看；Android 精确恢复 Y=1376 |
| AC3：Wiki 边界 | Wiki 源码未改，Classic Wiki CSS 检查通过，五视口 Wiki 转盘与搜索及外层标签回归通过 |
| AC4：布局范围 | 全范围与五栏增量静态复核均无发现，六页最终截图及设备截图已核对 |
| AC5：平台和交互 | 完整矩阵 80 通过、20 按项目分工跳过；iOS UIKit XCTest 与 Android Debug 实包均通过，键盘/减弱动态/嵌套抑制另有单测覆盖 |
| AC6：规划与验证记录 | PRD、设计、执行计划与各 10 条上下文清单有效；实现授权、同分支 worktree 和各轮证据已记录 |

范围限制：本地交换服务返回 404，两端实包验证的是全屏未开放状态和底栏操作；地图成功响应、定位、筛选、视角与布局由严格浏览器 fixture 验证。默认 iOS 优化 Release 仍受已记录的上游链接问题影响，本轮使用默认 Debug 实包完成原生验收。

代码和验收已完成，用户已回复 `ok` 批准 [提交计划](research/commit-plan.md) 中的单个功能批次。最近核对两处共享 HEAD 为 `7f38ec6585153af958b25bfa2bcaed4fb5430012`、两处索引为空；原目录的后续邮件设置改动及旧草稿仍保留；提交计划列出执行前核对的 17 个路径快照，执行时仍须保护其后新增改动。导航 worktree 的生成 Android 图标及本地 QA 文件也不纳入提交。确认后须再次检查共享指针与两份索引，再执行工作提交；归档和 journal 记账放在工作提交之后。
