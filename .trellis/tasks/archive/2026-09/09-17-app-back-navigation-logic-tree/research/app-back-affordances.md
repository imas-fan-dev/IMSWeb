# App 返回导航现状事实清单

调研范围：`apps/web`（App 目标，`VITE_IMS_APP_TARGET=app`）。
目的：为「每个页面有唯一逻辑父级」的树形返回模型收集冲突点与既有契约。

所有行号基于当前工作区 HEAD 状态，只读调研，未修改任何源码。

---

## 0. 一句话结论

现行 App 返回语义是「**混合模型**」，不是单一策略：

- **只有「我的」子页**（`appBackHierarchyTarget` 非空：`/account/me/:section`、`/account/security`）走层级上溯；
- **其余所有页面**走 `hasUsableAppHistoryBack()` → `navigate(-1)`，即浏览历史回放；历史不可用时回退到**所属 Tab 的根**（`appTabRoot`），而不是逻辑父级。

因此要把「返回」换成全局逻辑树，需要处理四类硬冲突：

1. **入口回退目标是 Tab 根，不是逻辑父级**（`app-navigation-provider.tsx:243-257`，测试在 `app-top-bar.test.tsx:64-77`、`app-navigation.spec.ts:228-249` 锁死）。
2. **POP（iOS 边缘滑动 / Android 系统返回）修正逻辑硬编码在账号层级上**（`app-navigation-provider.tsx:306-314`），且 Android 的 `onBackButtonPress` 监听器**只在层级目标非空时注册**（`app-navigation-provider.tsx:278`）。
3. **页面内部大量固定 href 的父子导航链接**（详见 §3，App 可见约 35 处），它们不经过 `goBack()`，与逻辑树并存会出现两套父级定义。
4. **同 pathname 的 query-only 跳转**（`/wiki?agency=`、`/community/exchange/me?section=`）会 push 历史，而 `appBackHierarchyTarget` 只比较 pathname（`app-tab-model.ts:101-107`）。

---

## 1. 现行返回语义（实现事实）

### 1.1 顶栏返回按钮

- `apps/web/app/components/app/app-top-bar.tsx:25-27`：`isHome = pathname === "/"`；`isTabRoot = activeTab?.to === pathname`。
- 渲染三分支：首页 → 品牌行；Tab 根 → 仅标题；**其余 → 返回按钮**（`app-top-bar.tsx:43-53`，`onClick={goBack}` 在 49 行）。
- `app-top-bar.tsx:23`：`isNonScrollingAppRoute(pathname)` 为真时整个 TopBar 返回 `null`。该函数只对 `/community/exchange` 为真（`app/lib/app-shell-scroll.ts:12-14`）。**结论：交换地图整页没有顶栏返回按钮**，它靠自己的浮层导航。

### 1.2 `goBack()` 主逻辑

`apps/web/app/components/app/app-navigation-provider.tsx:220-266`：

| 分支 | 行号 | 行为 |
| --- | --- | --- |
| 层级分支 | 229-241 | `hierarchyBackTarget` 非空时：若历史上一项 pathname === 目标则 `navigate(-1)`，否则 `navigate(target, { replace: true })` |
| 历史分支 | 243-246 | `hasUsableAppHistoryBack()` → `navigate(-1)` |
| Tab 根回退 | 248-257 | 取 `appTabIdForPathname` → `appTabRoot(activeId)`，`queueTabNavigation(..., replace=true)` |

层级目标定义在 `apps/web/app/components/app/app-tab-model.ts:101-107`：

```ts
if (normalized === "/account/me") return null
if (normalized === "/account/security") return "/account/me"
if (pathBelongsTo(normalized, "/account/me")) return "/account/me"
return null
```

即 `appBackHierarchyTarget` 只覆盖 `/account/me/*` 与 `/account/security`；`/about`、`/community/exchange/me`、`/account/login`、`/account/register`、`/account/password-reset` 全部返回 `null`。

### 1.3 历史可用性判定

`apps/web/app/lib/app-navigation-state.ts:146-149`：

```ts
export function hasUsableAppHistoryBack(state) {
  if (state.history.index <= 0) return false
  return state.history.entries[state.history.index - 1]?.tabId !== null
}
```

`history` 由 `observeAppHistoryCommit()` 同期维护（`app-navigation-state.ts:99-143`），并同时承载 **Tab 快照**（`snapshots`，用于切换 Tab 恢复 href + 滚动位置）和**身份失效**（`updateAppNavigationIdentity`，`app-navigation-state.ts:151-165`）。这两件事与返回语义共享同一个 state 对象，树形改造不能简单删除。

### 1.4 POP 修正

`app-navigation-provider.tsx:306-314`：`navigationType === "POP"` 且上一提交位置的 `appBackHierarchyTarget` 非空时，`navigate(leftTarget)`（push）。这是为了修 iOS 边缘滑动 / Tauri 默认 Android 返回落在「上一个 Tab」。

### 1.5 原生手势接线

- Android：`app-navigation-provider.tsx:270-299`，`isTauri()` 且 `hierarchyBackTarget` 非空才注册 `onBackButtonPress`。**注释明确写了「register the listener for those pages only」**，其余页面保留 Tauri 默认的「回退历史或退出 App」。
- iOS：`apps/web/src-tauri/src/lib.rs:6-27`（`enable_ios_back_swipe`）对**全应用**开启 `allowsBackForwardNavigationGestures`，即任何页面都会 pop WKWebView 会话历史；`lib.rs:9-12` 的注释仍写着「我的 subpages 之上是 /account/me」，与树形模型不符。

---

## 2. App 可达路由清单与归属

来源：`apps/web/app/route-metadata.ts`。`targets` 含 `"app"` 的一共 **31 条**（由 `apps/web/tests/unit/routes-app-target.test.ts:69` 锁定），其中 **28 条 prerender**（同文件 `:73`）。

`delivery` 语义：`prerender` 产出静态 HTML；`spa` 走客户端 SPA 回退（`spaFallbackPatternsForTarget`，`route-metadata.ts:460-523`）；`none` 既不预渲染也不在 SPA 回退模式内。

### 2.1 public 布局 + App 目标（31 条）

| # | route-metadata.ts | route path | 页面文件 | delivery | 当前 Tab 归属 |
| --- | --- | --- | --- | --- | --- |
| 1 | 52 | `/`（index） | `pages/home/index.tsx` | prerender `/` | home |
| 2 | 62 | `about` | `pages/about/index.tsx` | prerender `/about` | account（`/about` 在 `ACCOUNT_PREFIXES`，`app-tab-model.ts:39`） |
| 3 | 72 | `events` | `pages/events/index.tsx` | prerender `/events` | community |
| 4 | 82 | `events/:eventId` | `pages/events/event-detail-page.tsx` | spa | community |
| 5 | 89 | `recommendations` | `pages/recommendations/index.tsx` | prerender | resources |
| 6 | 99 | `live` | `pages/live/index.tsx` | prerender | resources |
| 7 | 102 | `community` | `pages/community/index.tsx` | prerender | community |
| 8 | 112 | `account/login` | `pages/account/login/account-login-page.tsx` | prerender | account |
| 9 | 122 | `account/register` | `pages/account/register/account-register-page.tsx` | prerender | account |
| 10 | 132 | `account/password-reset` | `pages/account/reset/account-password-reset-page.tsx` | prerender | account |
| 11 | 142 | `account/security` | `pages/account/security/account-security-page.tsx` | prerender | account |
| 12 | 152 | `community/exchange` | `pages/community/exchange/community-exchange-page.tsx` | prerender | **map**（Tab 根，且无顶栏） |
| 13 | 162 | `community/exchange/me` | `pages/community/exchange/me/community-exchange-me-page.tsx` | spa | **account**（先命中 `ACCOUNT_PREFIXES` 的 `/community/exchange/me`，`app-tab-model.ts:38-39,71`） |
| 14 | 169 | `community/exchange/offices/:officeSlug` | `pages/community/exchange/community-office-page.tsx` | spa | map |
| 15 | 176 | `community/cards` | `pages/community/community-cards-page.tsx` | prerender | community |
| 16 | 186 | `community/cards/submissions/:id` | `pages/community/namecard-submission-page.tsx` | none | community |
| 17 | 193 | `producer-map` | `pages/producer-map/index.tsx` | prerender | community |
| 18 | 203 | `tier-list` | `pages/tier-list/index.tsx` | prerender | resources |
| 19 | 213 | `works` | `pages/works/index.tsx` | prerender | resources |
| 20 | 223 | `works/:workSlug` | `pages/works/work-detail-page.tsx` | prerender（8 个 slug） | resources |
| 21 | 233 | `wiki` | `pages/wiki/modern/index.tsx` | prerender（id `pages/wiki/modern/wiki-index-default`） | resources |
| 22 | 244 | `wiki/modern` | `pages/wiki/modern/index.tsx` | prerender | resources |
| 23 | 254 | `story` | `pages/wiki/modern/story-page.tsx` | prerender（id `pages/wiki/modern/story-default`） | resources |
| 24 | 265 | `story/modern` | `pages/wiki/modern/story-page.tsx` | prerender | resources |
| 25 | 275 | `information/:contentId` | `pages/information/information-content-page.tsx` | spa | home |
| 26 | 282 | `chronicle` | `pages/chronicle/index.tsx` | prerender | resources |
| 27 | 292 | `chronicle/:activityId` | `pages/chronicle/activity-page.tsx` | spa | resources |
| 28 | 299 | `packages/:siteSlug` | `pages/sites/site-detail-page.tsx` | none | resources |
| 29 | 306 | `apps` | `pages/apps/index.tsx` | none | resources（Tab 根） |
| 30 | 307 | `account/me` | `pages/account/me/account-me-page.tsx` | none | account（Tab 根） |
| 31 | 314 | `account/me/:section` | `pages/account/me/account-me-section-page.tsx` | none | account |

### 2.2 明确排除（不在 App 目标内）

- `route-metadata.ts:321` `wiki/classic`（standalone，`WEB_TARGET`）
- `route-metadata.ts:331` `story/classic`（standalone，`WEB_TARGET`）
- `route-metadata.ts:341` `admin/login` 与 `:348-445` 全部 `admin` 布局路由（`WEB_TARGET`）

旁证：`apps/web/tests/unit/routes-app-target.test.ts:80-81` 断言 `wiki/classic`、`story/classic` 在 App 清单中为 `undefined`；`:88-91` 断言 `apps`、`account/me/:section` 不在 Web 清单中。

`pages/wiki/classic/**` 里确实有返回控件（见 §3.6），但它们**不进 App 包**，改造时可以忽略。

### 2.3 Tab 归属实现

`apps/web/app/components/app/app-tab-model.ts`：

- `APP_TABS`（`:9-35`）：`/`、`/community`、`/community/exchange`、`/apps`、`/account/me`
- `PERSONAL_PREFIXES`（`:38`）`["/account", "/community/exchange/me"]`
- `ACCOUNT_PREFIXES`（`:39`）`[...PERSONAL_PREFIXES, "/about"]`
- `COMMUNITY_PREFIXES`（`:41`）`["/community", "/events", "/producer-map"]`
- `RESOURCE_PREFIXES`（`:43-53`）`["/apps", "/wiki", "/story", "/works", "/chronicle", "/recommendations", "/live", "/tier-list", "/packages"]`
- 匹配顺序（`:69-84`）：`ACCOUNT` → `/community/exchange`（map）→ `COMMUNITY` → `RESOURCE` → `/` 与 `/information`（home）→ `null`
- **未归属**：`/tier-list` 之外无遗漏；`/producer-map` 归 community；`/information/*` 归 home。

---

## 3. 页面内自带的返回 / 父级导航控件

图例：**App 可见** = 在 App 构建中会渲染；**Web only** = 被 `IS_APP_TARGET` 或 `webOnly()` 屏蔽。

### 3.1 `pages/account/me/`

| 文件:行 | 目标 | 机制 | App 可见 |
| --- | --- | --- | --- |
| `account-me-page.tsx:279` | `/account/me/${section.id}` | 固定 href（进入子页，反向父级） | 是 |
| `account-me-page.tsx:46` | `/about` | 固定 href | 是 |
| `account-me-page.tsx:185` | `/account/login` | 固定 href | 是 |
| `account-me-page.tsx:194` | `/account/register` | 固定 href | 是 |
| `account-me-page.tsx:200` | `/account/password-reset` | 固定 href | 是 |
| `account-me-page.tsx:319` | `/account/security` | 固定 href | 是 |
| `account-me-section-page.tsx:11` | `/account/me` | `<Navigate replace />`（section 非法时） | 是 |
| `community/exchange/me/profile-workspace-navigation.tsx:132-133` | `/community/exchange/me` / `?section=` | 固定 href | **否**：`:101` `if (sectionBasePath) return null`，App 的 `/account/me/:section` 传入 `sectionBasePath="/account/me"`（`account-me-section-page.tsx:16`） |

**注意**：App 的账号子页没有任何页面内「返回」链接，返回完全依赖顶栏 / 系统手势。

### 3.2 `pages/community/exchange/`

| 文件:行 | 目标 | 机制 | App 可见 |
| --- | --- | --- | --- |
| `community-office-page.tsx:515-520` | `/community/exchange` | 固定 href `NavigationLink` + `ArrowLeftIcon`「返回事务所列表」 | 是 |
| `community-office-page.tsx:497-503` | `/community/exchange` | 固定 href（空态） | 是 |
| `community-office-page.tsx:605-611` | `/account/login` | 固定 href | 是 |
| `community-office-page.tsx:628-632` | `/community/exchange/me` | 固定 href「管理我的名片」 | 是 |
| `community-office-page.tsx:654-658` | `/community/exchange/me` | 固定 href「创建可公开名片」 | 是 |
| `community-office-page.tsx:709-713` | `/community/exchange/me` | 固定 href「管理名片」 | 是 |
| `components/exchange-discovery-rail.tsx:224-258` | `/community/exchange/offices/${slug}` | 固定 href（发现栏列表项） | 是 |
| `components/exchange-discovery-rail.tsx:290-296` | `/community/exchange/me` | 固定 href「管理」 | 是 |
| `components/exchange-mobile-navigation.tsx:146-154` | `/community/exchange/me` | 固定 href（地图浮层「我的」） | 是 |
| `community-exchange-page.tsx:850-858` | `/community/exchange/me` | 固定 href（地图右上角 icon） | 是 |
| `community-exchange-page.tsx:985-991` | `/community` | 固定 href「返回制作人社区」（**仅 closed 空态**） | 是 |
| `community-exchange-map-section.tsx:126-130` | `/community/exchange/offices/${slug}` | 固定 href | 是 |
| `exchange-components.tsx:88-92` | `/community/exchange/offices/${slug}` | 固定 href | 是 |
| `me/community-exchange-me-workspace.tsx:289-292` | `/community/exchange` | 固定 href「返回交换事务所」（匿名空态） | 是 |
| `me/community-exchange-me-workspace.tsx:357-360` | `/community/exchange` | 固定 href（加载失败空态） | 是 |
| `me/community-exchange-me-workspace.tsx:397-401` | `/community/exchange` | 固定 href「名片交换事务所」面包屑 | 是 |

### 3.3 `pages/community/`（名片墙 / 投稿）

| 文件:行 | 目标 | 机制 | App 可见 |
| --- | --- | --- | --- |
| `community-cards-page.tsx:492-502` | `/community` | 固定 href「返回社区」 | **否**：`:492` `{!IS_APP_TARGET ? ...}` |
| `namecard-submission-page.tsx:247-256` | `/community/cards` | 固定 href「返回名片墙」 | **否**：`:247` `{!IS_APP_TARGET ? ...}` |
| `hooks/use-namecard-preview-navigation.ts:129-130` | — | `navigate(-1)` / `navigate(1)` | 是，但**不是路由**：同名局部函数操作名片预览的下标（`use-namecard-preview-navigation.ts:67-107`），**改造时不要误删或误改** |
| `hooks/use-namecard-preview-return.ts:1-75` | — | 关闭弹层后恢复焦点与滚动（无路由跳转） | 无关 |
| `components/community/namecard-upload-dialog.tsx:236-241` | `/community/exchange/me` | 固定 href「前往我的名片」 | 是（App 在 `/community/cards` 渲染该浮层，`app-layout.tsx:53,104`） |
| `components/community/namecard-upload-dialog.tsx:263` | `namecardSubmissionManagePath()` → `/community/cards/submissions/:id#token=…` | 固定 href | 是 |

### 3.4 `pages/wiki/modern/`（App 的 wiki 实现）

| 文件:行 | 目标 | 机制 | App 可见 |
| --- | --- | --- | --- |
| `modern/index.tsx:131-133` | `setSearchParams({ agency })` | 改 query（默认 **push** 历史） | 是 |
| `modern/index.tsx:166-170` | 同上（企划 tab 按钮） | `onClick={selectAgency}` | 是 |
| `modern/index.tsx:143-147` | `/wiki/classic…` | `classicHref`，App 目标下传 `undefined` | **否**（`:143-146` 三元） |
| `components/wiki-hero.tsx:18-22` + `:61-67` | `/story?agency=…&idol=…&…` | 固定 href「查看对应卡片」 | 是 |
| `components/wiki-hero.tsx:69-77` | `webOnly(classicHref)` | `webOnly()` → App 下 `resolveNavigation` 返回 `unavailable`，整条渲染 `null` | **否**（`lib/navigation/navigation-target.ts:40`，`lib/navigation/resolve-navigation.ts:113`，`components/navigation/navigation-link.tsx:46`） |
| `components/wiki-idol-grid.tsx:106-134` | `/story?agency=…&idol=…` | 固定 href | 是 |
| `components/wiki-agency-dial.tsx:489,497` | `onSelectAgency(name)` | 回调 → `setSearchParams` | 是 |
| `story-page.tsx:188-193` | `/wiki` | 固定 href「返回剧情档案」（缺参空态） | 是 |
| `story-page.tsx:216-222` | `/wiki?agency=…` | 固定 href「返回内容目录」（加载错误态） | 是 |
| `story-page.tsx:257-264` | `/wiki?agency=…` | 固定 href + `ArrowLeftIcon`（页面内企划面包屑） | 是 |
| `story-page.tsx:274-283` | `webOnly(/story/classic…)` | App 下 `null` | **否** |
| `components/story-navigation-panel.tsx:32-42` | `/` | 固定 href「首页」+ `HouseIcon` | 是 |
| `components/story-navigation-panel.tsx:43-53` | `/wiki?agency=…` | 固定 href「企划目录」+ `ArrowLeftIcon` | 是 |
| `components/story-navigation-panel.tsx:56-66` | `webOnly(classicHref)` | App 下 `null` | **否** |
| `components/story-navigation-panel.tsx:69-82` | `#story-category-N` | 页内锚点 | 是（不产生路由） |

`story-navigation-panel` 在 `story-page.tsx:409`（`lg` 侧栏）与 `:456-461`（移动端抽屉，`onNavigate` 关闭抽屉）渲染。

**这一类是结构性问题**：`/wiki` 与 `/story` 互相以固定 href 导航（`/wiki` → `/story?...` → `/wiki?agency=...`），而 `/apps` 目录也直接指向 `/wiki`、`/story`（`pages/apps/apps-directory-model.ts:16,26`）。逻辑树必须同时满足「/story 的父级是 /wiki」和「/apps 目录直达 /story 后返回 /apps」两种期望。

### 3.5 详情页（App 可见的固定 href「返回」）

| 文件:行 | 目标 | 机制 | App 可见 |
| --- | --- | --- | --- |
| `pages/works/work-detail-page.tsx:83-88` | `/works` | 固定 href（2xl 侧栏）「返回作品中心」 | 是 |
| `pages/works/work-detail-page.tsx:120-125` | `/works` | 固定 href（移动端行） | 是 |
| `pages/works/work-detail-page.tsx:284-289` | `/works` | 固定 href（404 态） | 是 |
| `pages/works/work-detail-page.tsx:32-34,52-63` | `getWorkDestination(entry)` → `/works/:slug` 或 `/wiki?agency=…` | 固定 href「剧情站」 | 是 |
| `pages/chronicle/activity-page.tsx:72-78` | `/chronicle` | 固定 href「返回编年史」 | 是 |
| `pages/events/event-detail-page.tsx:51` | — | `showBackLink={!IS_APP_TARGET}` → `community-post-detail.tsx:152-158` 的「返回社区动态」（`/events`）在 App 不渲染 | **否** |
| `pages/information/information-content-page.tsx:71-78`、`:87-94` | `/` | 固定 href「返回首页」 | **否**（两处 `!IS_APP_TARGET`） |
| `pages/sites/site-detail-page.tsx:81-89` | `/works` | 固定 href「返回作品中心」 | **否**（`!IS_APP_TARGET`） |
| `pages/sites/site-detail-page.tsx:112-118` | `publicSite(slug)` → `/sites/<slug>` | 语义目标；App 下 `publicPageDecision` 返回 `system` → 交给系统浏览器，**不是 App 内路由** | 是（但离开 App） |

### 3.6 `pages/wiki/classic/`（Web 专用，可忽略）

`classic-story-page.tsx:147,170`、`classic/components/story/classic-story-profile.tsx:38-46`（「返回上一页」→ `/wiki/classic?agency=`）、`classic/components/wiki/classic-agency-navigation.tsx:124`（→ `/`）、`classic/components/wiki/classic-mobile-bar.tsx:16-17`（→ `/`）。全部 `WEB_TARGET`，App 包内不存在。

### 3.7 易误判为「返回」的控件（改造时不要动）

- `pages/home/components/birthday-calendar.tsx:130,143`：月份切换 `ChevronLeft/Right`。
- `pages/live/index.tsx:373,389`：列表分页。
- `pages/community/community-cards-page.tsx:687-694`：分页「上一页」。
- `pages/community/exchange/exchange-card-wall.tsx:230`、`pages/wiki/modern/components/wiki-agency-dial.tsx:471`：`ArrowLeft` 键盘快捷键（地图平移 / 拨盘）。
- `apps/web/app/pages/admin/**`（`admin/cards/index.tsx:382`、`admin/stories/story-cover-assets-page.tsx:185` 等）：全部 Web only。
- `apps/web/app/components/shared/admin-return-shortcut.tsx`：admin 布局专用，App 不引用。

---

## 4. 深链接入口

### 4.1 结论

打包 App **没有** deep link 能力：`apps/web/src-tauri/tauri.conf.json` 无 `plugins` 段、无 URL scheme；`capabilities/default.json` 只有 `core:default` + `opener:allow-open-url`，没有 `deep-link` 权限；`docs/development/tauri-mobile.md:323` 明确列出「App 暂不显示 OAuth provider，后续需要 **deep link** 与一次性 token exchange 后才能开放」。Rust 侧 `src-tauri/src/lib.rs` 也没有处理初始 URL。

因此 App 内的深链接入口只有两类：

1. **移动浏览器回退**：App 构建由 `apps/web/playwright.app.config.ts:29-40` 的 `pnpm dev:app` 在 `http://localhost:1420` 提供，浏览器可直接输入任意 App 路由。E2E 大量使用这种冷启动直达（见下表）。
2. **外部/系统浏览器**：`NavigationLink` 对语义目标 `publicPage/publicSite`、外部 URL 在 Tauri 中走 opener（`lib/navigation/resolve-navigation.ts:74-84,105-122`；`lib/navigation/system-opener.ts:5-7`），打开的是系统浏览器而不是 App。

### 4.2 冷启动直达的既有证据（E2E `page.goto`）

| 测试 | 直达路由 |
| --- | --- |
| `tests/e2e/app-navigation.spec.ts:93,152,240,261,284,308` | `/community/cards?page=2&size=12` |
| `tests/e2e/app-navigation.spec.ts:194` | `/works/765?edition=2#intro` |
| `tests/e2e/app-navigation.spec.ts:448,512` | `/account/me` |
| `tests/e2e/app-navigation.spec.ts:468` | `/account/me/cards` |
| `tests/e2e/app-navigation.spec.ts:482,497` | `/apps` |
| `tests/e2e/app-account.spec.ts:257` | `/account/me`（`openAccountRoot`） |
| `tests/e2e/app-map.spec.ts:156,195,472` | `/community/exchange` |
| `tests/e2e/app-map.spec.ts:457` | `/community/exchange/me` |
| `tests/e2e/app-interactive-pages.spec.ts:54` | `/works/765` |
| `tests/e2e/app-interactive-pages.spec.ts:85` | `/tier-list` |
| `tests/e2e/app-wiki.spec.ts:89` | `/wiki` |
| `tests/e2e/app-namecard-browsing.spec.ts:26,85` | `/community/cards?page=…` |
| `tests/e2e/app-events.spec.ts:433` | `/`（再由首页进入列表/详情） |

### 4.3 「分享链接目标」的判定

代码里**没有** `navigator.share` / 复制链接 / 分享按钮（全仓 `apps/web/app/pages` 无匹配）。因此「分享目标」只能按「URL 可独立打开且有意义」判断：

- **prerender（28 条）**：直接产出静态 HTML，天然可作为分享目标。重点包括 `/community/cards`（名片墙）、`/works/:workSlug`、`/events`、`/wiki`、`/story`、`/chronicle`、`/about`、`/account/security`、`/account/login|register|password-reset`。
- **spa（5 条 App 路由）**：`/events/:eventId`、`/community/exchange/me`、`/community/exchange/offices/:officeSlug`、`/information/:contentId`、`/chronicle/:activityId`。这些是**最典型的深链接目标**（详情页），冷启动时 `hasUsableAppHistoryBack()` 必然为 false。
- **none（4 条）**：`/community/cards/submissions/:id`（投稿回执，保存的链接）、`/packages/:siteSlug`、`/apps`、`/account/me`、`/account/me/:section`。

### 4.4 无 App 内入站链接的路由（只有深链接才能到达）

- `/packages/:siteSlug`：`pages/sites/site-detail-page.tsx` 存在，但全仓无任何 `to="/packages/…"` 引用（`/sites/<slug>` 是另一回事，指向服务器静态内容）。搜索 `'/packages'` 仅命中 `app-tab-model.ts:52` 的归属前缀。
- `/information/:contentId`：全仓无 `to=`/`href=` 引用（仅 `lib/api/endpoints/home.ts:54` 的 API 路径与 `information-document-frame.tsx:83` 的内容子路径）。且该页在 `information-content-page.tsx:36-37` 会 `<Navigate to={/events/${postId}} replace />`，**用 replace 抹掉自身历史项**。
- `/tier-list`、`/live`、`/recommendations`：`/apps` 目录只能通过 API 下发的 `homepage-links` 间接入口（`apps-directory-model.ts:105-150` 的 `groupAppsDirectoryLinks`），数据缺失即无入口。

---

## 5. 跨栏目跳转的真实入口

「栏目」按 `appTabIdForPathname` 的 5 个 Tab 计。以下都为**固定 href / 按钮回调**，会真实产生跨 Tab 跳转。

### 5.1 home → community

- `pages/home/components/home-feed.tsx:79`：`href="/events"`「查看全部动态」。
- `pages/home/components/home-feed-items.tsx:58`：`href={/events/${event.id}}`（站内动态条目）。
- E2E 覆盖：`tests/e2e/app-events.spec.ts:420` 起的流程（`/` → `/events` → `/events/1` → 返回 `/events`）。

### 5.2 home → resources

- `pages/home/components/home-hero.tsx:19` + `lib/series-wall.ts:10-66`：系列墙 `href="/works/<slug>"`（8 条，`/works/765`、`/works/cg`…）。
- `pages/home/components/random-idol.tsx:18-24,173`：`to={/story?agency=…&idol=…}`「查看剧情档案」。

### 5.3 community → map

- `pages/community/index.tsx:39`（`exchangeSection.to = "/community/exchange"`），渲染于 `:166`。

### 5.4 community → account

- `pages/community/exchange/community-office-page.tsx:605`：`/account/login`（「登录后布置」）。
  > 注意：`/community/exchange/offices/:slug` 归属 **map** Tab，所以这一条是 map → account。

### 5.5 map → account

- `components/exchange-mobile-navigation.tsx:146` → `/community/exchange/me`
- `components/exchange-discovery-rail.tsx:290` → `/community/exchange/me`
- `community-exchange-page.tsx:850` → `/community/exchange/me`
- `community-office-page.tsx:628,654,709` → `/community/exchange/me`
- `components/community/namecard-upload-dialog.tsx:236` → `/community/exchange/me`（浮层挂在 `/community/cards`，属 community Tab）

### 5.6 account → map

- `me/community-exchange-me-workspace.tsx:289,357,397` → `/community/exchange`（错误态与面包屑，App 可见）。

### 5.7 resources 内部与外溢

- `pages/apps/apps-directory-model.ts:16,26`：目录核心入口 `/wiki`、`/story`（resources 内部）。
- `pages/wiki/modern/components/wiki-idol-grid.tsx:108`、`wiki-hero.tsx:18-22`：`/wiki` → `/story`（resources 内部）。
- `pages/wiki/modern/story-page.tsx:188,217,258`、`story-navigation-panel.tsx:33,44`：`/story` → `/wiki` 或 `/`（**回到 home**，跨栏目）。
- `pages/works/works-content.ts:242-246` + `pages/works/index.tsx:32,72`：`/works` 目录大部分条目实际跳到 `/wiki?agency=…`（resources 内部），仅 `games`、`wows` 留在 `/works/<slug>`（`works-content.ts:196,216` 无 `wikiAgencyName`）。
- `pages/apps/apps-directory-model.ts:105-150`：API 下发的链接若归属 home（如 `/information/...`）或 community，会进入 `extensions` 分组并成为跨栏目入口。

### 5.8 同栏目但跨层级（树模型必须给出父级）

- `pages/community/index.tsx:19,25,46` → `/community/cards`、`/producer-map`、`/events`（community → community 子页）。
- `components/exchange-discovery-rail.tsx:226`、`community-exchange-map-section.tsx:126`、`exchange-components.tsx:88` → `/community/exchange/offices/:slug`。
- `pages/events/components/events-list.tsx:60` → `/events/:id`。
- `pages/chronicle/index.tsx:133` → `/chronicle/:id`。
- `pages/account/me/account-me-page.tsx:279` → `/account/me/:section`。
- `pages/community/namecard-submission-storage.ts:71-74` + `namecard-upload-dialog.tsx:170,263` → `/community/cards/submissions/:id`。

---

## 6. 现有测试契约

### 6.1 `tests/unit/components/app/app-tab-model.test.ts`（78 行）

| 行 | 断言 | 树形改造影响 |
| --- | --- | --- |
| 13-21 | `APP_TABS` 五个 Tab 与顺序 | **不要破坏** |
| 23-51 | `appTabIdForPathname` 归属表（含 `/community/exchange/me` → account、`/about` → account） | 所有权保留；若树模型需要独立的「逻辑父级」表，应新增而非改归属 |
| 53-70 | `appBackHierarchyTarget` 映射表：`/account/me`→null、`/account/me/*`→`/account/me`、`/account/security`→`/account/me`、`/account/login`、`/account/register`、`/account/password-reset` 三条→null、`/community/exchange/me*`→null、`/about`→null | **这就是要被替换的函数**，本块必须整体重写 |
| 72-79 | 尾斜杠归一化 + 未归属路由返回 `null` | 若删除 `appTabIdForPathname` 的 null 语义要同步改 |

### 6.2 `tests/unit/components/app/app-top-bar.test.tsx`（80 行）

| 行 | 测试 | 语义 |
| --- | --- | --- |
| 46-56 | 首页有主题切换、Tab 根没有 | 与返回无关，**保留** |
| 58-64 | `/apps` → 点「打开详情」到 `/works/sample` → 「返回」→ `/apps` | 结果层契约（逻辑父级满足即可），**保留行为**，实现可换 |
| 66-78 | `it.each`：`/account/login` → `/account/me`；`/community/exchange/offices/tokyo` → `/community/exchange` | **锁死「直达无历史 → 回 Tab 根」**。树模型下这两个值恰好等于「逻辑父级」时可通过；但 `/account/login`、`/account/register`、`/account/password-reset` 需要显式父级定义（当前 `appBackHierarchyTarget` 返回 null，回退到 `/account/me` 是巧合而非规则） |

### 6.3 `tests/unit/components/app/app-navigation-provider.test.tsx`（610 行）

会被树形模型影响的用例（按行）：

| 行 | 测试名 | 锁定的历史语义 |
| --- | --- | --- |
| 125-138 | restores the full last URL and source position before document replacement | Tab 快照 + 滚动恢复；末步 `/account/me` → 返回 → 上一个 Tab 的 `/community/cards…`（**「我的」Tab 根保留历史回放**） |
| 140-156 | keeps map root parameters without scrolling or adding history on reselection | `history.length` 不变（Tab 重选不 push） |
| 158-178 | keeps public office reading separate from Community and reselects the map root | 快照隔离 |
| 180-198 | records ordinary resource links and reselects root without pushing history | 根重选不新增历史项 |
| 200-214 | **replaces direct entry %s with its root without observed history**（`/community/cards?page=2`→`/community`；`/community/exchange/offices/tokyo?view=members`→`/community/exchange`） | 直达 → 回退到 Tab 根，且用 replace；随后再次进入 `/account/me` 后返回仍应回到同一根 |
| 216-229 | cancels earlier restores and preserves a still-pending reading target | 滚动恢复取消 |
| 231-240 | retains only the last action when clicks happen before a commit | 连点只保留最后一次 |
| 242-259 | restores %s when a section roundtrip happens before commit | 快照 |
| 261-270 | reselects a pending section after a rapid roundtrip | 快照 |
| 272-284 | keeps a pending root selection when another tab interrupts it | 快照 |
| 286-297 | preserves root query and hash when reselecting a pending root | 快照 |
| 299-313 | opens Community at its own root after visiting the fullscreen map | 快照 |
| 315-416 | resolves pending %s when identity becomes %s | 身份切换 + 个人路由失效（`/account/me/favorites`、`/about?from=…`） |
| 418-481 | （identity 前后浏览器提交的两种情形） | 同上 |
| 483-497 | cancels personal position restoration when identity changes after commit | 同上 |
| 499-526 | keeps public %s reading active when identity changes | 同上 |
| 528-537 | **does not add another history entry when reselecting a pending root** | `/apps` 重选后「返回」→ 上一个浏览项 `/works/example`（纯 POP 语义） |
| 539-548 | **lands on the account root from directly entered %s**（`/account/me/cards`、`/account/security`） | 层级上溯（现存行为，树模型应保持） |
| 550-559 | pops to the account root when the parent sits below the subpage | `navigate(-1)` 分支 |
| 561-571 | **pushes the account root when a native pop leaves a restored section** | POP 修正 effect（`app-navigation-provider.tsx:306-314`） |
| 573-584 | **replaces a cross-tab account subpage with the account root** | 跨 Tab 直达子页 → replace 到父级 |
| 586-594 | **keeps browsing history on the account root** | `/community/cards…` → 「我的」→ 返回 → 回到 `/community/cards…`（**当前明确要求 Tab 根不做层级上溯**，与「全局逻辑树」直接冲突） |
| 596-609 | does not recapture an old personal page after the account changes | 身份失效 |

`Probe`（`:42-70`）里有 `NavigationLink` 到 `/works/example?edition=2#intro`、`/community/exchange/offices/tokyo?view=members#team`、`/account/me/cards`、`/account/security`，以及一个模拟原生返回的 `navigate(-1)` 按钮（`:62-66`）。**修改返回语义时这些 inline 路由是最小改动面。**

### 6.4 `tests/e2e/app-navigation.spec.ts`（526 行）

| 行 | 测试 | 锁定的语义 |
| --- | --- | --- |
| 79-133 | resumes paginated reading after delayed data and follows actual history（`@app-webkit`） | `/community/cards…` → 我的 → 社区恢复滚动 → 「返回」→ `/account/me`；最后停在 `/community` 并断言 `返回` 按钮数量为 0（**Tab 根无返回按钮**） |
| 135-186 | keeps the reading position when reaction rows arrive after initial restoration | 滚动恢复 |
| 188-226 | resumes resource details and reselects a root without adding history | `/works/765…` → Tab 往返恢复；重选根时 `history.length` 不变 |
| 228-249 | **replaces direct-entry back fallback and preserves the selected owner** | 直达 `/community/cards…` → 「返回」→ `/community`，且 `history.length` **不变**（replace 语义）；社区 Tab 置为 `aria-current` |
| 251-276 | a newer section switch cancels a delayed restoration | 滚动恢复取消 |
| 278-297 | user scrolling cancels delayed restoration | 同上 |
| 302-433 | bounds restoration after shortened/error content | 同上 |
| 444-460 | keeps the app viewport free of pinch and double-tap zoom | **无关**，不要动 |
| 463-473 | **returns to the account root from a directly entered section** | `/account/me/cards` → 返回 → `/account/me` |
| 475-490 | **returns to the account root after entering a section from another tab** | `/apps` → 我的 → `/account/me` → `/account/me/cards` → 返回 → `/account/me` |
| 492-503 | **keeps browsing history on the account root** | `/apps` → 我的 → `page.goBack()` → `/apps`（显式用浏览器返回，锁死 Tab 根的历史语义） |
| 505-526 | **returns a restored account section to its root on a native pop** | `/account/me` → cards → 资料 → 我的（恢复 cards）→ `page.goBack()` → `/account/me` → `page.goBack()` → `/apps`（POP 修正 effect 的端到端契约） |

### 6.5 `tests/e2e/app-account.spec.ts`（598 行）

| 行 | 内容 | 与返回的关系 |
| --- | --- | --- |
| 281-286 | `test.beforeEach`：只在 app-iphone / app-android / app-webkit 项目跑 | 环境 |
| 288-442 | 账号根 + 头像上传流程；`:347-348` 断言返回按钮可见；`:440-441` 点头部返回 → 断言 `/account/me` | **子页 → 账号根**（树模型下应保持） |
| 445-538 | 头像持久化与移除；`:517-518` 返回 → `/account/me` | 同上 |
| 545-597 | `describe("我的资料 submenu")`：320px 下依次点 5 个 section，断言面板切换与无横向溢出，**每个 section 都 `page.goBack()` 并断言回到 `/account/me`**（`:586-587`） | **锁死「子页是 /account/me 之上的 PUSH」**：这是树形模型下必须保留（或显式改写断言）的核心契约 |

### 6.6 其他会受影响但未在任务清单内的测试

- `tests/e2e/app-events.spec.ts:420-633`：`/` → `/events` → `/events/1`；`:574-577` 断言详情页有顶栏「返回」且**没有**「返回社区动态」链接（App 屏蔽页面内返回）；`:630-632` 返回 → `/events`。
- `tests/e2e/app-map.spec.ts:418-439`：地图 Tab 重选 `history.length` 不变。
- `tests/e2e/app-map.spec.ts:457-462`：直达 `/community/exchange/me` 时「我的」为当前 Tab、地图不是。
- `tests/e2e/app-interactive-pages.spec.ts:54,85`：直达 `/works/765`、`/tier-list` 的布局契约（会因顶栏/返回按钮渲染变化而受影响）。
- `tests/unit/routes-app-target.test.ts:69,73,80-81`：App 清单 31 条 / 28 prerender / classic 排除；**新增或删除 App 路由必须同步这里**。

---

## 7. 与树形替换冲突的清单（供 design.md 使用）

1. `app-navigation-provider.tsx:243-246`：历史回放是默认路径，需替换为「查表取逻辑父级」。
2. `app-navigation-provider.tsx:248-257`：Tab 根回退需替换为逻辑父级；同时决定「根页面」返回时是退出 App（Android）/留在原地还是回 Tab 根。
3. `app-navigation-provider.tsx:229-241`：`navigate(-1)` vs `replace` 的分支需要重写——树模型下父级常常不在历史里。
4. `app-navigation-provider.tsx:278`：Android 返回监听器目前**只在层级页注册**，树模型需要全局注册并显式定义根页的退出行为。
5. `app-navigation-provider.tsx:306-314`：POP 修正 effect 依赖 `appBackHierarchyTarget`，必须与新树共用同一数据源，否则 iOS 边缘滑动会与按钮分叉。
6. `app-tab-model.ts:101-107`：待替换函数；单元测试 53-70 行是配套契约。
7. query-only 历史项：`wiki/modern/index.tsx:131-133`（`setSearchParams` 默认 push）、`profile-workspace-navigation.tsx:132-133`。需要定义「同 pathname 不同 query」是否为同一逻辑节点。
8. replace 型重定向：`information-content-page.tsx:36-37`、`account-me-section-page.tsx:11`。逻辑父级要基于「重定向后」的 location 判定。
9. 页面内固定 href 父子导航链接（§3.1-3.5，App 可见约 35 处）与顶栏返回可能给出不同父级；需要决定是统一收编还是显式声明例外（例如 `/story` 的固定「企划目录」与树父级不一致）。
10. `pages/wiki/modern/story-page.tsx` / `components/story-navigation-panel.tsx` 把 `/`（首页）当作返回目标，跨栏目；树模型需承认「首页」可作为父级，或改写这些链接。
11. `/community/exchange` 无顶栏（`app-top-bar.tsx:23` + `app-shell-scroll.ts:12-14`），其返回路径完全由地图浮层承担，树模型要不要覆盖它需要显式说明。
12. `/packages/:siteSlug`、`/information/:contentId` 无入站链接，属于纯深链接页面；它们的逻辑父级只能靠约定（`/works` 与 `/`）。
13. `isPersonalAppRoute` 身份失效逻辑（`app-tab-model.ts:64-67`、`app-navigation-state.ts:151-165`、`app-navigation-provider.tsx:110-115`）与返回树正交但有耦合（会删除账号 Tab 快照、跳过 `rememberAppNavigationLocation`），改造时不要误伤。
14. 滚动恢复与 Tab 快照（`app-navigation-state.ts:1-97`、`app-navigation-provider.tsx:316-420`）共用 `stateRef.current`，是当前测试的大头（§6.3 中约 15 个用例）。树形改造的最小侵入做法是**只替换目标解析，不动快照机制**。
