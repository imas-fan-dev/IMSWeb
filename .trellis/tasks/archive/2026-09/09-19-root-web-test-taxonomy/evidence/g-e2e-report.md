# e2e 顶层 describe 归类证据（批次 G）

## 命令与真值格式

真值来自 Playwright 自身的列举输出，两个配置各采一次（改动前后各一次）：

```
cd apps/web
pnpm exec playwright test --list
pnpm exec playwright test --config playwright.app.config.ts --list
```

`--list` 的每行格式是：

```
[project] › <spec 相对文件名>:<line>:<col> › <标题路径>
```

事实：

- 标题路径是第二段 ` › ` 之后的**全部剩余文本**；嵌套 describe 用同一种 ` › ` 分隔（例如 `claim dialog mobile constraints @mobile › keeps the dialog ...`）。因此层级无法从缩进区分，只能按 ` › ` 分段。
- 同一 spec 会按 project 重复出现，条数按 project 展开（ordinary Web 配置 `Total: 133 tests in 33 files`，App 配置 `Total: 67 tests in 9 files`）。
- 两个配置文件合计覆盖 `apps/web/tests/e2e` 下全部 42 个 `*.spec.ts`：普通 Web 配置 33 个（`testIgnore: app-*.spec.ts`），App 配置 9 个（`testMatch: app-*.spec.ts`）。

## 名字无损判据

对每个 spec，把改动前的每条标题路径与改动后的标题路径做一一匹配，要求旧路径是**新路径的字面尾段**（相等，或仅在前面多出 describe 名）。两个配置合计：旧 200 行、新 200 行（133 + 67），失败 0。

- 普通 Web 配置：old=133 new=133 exact=0 prefixed=133 failures=0
- App 配置：old=67 new=67 exact=8 prefixed=59 failures=0（exact 8 全部来自未改动的 `app-oauth-sign-in.spec.ts`）

`逐字=<x>/<n>` 中 x 是字面相等的行数，加前缀=y 是旧路径作为新路径尾段的行数，n 是该 spec 在两个配置里的输出行数（按 project 展开）。`cases` 是按 project 去重后的用例数。

## 未改动的文件

本批共改动 41 个 spec（38 个原本完全平铺 + 3 个部分平铺），未改动 1 个。

- `app-oauth-sign-in.spec.ts`：改动前就已有顶层 `test.describe("app OAuth sign-in entry")` 包住该文件全部用例，故未改动（8 行全部逐字相等）。

## 与调度说明的偏离（重要）

调度说明把「已有顶层 describe」的文件列为 4 个并要求不动。核对后发现只有 `app-oauth-sign-in.spec.ts` 真的覆盖全文件；另外 3 个只是**部分**用例在 describe 内：

- `app-account.spec.ts`：3 个用例里 2 个平铺（`test.beforeEach` 依旧在最外层）。
- `namecard-claim-workflow.spec.ts`：6 个用例里 4 个平铺。
- `platform-oauth-sign-in.spec.ts`：7 个用例里，4 个 `?oauth=` 循环用例与 2 个顶层用例平铺。

为让 R2「e2e spec 补顶层 describe」在这 3 个文件上也成立，我给这三个文件各补了**一个**外层顶层 describe（主体名同上表）。原有的 `我的资料 submenu` / `claim dialog mobile constraints @mobile` / `phone viewport` describe 位置不动，只是多了一层外层主体，describe 层级仍为 2。它们旧的标题路径（含已有的嵌套 describe 段）依旧是新路径的字面尾段。

## 二级 describe 结论

调度说明的二级条件是「连续 ≥2 条用例共享同一 ≥3 词字面前缀」。扫出来的候选只有：

- `community-exchange-map-attribution.spec.ts`：3 条以 `opens the attribution dialog from the` 开头。
- `namecard-mobile-browsing.spec.ts`：3 条以 `keeps complete faces and preview controls` 开头（由 `for` 循环生成）。
- `app-navigation.spec.ts`：2 条 `bounds restoration after ...`、2 条 `returns to the account root ...`。

（`namecard-claim-workflow.spec.ts` 的 `claim dialog mobile constraints @mobile` 与 `app-oauth-sign-in.spec.ts` 的 `app OAuth sign-in entry` 也命中该扫描，但它们是改动前就存在的 describe，不是本批要新建的二级。）

这些共享片段都是**句子开头**而非分类词。要把它做成二级 describe，只有两条路：

1. 吸收前缀：旧标题 `opens the attribution dialog from the bottom navigation below 768px` 会变成新路径 `... › opens the attribution dialog from the › bottom navigation below 768px`，旧路径不再是新路径的字面尾段（`›` 取代了空格），会使硬性的无损判据失败。
2. 不吸收：会得到 `attribution dialog entry › opens the attribution dialog from ...` 这种前缀重复的标题。

父任务里同类文件（`tests/ci-affected-workspaces.test.js` 等）的做法是**只加一个顶层 describe、不做二级、不吸收前缀**，本批与之一致，因此这里 `二级=无`，并记录候选如上。

## 逐文件结果

```
activity-cover-preview.spec.ts cases=2 describe="activity cover preview" 二级=无 逐字=0/2 加前缀=2 失败=0
admin-about-avatar.spec.ts cases=1 describe="admin about avatar" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-accounts.spec.ts cases=1 describe="admin accounts" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-community-exchange-location.spec.ts cases=1 describe="admin community exchange location" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-events.spec.ts cases=1 describe="admin events" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-homepage-links.spec.ts cases=1 describe="admin homepage links" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-information-order.spec.ts cases=1 describe="admin information order" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-login.spec.ts cases=1 describe="admin login" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-platform-email.spec.ts cases=1 describe="admin platform email" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-producer-map-map.spec.ts cases=1 describe="admin producer map" 二级=无 逐字=0/1 加前缀=1 失败=0
admin-upload.spec.ts cases=1 describe="admin upload" 二级=无 逐字=0/1 加前缀=1 失败=0
community-exchange-map-attribution.spec.ts cases=5 describe="community exchange map attribution" 二级=无 逐字=0/5 加前缀=5 失败=0
community-exchange-map.spec.ts cases=2 describe="community exchange map" 二级=无 逐字=0/4 加前缀=4 失败=0
community-exchange-me.spec.ts cases=1 describe="community exchange me" 二级=无 逐字=0/2 加前缀=2 失败=0
community-exchange.spec.ts cases=3 describe="community exchange" 二级=无 逐字=0/3 加前缀=3 失败=0
community.accessibility.spec.ts cases=1 describe="community accessibility" 二级=无 逐字=0/1 加前缀=1 失败=0
events-mobile.spec.ts cases=1 describe="events mobile" 二级=无 逐字=0/2 加前缀=2 失败=0
events.accessibility.spec.ts cases=1 describe="events accessibility" 二级=无 逐字=0/1 加前缀=1 失败=0
home-browser-brand.spec.ts cases=1 describe="home browser brand" 二级=无 逐字=0/1 加前缀=1 失败=0
home-layout-geometry.spec.ts cases=7 describe="home layout geometry" 二级=无 逐字=0/10 加前缀=10 失败=0
home.accessibility.spec.ts cases=1 describe="home accessibility" 二级=无 逐字=0/2 加前缀=2 失败=0
home.smoke.spec.ts cases=26 describe="home smoke" 二级=无 逐字=0/30 加前缀=30 失败=0
namecard-claim-workflow.spec.ts cases=6 describe="namecard claim workflow" 二级=无 逐字=0/8 加前缀=8 失败=0
namecard-mobile-browsing.spec.ts cases=9 describe="namecard mobile browsing" 二级=无 逐字=0/9 加前缀=9 失败=0
namecard-pagination.spec.ts cases=1 describe="namecard pagination" 二级=无 逐字=0/1 加前缀=1 失败=0
namecard-preview.spec.ts cases=1 describe="namecard preview" 二级=无 逐字=0/1 加前缀=1 失败=0
namecard-upload.spec.ts cases=3 describe="namecard upload" 二级=无 逐字=0/3 加前缀=3 失败=0
platform-auth.spec.ts cases=2 describe="platform auth" 二级=无 逐字=0/4 加前缀=4 失败=0
platform-oauth-sign-in.spec.ts cases=7 describe="platform oauth sign-in" 二级=无 逐字=0/8 加前缀=8 失败=0
platform-session-header.spec.ts cases=4 describe="platform session header" 二级=无 逐字=0/4 加前缀=4 失败=0
story-cover-assets.spec.ts cases=2 describe="story cover assets" 二级=无 逐字=0/2 加前缀=2 失败=0
wiki-mobile.spec.ts cases=11 describe="wiki mobile" 二级=无 逐字=0/18 加前缀=18 失败=0
wiki.accessibility.spec.ts cases=1 describe="wiki accessibility" 二级=无 逐字=0/2 加前缀=2 失败=0
app-account.spec.ts cases=3 describe="app account" 二级=无 逐字=0/12 加前缀=12 失败=0
app-events.spec.ts cases=1 describe="app events" 二级=无 逐字=0/2 加前缀=2 失败=0
app-interactive-pages.spec.ts cases=2 describe="app interactive pages" 二级=无 逐字=0/4 加前缀=4 失败=0
app-map.spec.ts cases=4 describe="app map" 二级=无 逐字=0/11 加前缀=11 失败=0
app-namecard-browsing.spec.ts cases=2 describe="app namecard browsing" 二级=无 逐字=0/2 加前缀=2 失败=0
app-navigation.spec.ts cases=14 describe="app navigation" 二级=无 逐字=0/21 加前缀=21 失败=0
app-oauth-sign-in.spec.ts cases=2 describe="(none)" 二级=无 逐字=8/8 加前缀=0 失败=0
app-shell.spec.ts cases=2 describe="app shell" 二级=无 逐字=0/4 加前缀=4 失败=0
app-wiki.spec.ts cases=1 describe="app wiki" 二级=无 逐字=0/3 加前缀=3 失败=0
```

## 实跑证据

```
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0 tests/e2e/admin-accounts.spec.ts
# exit=0  → 1 passed (chromium-desktop)  admin accounts › super administrator manages accounts without viewport overflow

CI=1 pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts --workers=1 --retries=0 tests/e2e/app-shell.spec.ts
# exit=0  → 4 passed  app shell › keeps the five App roots usable inside the safe area (app-small/app-landscape/app-webkit)
#                     app shell › renders App community links as a two-column text list (app-small)
```

原始输出：`g-e2e-run-admin-accounts.txt`、`g-e2e-run-app-shell.txt`。

## 其他说明

- `namecard-claim-workflow.spec.ts` 有 3 处改动前就存在的 Prettier 未格式化长行，运行 `prettier --write` 后一并按仓库格式换行；断言表达式未改。改动前该文件本来就不是 Prettier-clean（`app-oauth-sign-in.spec.ts` 也是，但它未被触碰，保持原样）。
- 全部 42 个 spec 现在都恰好有 1 个顶层 describe，describe 最大层级为 2（只有本来就有嵌套 describe 的 3 个文件），`test(...)` 注册顺序未变。
