# 技术设计：App 返回导航逻辑树

关联需求：[prd.md](prd.md)；现状事实：[research/app-back-affordances.md](research/app-back-affordances.md)。

## 1. 边界

### 改动的文件

| 文件 | 改动 |
| --- | --- |
| `apps/web/app/components/app/app-tab-model.ts` | 删除 `appBackHierarchyTarget`，新增 `resolveAppBackTarget` 与逻辑树规则表 |
| `apps/web/app/components/app/app-navigation-provider.tsx` | `goBack` 改为查树；Android 监听器注册条件从"账号层级页"推广为"有逻辑父级"；POP 纠正改用同一解析函数 |
| `apps/web/app/components/app/app-top-bar.tsx` | 返回按钮显隐判据从 `isTabRoot` 改为"解析结果不是栏目根" |
| `apps/web/tests/unit/components/app/app-tab-model.test.ts` | 重写父级表用例 |
| `apps/web/tests/unit/components/app/app-top-bar.test.tsx` | 扩充显隐与落点用例 |
| `apps/web/tests/unit/components/app/app-navigation-provider.test.tsx` | 改写锁定历史语义的用例 |
| `apps/web/tests/e2e/app-navigation.spec.ts`、`app-account.spec.ts`、`app-events.spec.ts` | 同步返回落点断言 |
| `.trellis/spec/web/frontend/app-navigation.md` | 更新签名、行为矩阵与必需断言 |
| `apps/web/app/pages/apps/apps-directory-model.ts` | 核心资料入口：移除 `/story` 的「剧情」，`/wiki` 标题改为「剧情站」 |
| `apps/web/app/pages/apps/index.tsx` | 资料目录页文案与入口名一致 |
| `apps/web/app/pages/community/exchange/me/community-exchange-me-workspace.tsx` | 去掉我的资料子页面的页面级刷新按钮 |
| `apps/web/app/pages/community/exchange/me/favorite-collection.tsx` | 同上（收藏夹）；同时移除只服务该按钮的 `reload` |
| `apps/web/app/pages/community/exchange/me/office-location-workspace.tsx` | 同上（事务所） |
| `apps/web/app/pages/community/exchange/me/claim-envelope-panel.tsx` | 同上（名片认领） |
| `apps/web/tests/unit/pages/apps/apps-page.test.tsx` | 核心入口断言改为仅剩「剧情站」 |
| `apps/web/tests/unit/pages/community/exchange/community-exchange-me-page.test.tsx` | 子页不再有刷新按钮 |
| `apps/web/tests/unit/pages/community/exchange/me/office-location-workspace.test.tsx` | 移除已删除按钮的禁用断言，保留其余 pending 断言 |

### 不改动

`apps/web/app/lib/app-navigation-state.ts` 的快照、历史记录与身份失效机制；`apps/web/app/lib/app-shell-scroll.ts`；`apps/web/app/layouts/app-layout.tsx`；底栏 `app-tab-bar.tsx`；页面内固定链接；`apps/web/src-tauri/**`（不做原生手势接管，见 PRD R6）；普通 Web 构建（`public-layout.tsx` 不挂载 `AppNavigationProvider`，天然隔离）。

## 2. 逻辑树契约

```ts
export type AppBackTarget =
  | { kind: "parent"; href: string }
  | { kind: "root" }
  | { kind: "unknown" }

export declare function resolveAppBackTarget(pathname: string): AppBackTarget
```

三种结果的语义：

- `parent`：当前页面在树中有父级，`href` 是父级路径（只有 pathname，不含 query/hash）。返回控件可见。
- `root`：当前页面是栏目根，树的终点。返回控件不可见；按钮调用是 no-op。
- `unknown`：pathname 不匹配任何 App 路由（错误页等）。返回控件仍可见，落点走安全兜底（见 §4.2）。这是唯一保留历史兜底的入口，用来避免用户被卡在错误页。

`pathname` 先经 `normalizeAppPathname`（去尾斜杠）。规则表按顺序匹配，前缀命中即返回。

### 规则表（顺序敏感）

```ts
// 栏目根：树的终点
"/"                                                    → root
"/community"                                           → root
"/community/exchange"                                  → root
"/apps"                                                → root
"/account/me"                                          → root

// 我的：必须早于 map 子树规则
"/account/me/"      (前缀)                              → parent "/account/me"
"/account/security"                                    → parent "/account/me"
"/account/login"                                       → parent "/account/me"
"/account/register"                                    → parent "/account/me"
"/account/password-reset"                              → parent "/account/me"
"/about"                                               → parent "/account/me"
"/community/exchange/me"  (前缀)                        → parent "/account/me"

// 交换地图
"/community/exchange/offices/" (前缀)                   → parent "/community/exchange"
"/community/exchange/"     (前缀)                       → parent "/community/exchange"

// 社区
"/community/cards/submissions/" (前缀)                  → parent "/community/cards"
"/community/cards"                                     → parent "/community"
"/community/"              (前缀)                       → parent "/community"
"/events/"                 (前缀)                       → parent "/events"
"/events"                                              → parent "/community"
"/producer-map"                                        → parent "/community"

// 资料
"/wiki/modern"             (前缀)                       → parent "/apps"
"/wiki"                    (前缀)                       → parent "/apps"
"/story/modern"            (前缀)                       → parent "/wiki"
"/story"                   (前缀)                       → parent "/wiki"
"/works/"                  (前缀)                       → parent "/works"
"/works"                                               → parent "/apps"
"/packages/"               (前缀)                       → parent "/works"
"/chronicle/"              (前缀)                       → parent "/chronicle"
"/chronicle"                                           → parent "/apps"
"/tier-list"                                           → parent "/apps"
"/live"                                                → parent "/apps"
"/recommendations"                                     → parent "/apps"

// 首页
"/information/"            (前缀)                       → parent "/"
```

顺序约束（与 `appTabIdForPathname` 同一原因，必须写进注释与测试）：

1. `/account/me` 与 `/account/me/*` 在 `/community/exchange/me` 与 map 子树之前判定。
2. `/community/exchange/me` 必须在 `/community/exchange/offices/` 与 `/community/exchange/` 之前。
3. `/community/cards/submissions/` 必须在 `/community/cards` 之前。
4. `/apps`（root）与 `/wiki`、`/story` 不冲突，但 `/wiki/modern`、`/story/modern` 必须在各自的短前缀之前，以免 `/wiki` 先命中后把 `/wiki/modern` 也当作 `/wiki`（两者父级相同，顺序仅为可读性与显式性）。
5. `/` 是精确匹配，`"/"` 的前缀规则会把所有路径吞掉，因此 `/` 只能用 `===` 判定。

覆盖校验：31 条 App 目标路由逐条落在 `parent` 或 `root`，没有 `unknown`。该断言由单元测试锁定（`routes-app-target.test.ts` 已锁定数量 31）。

## 3. 行为设计

### 3.1 顶栏返回按钮

```ts
const backTarget = resolveAppBackTarget(pathname)
const showBack = backTarget.kind !== "root"
```

三分支渲染结构不变：首页 → 品牌行；`kind === "root"` → 仅标题；否则 → 返回按钮 + 标题。首页 `/` 既是 `root` 又走品牌行，行为不变。

### 3.2 `goBack()`

```
1. 解析当前 pathname → target
2. target.kind === "root"  → 直接返回（控件本就不渲染）
3. target.kind === "parent" → 树返回（§3.3）
4. target.kind === "unknown" → 安全兜底（§4.2）
```

分支 1 与 3 之前保持现有的 `rememberCurrentLocation()` / `cancelPending()` / `cancelRestoration()` 调用顺序，避免破坏滚动恢复。

### 3.3 树返回的 pop / replace 选择

```ts
const { entries, index } = stateRef.current.history
const below = entries[index - 1]
if (below && pathnameFromHref(below.href) === target.href) {
  navigate(-1)                                   // 父级已在下一层：走 POP
} else {
  navigate(target.href, { replace: true })       // 否则替换当前项
}
```

- 比较是 **pathname 相等**，不是 href 相等。下一层是 `/community?page=2` 时父级 `/community` 命中 POP，保留用户在那个栏目根上的筛选与阅读位置。
- POP 分支让历史保持浅，且复用 Router 的既有滚动恢复。
- `replace` 分支覆盖"父级不在下一层"的全部情况（跨栏目跳转、深链接直达、替换式重定向之后），并保证不产生返回环。

### 3.4 Android 系统返回

注册条件从 `hierarchyBackTarget !== null` 改为 `target.kind === "parent"`。栏目根不注册，交给 Tauri 默认行为（PRD R6）。

`onBackButtonPress` 的 payload 携带 `canGoBack`，本设计不使用它：树返回是 `replace` 语义，与 `canGoBack` 无关，引入它只会让落点依赖 WebView 状态。

### 3.5 iOS 边缘滑动（POP 纠正）

`useLayoutEffect` 中现有的 POP 纠正保留结构，只替换数据源与显隐判据：

```
navigationType === "POP"
且 previous 存在、previous.key !== currentLocation.key        // 只认真正的 POP
且 resolveAppBackTarget(previous.pathname).kind === "parent"
且 target.href !== currentLocation.pathname
→ navigate(target.href)                                        // 保持 push
```

保持 push（而非改成 replace）的理由：push 会截断被 POP 丢弃的"前向"子页项，同时保留当前项下方的历史，因此纠正之后再一次原生手势仍能继续上溯或到达上一个栏目。push 不会引发纠正链——纠正本身是 PUSH，`navigationType !== "POP"`——也不会形成环：从纠正后的父级再 POP，其 `previous` 若已是树根则不再纠正。

纠正与按钮共用 `resolveAppBackTarget`，这是"三个入口一个落点"的实现保证。

### 3.6 查询串与片段

父级解析只看 pathname。`/wiki?agency=X` 的父级是 `/apps`，`/community/exchange/me?section=profile` 的父级是 `/account/me`。查询串变化不产生新节点，因此不再需要"同 pathname 不同 query 是否为同一层"的例外规则。

## 4. 兼容与回归

### 4.1 保留的机制

`rememberAppNavigationLocation`、`observeAppHistoryCommit`、`updateAppNavigationIdentity`、`isPersonalAppRoute`、`activateTab`、`queueTabNavigation`、滚动恢复与栏目快照全部不动。本设计只替换"返回目标解析"，不动状态机。

### 4.2 树外路由的安全兜底

`kind === "unknown"` 时沿用现有 `goBack` 的末段逻辑：`hasUsableAppHistoryBack` → `navigate(-1)`；否则 `appTabRoot(appTabIdForPathname(...)) ?? "/"`，并用 `queueTabNavigation` 的 replace 语义落地。App 的 31 条路由全部在树内，该分支只服务错误页，不影响正常页面。

### 4.3 与页面内固定链接的关系

树只决定**返回控件**的目标，不改变页面内链接。已知不一致处（`/story` 页面内的"企划目录"→ `/wiki?agency=…`、作品详情的"返回作品中心"→ `/works`）与树一致或更细，保持原样。`/story` 的"首页"→ `/` 是跨栏目链接，属于页面内导航，不属于返回。

### 4.4 破坏性变更

| 变更 | 影响 |
| --- | --- |
| `appBackHierarchyTarget` 被 `resolveAppBackTarget` 取代 | 该函数是仓库内唯一导出，替换后需同步 spec §2 与 §6；无外部消费者 |
| 从 `/community/cards` 恢复后返回的落点由"另一个栏目"变为 `/community` | PRD 明确要求，E2E `app-navigation.spec.ts:79-133` 需改写 |
| 栏目根的返回按钮语义不变（仍不渲染），但 `goBack` 在根上是 no-op | `app-navigation-provider.test.tsx:528-537`、`586-594` 需改写；改用原生返回按钮模拟或直接断言 no-op |
| `/account/login`、`/account/register`、`/account/password-reset` 的返回目标从"历史兜底到栏目根"变为显式规则 `/account/me` | 落点不变，`app-top-bar.test.tsx:66-78` 断言可保留 |

## 5. 权衡与被否决的方案

**否决：引入每栏目独立返回栈。** 需要在返回语义之外额外维护栈的推入/弹出规则，并处理深链接冷启动下的空栈，复杂度高于静态表；且用户要的是"页面归属决定返回"，不是"访问顺序决定返回"。

**否决：把 WebView 历史改造成树形（进入子页前先插入父级项）。** 需要绕过 React Router 直接操作 `history.pushState`，会与 Router 内部索引状态分裂，风险高于收益。

**否决：在 iOS 上关闭 `allowsBackForwardNavigationGestures`。** 能消除手势与按钮的分歧，但需要改 `src-tauri/src/lib.rs` 并重新出包验证，且会移除 iOS 用户预期的边缘滑动。本任务把原生手势的残留差异写入 PRD R6 与验证文档，留待单独决策。

**接受：静态树可能"猜错"用户来向。** 从首页点入 `/events` 后返回落到 `/community` 而非 `/`。这是树模型的必然结果，也是本任务要建立的语义；页面内链接仍提供回到首页的路径。

## 6. 追加需求的实现（R7、R8）

用户在实现阶段追加两条与返回树正交的需求，按 PRD 的 R7、R8 执行。

**R7 资料目录**：`coreResourceLinks` 从两条改为一条，`app-resource-story` 整项删除，`app-resource-wiki` 的 `title` 改为 `剧情站`（`href` 仍为 `/wiki`）。目录页两处文案去掉「Wiki」与作为独立入口的「剧情」。

「剧情站」在仓库里已有先例（`i18n/resources.ts` 的 `storySite`、作品页的「进入剧情站」、页脚站点导航），所以这个标题沿用既有用语，不是新造词。

**R8 刷新按钮**：移除四处页面级刷新图标按钮。收藏夹、事务所与名片认领的 section 组件同时服务 `/community/exchange/me` 与 `/account/me/:section`，所以移除在两种入口下同时生效；独立页头部自己的刷新按钮不动。冲突提示的「载入最新…」与失败态的「重新载入」保留，它们是错误恢复而不是刷新。

**回滚**：两条需求各自独立，可按文件粒度回滚，不影响返回树。

## 7. 发布与回滚

改动集中在前端 App 壳，无数据迁移、无接口变更、无配置项。

- 发布：随 App 构建发布；移动浏览器回退构建同步生效。
- 回滚：还原上述 3 个源文件与测试即可，无残留状态（逻辑树是模块级常量，没有持久化）。
- 验证顺序：单元测试（`app-tab-model.test.ts`、`app-top-bar.test.tsx`、`app-navigation-provider.test.tsx`）→ E2E（`app-navigation.spec.ts` 等）→ 设备（iOS 边缘滑动、Android 系统返回）。
