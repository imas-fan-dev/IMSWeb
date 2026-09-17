# 验证记录：App 返回导航逻辑树（阶段 3.3 E2E 同步）

范围：`apps/web`（App 目标，移动浏览器回退构建）。本阶段只同步 E2E，不改实现代码。阶段 1、2、3.1、3.2 已由前序子代理落地并通过单测；本阶段未改动 `app-tab-model.ts`、`app-navigation-provider.tsx`、`app-top-bar.tsx`。

基线：`git rev-parse HEAD` = `a8171a4bbea3c45c063ab2483094364769eb10c4`。工作区另有其它任务的未提交改动，本阶段未触碰 `community-exchange-page.tsx`、`app-map.spec.ts`、`community-exchange-app-page.test.tsx`、`components-and-ux.md`、`09-17-mobile-map-interface-redesign/implement.md`。

## 命令与结果

```
cd /Users/texas/Workspace/IMSWeb
pnpm --filter @imsweb/web run test:e2e:app -- app-navigation app-account app-events
```

结果：退出码 `0`，`52 passed`、`7 skipped`、`0 failed`（2.5m）。

说明两点：

- 端口 1420 起始空闲，Playwright 自行拉起 `pnpm dev:app`（App 目标 Vite dev server，`IMS_API_ORIGIN` 指向未使用的 `127.0.0.1:65534`），未复用任何遗留 server。
- 命令中的 `-- app-navigation app-account app-events` 被 pnpm 原样传给 Playwright，Playwright 把 `--` 之后的参数当透传参数，位置过滤没有生效，最终跑的是完整 App 矩阵（`app-small`、`app-iphone`、`app-android`、`app-landscape`、`app-webkit` 五个 project，59 次执行）。三个目标 spec 全部在列且通过，覆盖强于过滤后的子集。
- 7 个 skip 全部是 project 与 `test.use` 标签不匹配的既有跳过，不是本任务用例：`app-account.spec.ts` 的 3 个 `@app-iphone @app-android @app-webkit` 用例在无 grep 的 `app-small` 里跳过；`app-map.spec.ts` 的 4 个 `@app-iphone @app-landscape` 用例在 `app-iphone` 里部分跳过。`app-map.spec.ts` 属于其它任务的文件，本任务未改动。

## 改动的 E2E 用例

| 文件:用例 | 原名 | 新断言 | 理由 |
| --- | --- | --- | --- |
| `app-navigation.spec.ts:79` | `resumes paginated reading after delayed data and follows actual history` | 改名 `…and returns to the community root`；恢复滚动后点「返回」断言 `URL /\/community$/` 且 `scrollY` 归零，保留「栏目根无返回按钮」「四个入口链接可见」 | 名片墙是「社区」子页，新树语义下逻辑父级是 `/community`；旧断言 `expectAccountPage` 锁的是浏览历史回放（PRD 明确要推翻的入口）。标题随之更新，因为用例不再验证「跟随历史」 |
| 同上，fixture | `cards: 3`、`reactionReads: 36` | `cards: 2`、`reactionReads: 24` | 原第 3 次 `/api/cards` 请求来自「返回后再点社区从快照重入名片墙」；新语义下返回落在 `/community`，栏目快照随该次 commit 变成 `/community`，不再有第二次重入。反应读取次数随渲染轮次从 36 降到 24（两次渲染 × 12 卡）。这不是为通过而删覆盖：滚动恢复与「切 Tab 恢复完整地址」的断言都保留在前半段 |
| `app-navigation.spec.ts:488`（新增） | — | `returns a cross-tab account section to the account root`：`/works/765`（资料）→ 「我的」→ `/account/me` → 点入 `/account/me/cards` → 顶栏返回 → `/account/me` | PRD 要求补一条跨栏目跳转的树返回：落点由页面归属决定，不回跳来源页。来源特意选资料详情页，避免与既有 `:471`（来源 `/apps` 的 Tab 入口变体）重复 |
| `app-events.spec.ts:420` | `App community flow respects safe areas and stable list geometry` | 在 `返回 → /events` 之后追加一次顶栏返回，断言 `URL /\/community$/`；并注册 `{ path: "/api/community/exchange/series", times: { min: 0, max: 1 } }` | `/events` 属于社区，逻辑父级是 `/community`；`/events/1 → /events` 的落点不变。新增落点会真实挂载社区首页，该页 `useEffect` 调 `getFudabaSeries()`，按 dispatcher 规则必须显式注册，否则 teardown 报未注册请求 |

## 确认「落点不变、无需改动」的用例

- `app-navigation.spec.ts:224` `replaces direct-entry back fallback and preserves the selected owner`：直达 `/community/cards` 的父级正好是 `/community`，`below` 不存在走 `replace`，`history.length` 不变，断言原样成立。
- `app-navigation.spec.ts:459` `returns to the account root from a directly entered section`：`/account/me/cards` 父级 `/account/me`，直达走 `replace`，落点不变。
- `app-navigation.spec.ts:471` `returns to the account root after entering a section from another tab`：父级 `/account/me` 正好在下一层，走 `navigate(-1)`，落点不变。
- `app-navigation.spec.ts:510` `keeps the platform back gesture on the account root`（仅改名，并补「根页无返回按钮」断言与注释）：`page.goBack()` 是浏览器/原生 POP，不是顶栏按钮。`/account/me` 是树根，`leftTarget.kind === "root"` 不触发 POP 纠正，实测仍回到 `/apps`。改名与注释写清它验证的是「栏目根上原生返回仍走历史」，不是按钮行为。
- `app-navigation.spec.ts:529` `returns a restored account section to its root on a native pop`：第一段 `goBack` 触发 POP 纠正到 `/account/me` 保留；纠正用 push，第二段 `goBack` 仍能到 `/apps`，实测通过。仅补一行注释说明该链路。
- `app-account.spec.ts:548` 我的资料 submenu：每个 section 由 `/account/me` 点入，`page.goBack()` 的父级在下一层，仍回到 `/account/me`，未改动。
- `app-events.spec.ts:420` 的 `/ → /events → /events/1 → 返回 → /events`：`/events/1` 父级 `/events`，落点不变。
- `app-navigation.spec.ts` 中 `:131`、`:184`、`:247`、`:274`、`:298` 的滚动恢复、取消、边界用例，以及 `:440` 视口缩放用例：均不点顶栏返回，未改动，全部通过。

## 追加需求 R7、R8 的验证

用户在返回导航实现完成后追加两条需求，已写入 `prd.md` 的 R7、R8 与 AC8、AC9。

改动面：`pages/apps/apps-directory-model.ts`（删 `app-resource-story`，`app-resource-wiki` 标题改「剧情站」）、`pages/apps/index.tsx`（两处文案）、`community-exchange-me-workspace.tsx` / `favorite-collection.tsx` / `office-location-workspace.tsx` / `claim-envelope-panel.tsx`（移除四处页面级刷新按钮），以及三个单测文件。

```
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run --reporter=dot
  → 209 test files passed / 1411 tests passed
pnpm --filter @imsweb/web run lint        → exit 0
pnpm --filter @imsweb/web run typecheck   → exit 0
pnpm run check:rules                      → exit 0
```

`check:rules` 明细：agent rules（4 scope）、source rules（854 个生产源文件）、contracts entrypoints（29 个）、route inventory（30 Web prerender / 28 App prerender）、JSON wire audit（
505 个 `c.json` 发射点 / 205 个 Web 客户端调用 / 0 violation）、non-JSON 边界（29 handler / 30 manifest）、docs rules（25 个 Markdown 文件）。App 路由数仍为 31，因此 `routes-app-target.test.ts` 的计数断言未受影响。

单测断言变化：

| 测试文件 | 变化 | 理由 |
| --- | --- | --- |
| `tests/unit/pages/apps/apps-page.test.tsx` | 「核心资料」区域断言从 2 个链接改为 1 个，`href` 仍为 `/wiki`，可访问名匹配 `剧情站`；失败态用例同步限定到该区域；空目录用例的链接总数从 2 改为 1 | 核心入口从两条改为一条 |
| `tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx` | `刷新个人档案` 从 `toBeVisible()` 改为 `not.toBeInTheDocument()` | 子页不再有页面级刷新按钮 |
| `tests/unit/pages/community/exchange/me/office-location-workspace.test.tsx` | 两处 `刷新我的事务所` 的 `toBeDisabled()` 断言删除，保留同块内的「当前事务所」与「新建事务所」禁用断言 | 按钮已不存在；pending 期间禁用其它控件的覆盖保留 |

未覆盖：上述单测与静态检查只证明渲染与文案符合预期，不证明真机上的触控体验；该部分与返回导航同属阶段 5。

## R7 引发的 E2E 回归（已修）

加入 R7 后的首次完整 App E2E 报 1 个失败，位置 `app-navigation.spec.ts:211`，用例 `resumes resource details and reselects a root without adding history`：

```
Locator: locator('main a[href="/story"]')
Expected: visible
Error: element(s) not found
```

原因：该断言锁的是被 R7 删除的「剧情」核心入口。用例本意是验证资料目录的滚动与「重选栏目根不加历史」，`/story` 只是目录内容的前置检查，改成 `toHaveCount(0)` 后既保留了前置检查，也把「剧情入口不应回来」写进断言，比直接删掉更有防护。

同一文件里 `installEmptyWikiCatalogMock(api)` 与 `扩展资料 24` 断言不受影响：API 下发的动态入口指向 `https://example.com/resource/*`，与核心入口是两套。

修复后重跑完整 App 矩阵：

```
pnpm --filter @imsweb/web run test:e2e:app
  → 52 passed / 7 skipped / 0 failed（2.5m）
  → PLAYWRIGHT_EXIT=0
```

与加 R7 之前的那次 52 passed / 7 skipped / 0 failed 逐项一致，说明 R7 只影响了这一条目录内容断言。重跑前确认 1420 端口空闲，Playwright 自行拉起全新的 `dev:app`（`reuseExistingServer: !process.env.CI` 在本机为 true，存在复用陈旧 server 的风险），因此本次结果不是复用旧构建得到的。

## 证据读取方式的一处修正

首次派发的后台任务（lint 与 check:rules 加 E2E 合并命令）回报退出码 `0`，但输出文件尾部实际是 `Exit status 1`。原因是我把整条命令的结尾接了管道，shell 的退出码取自管道末端而不是 `pnpm`。后续重跑都改成在命令末尾打印明确的 `PLAYWRIGHT_EXIT=$?` 标记，并以输出文件尾部为准，不以报告的退出码为准。

## 验收条件对照

| 条件 | 状态 | 依据 |
| --- | --- | --- |
| AC1 树覆盖全部 31 条 App 路由且与 R1 表一致 | 已验 | `app-tab-model.test.ts` 逐条锁定规则表；`routes-app-target.test.ts` 新增「每条 App 目标路由都能在返回树里解析」，逐个把 `:param` 换成 `sample` 后断言无 `unknown`，且路由计数仍为 31 |
| AC2 有父级则回父级；栏目根无返回按钮；查询串不改变落点 | 已验 | `app-top-bar.test.tsx` 的 5 个根页无返回控件用例；`app-navigation-provider.test.tsx` 的查询串不变性、跨栏目上溯、wiki/story 上溯；E2E `app-navigation.spec.ts` 与 `app-events.spec.ts` 的落点断言 |
| AC3 三个入口落点一致 | 部分 | 顶栏按钮与 POP 纠正共用 `resolveAppBackTarget`，已由 E2E 覆盖；**Android 系统返回已实测**（E3、E5 证明落点由页面归属决定）；iOS 边缘滑动未达成，见下文 |
| AC4 五栏结构与快照语义不变；Web 构建不受影响 | 已验 | `app-tab-model.test.ts` 保留五栏顺序与归属表；滚动恢复、取消、重选、地图根不滚动、身份失效用例全部通过；普通 Web 构建的 `public-layout.tsx` 不挂载本 provider |
| AC5 预览、分页与快捷键控件未被误改；check:rules 通过 | 已验 | `use-namecard-preview-navigation.ts:129` 的 `navigate(-1)` 是名片预览索引函数，未改；`check:rules` 退出码 0 |
| AC6 原生返回实际表现已记录，残留限制写入文档 | 部分 | Android 已实测并逐条截图（E1–E6）；残留项 E6（栏目根上原生返回仍弹历史）已写入本文档；iOS 未达成，原因与待办已记录 |
| AC7 三份任务文档与子代理上下文清单齐备，检查与测试结果已记录 | 已验 | `prd.md`、`design.md`、`implement.md`、`validation.md` 与两个 `.jsonl` 清单已就位 |
| AC8 资料目录只剩「剧情站」 | 已验 | `apps-page.test.tsx` 的「核心资料」区域断言只剩一个指向 `/wiki` 的链接；App E2E `app-navigation.spec.ts:211` 断言指向 `/story` 的入口计数为 0 |
| AC9 我的资料子页无页面级刷新按钮 | 已验 | `community-exchange-me-page.test.tsx` 与 `office-location-workspace.test.tsx` 的断言已翻转；仓库内 `RefreshCwIcon` 只剩错误恢复用途 |

## 未达成项与限制

- 阶段 5 已完成 Android 一侧（E1–E6，见上）。iOS 边缘滑动仍无可用的验证环境，因此 AC3 与 AC6 不能整体标为达成；这两条要么由人工在有界面的环境里补一次手势，要么接受它们以“Android 已实测 + iOS 环境限制已记录”的状态交给下一步。
- `app-small` 的 3 个 `app-account` skip 与 `app-iphone` 的 4 个 `app-map` skip 是既有标签/项目组合的跳过，未被本任务触碰，也未在本任务补齐其它 project 的执行。
- 未改动任何实现代码；E2E 未发现实现 bug。

## 阶段 5：设备验证

### 前置检查

```
pnpm run app:doctor
  → 通过；唯一 warn 是 TAURI_APPLE_DEVELOPMENT_TEAM 未设置，仅影响真机构建
  → Android 侧：SDK / NDK 29.0.14206865 / Java 21 / adb / emulator / build-tools 37.0.0 / 四个 Rust 目标均 ok
  → iOS 侧：Xcode / xcrun / CocoaPods / 三个 Rust iOS 目标 / src-tauri/gen/apple 均 ok
```

### iOS 模拟器

```
pnpm run app ios
  → APP_IOS_EXIT=0
  → 产出 /Users/texas/Workspace/IMSWeb/apps/web/src-tauri/gen/apple/build/arm64-sim/IMSWeb.app
  → 安装到 iPhone 18 Pro（5607CB3B-7E75-45D6-B1F1-618F05A397E3），进程 76454 启动
```

用 `xcrun simctl io booted screenshot` 截图（`/tmp/ios-app-1.png`）只能确认打包包能启动、首页正常渲染、底部五栏在位。

**截图不能当作返回按钮显隐规则的证据。**首页走的是 `AppTopBar` 的 `isHome` 分支（品牌字标 + 主题切换），该分支本来就不渲染返回按钮，与本任务的 `isRootPage` 分支不是同一条代码路径。要验证新规则需要导航到 `/apps` 或 `/community`，而在本环境里无法点击（原因见下）。因此 iOS 侧对 AC2 与 AC3 没有贡献，仅有“打包包可运行”。

**未验证：iOS 边缘滑动。**原因是环境不具备，不是代码问题：

- 构建日志里有 `Unable to find application named 'Simulator'`。已逐一确认：`/Applications/Xcode.app/Contents/Developer/Applications/` 是空目录，`/Applications` 下没有 Xcode 以外的 Simulator.app，`mdfind -name Simulator.app` 只命中系统自带的 WidgetKit Simulator 与 Quick Look Simulator。设备是 `simctl` 无头启动的，没有可交互窗口。
- `xcrun simctl` 只提供截图/录像/外观切换，不提供触摸或手势注入。
- 本机没有 `cliclick` 之类可做坐标级拖拽的工具。
- 真机路径需要 `TAURI_APPLE_DEVELOPMENT_TEAM`（doctor 已报 warn），而且即使设上也无法在无人环境里做出手指滑动。

因此 **AC3 的 iOS 部分未达成，AC6 也不能按“已实测”结案**，详见本节末的结论。

间接证据（不等于手势实测）：iOS 手势走的是 WKWebView 的 POP，与 E2E 里 `page.goBack()` 完全同一条分支，`app-navigation.spec.ts:510`（栏目根不纠正）与 `:529`（纠正后二次手势仍能上溯）两个用例锁的就是这条分支。`enable_ios_back_swipe` 本身没有改动，唯一变动是 `src-tauri/src/lib.rs` 的文档注释。

### Android 模拟器（已实测）

先试过已连接的真机 A059，但验证不了：手机处于 `isSleeping=true` 的锁屏状态，`screencap` 只能取到黑帧（四次截图 SHA-1 完全相同），无法观察也无法点击。改用模拟器，APK 不需要重编：

```
$ANDROID_HOME/emulator/emulator -avd Medium_Phone -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect
adb -s emulator-5554 install -r .../apk/universal/debug/app-universal-debug.apk   → Success
（1080x2400, arm64-v8a, sys.boot_completed=1）
```

过程中做了两处环境调整，都在模拟器内，不涉及仓库或用户设备：把导航模式从手势导航改成三键导航（因为底部手势区会吞掉栏目标签栏的点击，第一次点击就误唤了系统搜索），以及唤醒屏幕。

验证路径刻意避开登录：`/` → 资料 → `/apps` → 剧情站 → `/wiki`；另一条：`/apps` → 作品与工具 → `/works` → 作品卡「进入剧情站」→ `/wiki`。每条都截图存证，证据在 `evidence/`。

| 序 | 操作 | 观察到的结果 | 证据 |
| --- | --- | --- | --- |
| E1 | 点底部「资料」 | 落在 `/apps`；顶栏只有「资料」，**没有返回箭头**；「核心资料」只剩「剧情站」一项，无「剧情」、无「App Wiki」 | `android-01-apps-root-no-back.png` |
| E2 | 点「剧情站」 | 落在 `/wiki`；顶栏出现返回箭头 + 「资料」 | `android-02-wiki-subpage-has-back.png` |
| E3 | `input keyevent 4` | 落在 `/apps`，顶栏恢复为无返回箭头 | `android-03-system-back-to-apps.png` |
| E4 | 点「作品与工具」 | 落在 `/works`；顶栏为返回箭头 + 「资料」 | `android-04-works-subpage.png` |
| E5 | 从 `/works` 点作品卡进 `/wiki`，再 `keyevent 4` | 历史序列为 `/` → `/apps` → `/works` → `/wiki`，历史上一项是 `/works`，但**落点是 `/apps`**。树战胜了历史，这正是用户反馈的问题 | `android-05-back-to-apps-not-works.png` |
| E6 | 在 `/apps`（栏目根）再 `keyevent 4` | 按历史弹回 `/`（首页），应用未退出（`topResumedActivity` 仍是 IMSWeb） | `android-06-root-back-replays-history.png` |

E3 与 E5 走的是同一条原生路径：安卓的返回键由 `onBackButtonPress` 监听器交给 `goBack()`。E5 是关键一条，它证明落点由页面归属决定而不是访问顺序。E6 是 PRD R6 写明、也已在 `app-navigation.spec.ts:510` 用 `page.goBack()` 锁住的残留行为：栏目根上原生返回仍弹历史，没有以「浏览器通过」结案。

### 阶段 5 结论

- **Android：已实测。** AC3 的 Android 部分与 AC6 的 Android 部分达成，证据为 E1–E6，均在打包好的 debug 包上、经真实系统返回键触发。
- **iOS：未达成。** 打包包可构建可运行，但边缘滑动无法在本环境触发，原因已列在上面。AC3 的 iOS 部分与 AC6 的 iOS 部分需人工完成：要么在有界面的机器上手动滑一次，要么设置 `TAURI_APPLE_DEVELOPMENT_TEAM` 后装到真机上滑一次。两者都确认修正后，AC3 与 AC6 才算完整。
- 未验证的 iOS 手势与已验证的 Android 系统返回共用同一个 `resolveAppBackTarget` 和同一段 POP 纠正，所以剩余风险集中在一个已存在的原生开关（`enable_ios_back_swipe`，本任务未改动），不在本次新增的逻辑里。
