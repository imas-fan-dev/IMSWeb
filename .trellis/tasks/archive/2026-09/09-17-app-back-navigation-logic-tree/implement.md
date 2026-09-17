# 执行计划：App 返回导航逻辑树

关联：[prd.md](prd.md)、[design.md](design.md)。技术方案与命令以设计为准，本文件只排顺序与验证。

约定：`TASK=.trellis/tasks/09-17-app-back-navigation-logic-tree`。所有改动在 `release/v1.1` 的当前工作区进行。

## 阶段 0：基线确认（改代码前）

- [ ] 0.1 记录基线：`git -C . rev-parse HEAD`、`git status --porcelain`，确认工作区里 `apps/web/app/pages/community/exchange/community-exchange-page.tsx` 等既有未提交改动属于其它任务，本任务不得改写它们。
- [ ] 0.2 跑一次基线单元测试，确认失败清单只来自其它任务的在改文件：
      `VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run tests/unit/components/app --reporter=dot`

**回滚点 R0**：本阶段无改动。

## 阶段 1：逻辑树模块

- [ ] 1.1 在 `apps/web/app/components/app/app-tab-model.ts` 中：
      - 删除 `appBackHierarchyTarget` 及其文档注释；
      - 新增 `AppBackTarget` 类型与 `resolveAppBackTarget(pathname)`；
      - 按 `design.md` §2 的顺序写入规则表，并在注释中写清 5 条顺序约束（`/account/me` 先于 `/community/exchange/me` 先于 map 子树；`/community/cards/submissions` 先于 `/community/cards`；`/` 只能精确匹配）；
      - 复用既有 `pathBelongsTo`、`belongsToAny`、`normalizeAppPathname`，不新增第二套前缀判断。
- [ ] 1.2 重写 `apps/web/tests/unit/components/app/app-tab-model.test.ts` 的父级用例：
      - 逐条覆盖 `design.md` §2 的规则表（每个 `parent` 规则至少一条用例，含带参数的 `/works/765`、`/events/42`、`/chronicle/42`、`/information/42`、`/packages/sample`、`/community/exchange/offices/tokyo`、`/community/cards/submissions/42`）；
      - 覆盖 5 个 `root`；
      - 覆盖查询串不影响结果（`/wiki?agency=X` 与 `/wiki` 同结果）；
      - 覆盖尾斜杠归一化（`/account/me/profile/`）；
      - 覆盖 `unknown`（`/nonsense`）；
      - **保留**现有 `appTabIdForPathname` 归属表与五栏顺序用例不动。
- [ ] 1.3 用 `routes-app-target.test.ts` 的 App 清单做覆盖断言：新增用例遍历 App 目标路由描述符，断言每条的 pathname 解析结果不是 `unknown`。参数段用占位值替换。

**验证**

```
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run tests/unit/components/app/app-tab-model.test.ts tests/unit/routes-app-target.test.ts --reporter=dot
```

**回滚点 R1**：还原 `app-tab-model.ts` 与两个测试文件。

## 阶段 2：接线

- [ ] 2.1 `apps/web/app/components/app/app-navigation-provider.tsx`：
      - 导入换成 `resolveAppBackTarget`，`hierarchyBackTarget` 换成按需计算的 `backTarget`；
      - `goBack()` 按 `design.md` §3.2 改写：`root` → 直接 return；`parent` → §3.3 的 pop/replace 选择；`unknown` → 保留现有末段兜底逻辑不变；
      - 保持 `rememberCurrentLocation()` → `cancelPending()` → `cancelRestoration()` 的调用顺序；
      - Android 监听器的注册条件改为 `backTarget.kind === "parent"`，effect 依赖同步；
      - POP 纠正 effect 改用 `resolveAppBackTarget(previous.pathname)`，显隐判据为 `kind === "parent"`，导航保持 `navigate(target.href)`（push）。
- [ ] 2.2 `apps/web/app/components/app/app-top-bar.tsx`：把 `isTabRoot` 判据换成 `resolveAppBackTarget(pathname).kind === "root"`，三分支渲染结构不变。
- [ ] 2.3 代码内注释同步：`app-navigation-provider.tsx` 里两处描述"我的 subpages"的注释、以及 `src-tauri/src/lib.rs` 中描述 `我的 subpages` 的注释，改为描述逻辑树。只改注释，不改 Rust 行为。

**验证**

```
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run tests/unit/components/app --reporter=dot
```

**回滚点 R2**：还原 provider 与 top bar 两个文件。

## 阶段 3：改写锁定历史语义的测试

按 `design.md` §4.4 的表格逐条处理，**每条都要先读用例再决定是改写断言还是补新用例**，不允许为了过测试而删覆盖。

- [ ] 3.1 `app-top-bar.test.tsx`：保留首页/Tab 根渲染用例；把"直达无历史 → 回栏目根"的 `it.each` 扩充为覆盖树中每一类页面（`/account/login`、`/account/register`、`/account/password-reset`、`/about`、`/community/exchange/me`、`/works/sample`、`/events/42`、`/story`、`/information/42`）；新增"栏目根不渲染返回按钮"的显式用例。
- [ ] 3.2 `app-navigation-provider.test.tsx`：
      - 改写 `restores the full last URL and source position before document replacement`（现断言返回落在另一个栏目）：改为断言返回落在当前页的逻辑父级，同时保留"完整地址 + 阅读位置恢复"这一半；
      - 改写 `does not add another history entry when reselecting a pending root` 与 `keeps browsing history on the account root`：根页不再有返回落点，断言改为 `goBack` 为 no-op，且历史项未被改动；
      - 改写 `pushes the account root when a native pop leaves a restored section`：保留 POP 纠正到 `/account/me` 的断言，去掉"再一次按钮返回到达 `/community`"（根页无按钮），改为断言原生 POP 仍可到达 `/community`；
      - 保留 `lands on the account root from directly entered %s`、`pops to the account root when the parent sits below the subpage`、`replaces a cross-tab account subpage with the account root` 三条（落点不变）；
      - 新增：跨栏目跳转后的树返回（`/community` → 点入 `/account/me/cards` → 返回 → `/account/me`）、`/wiki` ↔ `/story` 的上溯、以及"查询串变化不改变落点"；
      - 新增：POP 纠正后不再产生二次纠正（连续操作不抖动）；
      - 不动身份失效、快照恢复、滚动恢复的全部用例。
- [ ] 3.3 E2E：
      - `app-navigation.spec.ts:79-133`：返回落点改为 `/community`，保留滚动恢复与"栏目根无返回按钮"的断言；
      - `app-navigation.spec.ts:228-249`：直达 `/community/cards` → 返回 → `/community`，`history.length` 不变，断言保持；
      - `app-navigation.spec.ts:463-503`：账号子页返回 `/account/me` 保留；`/account/me` 上的浏览器返回不再断言"到达 `/apps`"，改为明确记录根页行为；
      - `app-navigation.spec.ts:505-526`：保留 POP 纠正到 `/account/me` 的断言，第二段改为断言原生返回可继续到达 `/apps`；
      - `app-account.spec.ts:545-597`：`goBack` 到 `/account/me` 的断言保留；
      - `app-events.spec.ts:420-633`：`/` → `/events` → `/events/1` 的"返回"落点改为 `/events`（原为 `/events`，若已一致则补一条"从 `/events` 返回 → `/community`"）。

**验证**

```
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run tests/unit/components/app --reporter=dot
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run --reporter=dot
pnpm --filter @imsweb/web run test:e2e:app -- app-navigation app-account app-events
```

**回滚点 R3**：测试文件单独还原不影响阶段 1–2 的实现。

## 阶段 4：静态检查与全量回归

- [ ] 4.1 `pnpm --filter @imsweb/web run lint`
- [ ] 4.2 `pnpm --filter @imsweb/web run typecheck`
- [ ] 4.3 `pnpm --filter @imsweb/web run format`（只格式化本任务触碰的文件；如产生无关 churn 则改用 `prettier --write` 指定文件）
- [ ] 4.4 `pnpm run check:rules`
- [ ] 4.5 `pnpm --filter @imsweb/web run test`（web 全量：unit + e2e 配置）
- [ ] 4.6 `pnpm run build`（确认 Web 与 App 两个目标都能构建；`build:app` 按需）

## 阶段 5：设备验证

- [ ] 5.1 `pnpm run app:doctor`，把每个失败的修复命令记录到验证文档。
- [ ] 5.2 iOS 模拟器：`pnpm run app ios`。验证 a) 子页面顶栏返回落点等于逻辑父级；b) 边缘滑动落点与按钮一致；c) 栏目根无返回按钮。
- [ ] 5.3 Android 模拟器：`pnpm run app android`。验证同样三项，并记录栏目根上系统返回的实际表现（设计预期：平台默认）。
- [ ] 5.4 移动浏览器回退（`playwright.app.config.ts` 的 `dev:app`）：覆盖 320px 与常用手机视口，确认无横向溢出与点击遮挡。
- [ ] 5.5 把设备结果写进 `validation.md`，包括未达成的项与原因。浏览器结果不得替代原生结论。

## 阶段 6：收尾

- [x] 6.1 更新 `.trellis/spec/web/frontend/app-navigation.md`：§2 签名（`resolveAppBackTarget` 取代 `appBackHierarchyTarget`）、§2 段落叙述、§4 行为矩阵中 "Back with observed App history" 与 "Back on the Account root" 两行、§6 必需断言。另补两处约定：核心资料只留「剧情站」，以及我的资料子页面没有页面级刷新按钮。
- [x] 6.2 已检查 `.trellis/spec/web/frontend/components-and-ux.md`：全文无「返回 / 刷新 / 资料目录 / App Wiki / 剧情」相关内容，无需同步。该文件正被 `09-17-mobile-map-interface-redesign` 改动，本任务未触碰。
- [x] 6.3 已检查 `apps/web/DESIGN.md`：内容为设计令牌（颜色、圆角、字体与语义色变量），不描述返回或目录语义，无需改动。
- [x] 6.4 `src-tauri/src/lib.rs` 的文档注释已改写：从「我的子页叠在 `/account/me` 之上」改为「手势仍重放会话历史，由 web provider 纠正到逻辑父级，栏目根保持历史行为」。仅改注释，不改 Rust 逻辑。
- [ ] 6.5 提交：`feat(web): drive the app back button from the page hierarchy`。

## 阶段 7（追加）：R7 与 R8

用户在阶段 3 完成后追加两条需求，已写回 `prd.md` 的 R7、R8 与 AC8、AC9。

- [x] 7.1 R7：`apps-directory-model.ts` 删除 `app-resource-story`，`app-resource-wiki` 标题改为「剧情站」。
- [x] 7.2 R7：`pages/apps/index.tsx` 的两处文案去掉「Wiki」与作为独立入口的「剧情」。
- [x] 7.3 R8：移除四处页面级刷新按钮（个人档案子页头部、收藏夹、事务所、名片认领），并清理因此失去引用的 `reload` 与图标导入。
- [x] 7.4 同步三个单测文件：`apps-page.test.tsx`、`community-exchange-me-page.test.tsx`、`office-location-workspace.test.tsx`。
- [x] 7.5 验证：web 全量单测、lint、typecheck、`check:rules`、App E2E。

**不改动**：独立页 `/community/exchange/me` 头部自己的刷新按钮；冲突提示与失败态的载入按钮；地图、动态、生产商地图、推荐列表的刷新按钮；由 API 下发的动态入口与 `/story` 路由本身。

## 验收门

| 门 | 位置 | 判据 |
| --- | --- | --- |
| G1 | 阶段 1 结束 | 规则表单元测试覆盖 `design.md` §2 全部规则，`unknown` 只出现在树外路径 |
| G2 | 阶段 2 结束 | `goBack` 只有一条树解析路径；仓库内不再有 `appBackHierarchyTarget` 引用 |
| G3 | 阶段 3 结束 | 被改写的每个测试都说明了改动理由；没有为了通过而删除覆盖 |
| G4 | 阶段 4 结束 | lint / typecheck / check:rules / web 全量测试 / build 全绿 |
| G5 | 阶段 5 结束 | iOS 与 Android 实包结果已记录；未达成项写入限制而不是省略 |
| G6 | 阶段 6 结束 | spec 与 DESIGN 已同步；提交信息与改动范围一致 |

## 风险与应对

| 风险 | 应对 |
| --- | --- |
| 测试改成"通过即可"，丢掉返回相关的真实覆盖 | G3 要求逐条记录理由；阶段 3 的"新增"项必须落地 |
| iOS 设备不可用导致原生手势无法验收 | 按仓库规则先跑 `app:doctor`；把阻塞写进 `validation.md`，不隐含通过 |
| 工作区已有其它任务的未提交改动被误改 | 阶段 0.1 记录基线；阶段 6 提交时逐文件确认归属 |
| 规则表顺序写错导致 `/community/exchange/me` 被 map 规则吞掉 | 单元测试显式覆盖该顺序，并用 App 路由清单做全量覆盖断言 |
