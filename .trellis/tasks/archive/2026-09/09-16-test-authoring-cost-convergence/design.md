# Design: 测试编写开销收敛与装配层统一

## 范围边界

只落 `apps/web/tests/`、`apps/api/tests/`、根 `tests/`、`apps/web/vitest.config.ts`。

明确不动，以及原因：

- **生产代码**（`apps/api/src/`、`apps/web/app/`、`packages/contracts/src/`）。本任务收敛的是测试装配，不是产品行为。需要产品侧改动时另开任务。
- **`apps/web/vitest.config.ts` 的 `timeout`、`maxWorkers`、`include`**。`include` 保持 `tests/unit/**/*.{test,spec}.{ts,tsx}`——这正是新增的 `support/` 目录不会被当作测试收集的原因。只追加 `unstubGlobals`。
- **Playwright 配置与 CI workflow**。`timeout: 20_000`、`retries: 0`、`workers: 1` 是 09-15 与 09-16 已确立的约束，本任务不碰。
- **`scripts/testing/run-test-owner.mjs` 的 owner 模型**。新增测试文件走既有 owner，不改编排。
- **`tests/postgres-test-lifecycle.js` 与 `tests/server/postgres-test-database.ts`**。DB 生命周期已由 09-08 收敛，本任务在其之上加数据行构造器，不重做分配器。
- **`tests/e2e/fixtures/test.ts` 的自动 fixture 与 `e2e-source-policy.test.ts`**。E2E 约束机制是本次要复制的样板，不是改造对象。R5 新增的守卫与 `e2e-source-policy.test.ts` 同型但独立存在。

## 模块设计

### R1 全局 teardown

`apps/web/vitest.config.ts` 的 `test` 段追加：

```ts
clearMocks: true,
restoreMocks: true,
unstubGlobals: true,
```

选配置项而不是自定义 setup helper：`vi.unstubAllGlobals()` 是 vitest 的一等 teardown 语义，配置项是它官方提供的等价开关（vitest 4.1.11 的 `config.d.ts:59` 有 `unstubGlobals: boolean`）。写一个自己的 `setupTeardown()` 会把标准行为包成项目方言。

删除判据：只删整块内容仅剩 `vi.unstubAllGlobals()` 的 `afterEach`。混有 `vi.restoreAllMocks()`、`delete document.documentElement.dataset.*` 等语句的块保留，仅移除其中这一行。

### R2 Web 单测共享装配层

新增 `apps/web/tests/unit/support/`，两个文件：

**`api-client.ts`** —— 契约：

```ts
export type RequestDetails = {
  body: BodyInit | null | undefined
  headers: Headers
  method: string
  url: string
}

export function requestDetails(call: unknown[]): RequestDetails
export function successResponse(payload?: unknown): Response
export function installFetchMock(
  implementation?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): ReturnType<typeof vi.fn<typeof fetch>>
```

约束：

- `installFetchMock` 内部只做 `vi.stubGlobal("fetch", mock)` 并返回 mock。**不接管断言**：现有测试用 `fetchMock.mock.calls.map(requestDetails)` 检查请求，这个用法必须原样可用。
- `requestDetails` 现有 10 份实现里 5 份逐字节相同，先以这 5 份为准；另外 4 份差异点逐个 diff 后决定合并或保留本地变体。
- `successResponse` 复用 `Response.json`，与 `wiki.test.ts` 现有实现一致。

**`harness.tsx`** —— 契约：

```tsx
export function I18nTestProvider({ children }: { children: ReactNode }): ReactElement
export function renderPage(
  ui: ReactElement,
  options?: { route?: string }
): ReturnType<typeof render>
```

约束：

- `renderPage` **只包 `MemoryRouter`**，默认 `initialEntries: ["/"]`，不包 `I18nextProvider`。实测依据：185 个单测文件里只有 `account-auth-page.test.tsx` 一个自己包 i18n，其余全部依赖 `tests/setup.ts` 里全局初始化的 i18n；无条件加一层 `I18nextProvider` 会改变绝大多数文件的渲染环境。需要 i18n 的文件把 `I18nTestProvider` 作为 `render` 的 `wrapper` 选项传入。
- **不提供 `setupUser()`**。实测全部 227 处 `userEvent.setup()` 调用都不带参数，包一层不配置任何东西，只会多一个 import 跳转。这条与下文「与用例无关的间接层一律不要」的取舍一致。
- **命名用 `renderPage`，不用 `renderRoute`**。`tests/unit/pages/community/exchange/community-exchange-session.test.tsx:38` 已有一个语义不同的本地 `renderRoute(entry: string)`，同名会造成阅读歧义。
- `renderPage` 不替换 `@testing-library/react` 的 `render`，只做增量包装，让迁移保持机械可审。
- `vi.mock(...)` 调用必须留在测试文件顶部（`vi.mock` 是 hoisted，作用域绑定在文件），harness 不试图吸收它们。这是 R2 不解决的问题，也是它不能把装配压到一行以下的原因。
- `I18nTestProvider` 取代 4 份重复的本地 `TestI18nProvider`（`admin-image-upload-field`、`theme-toggle`、`image-composition-editor`、`wiki-entity-editor-sheet`）。

#### R2 实施记录（含与初版设计的偏离）

实际落地范围与初版设计有三处偏离，都是实测后的修正。

**1. `renderPage` 的适用面收窄到 2 个文件，不是「行数最大的 10 个页面测试文件」。** 实测 10 个候选文件的内联 `<MemoryRouter>` 分布：

| 文件 | 内联块 | 本地 render helper |
| --- | ---: | --- |
| `classic-wiki-pages.test.tsx` | 12 | 0 |
| `community-exchange-page.test.tsx` | 6 | 0 |
| `community-cards-page.test.tsx` | 7 | 1 |
| `community-exchange-me-page.test.tsx` | 2 | 2 |
| `wiki-index-page` / `story-page` / `producer-map-manager` / `account-auth-page` | 0 | 各 1 |

后 4 个文件的 `<MemoryRouter>` 本来就在本地 `render<Page>()` helper 里，而那种 helper 比共享 `renderPage` 更合适：它同时持有页面组件、默认路由和探针（`LocationProbe` / `ListLocation`），换成共享版后每个调用点都要重写这三样信息，反而变长。`community-cards-page.test.tsx` 与 `community-exchange-me-page.test.tsx` 的本地 helper 与共享版同名，共存需要别名，也不值得。**因此只迁移真正内联的 18 处**（`classic-wiki-pages` 12 处、`community-exchange-page` 6 处），其余保持不动。

**2. `installFetchMock` 的适用面扩大到全部手写 fetch stub，而不是「10 个文件」。** 初版设计以 10 个 `requestDetails` 文件为界，该边界与重复模式的实际分布无关：手写 fetch stub 遍布 59 个单测文件。而且有两种形态，只统计单行字面量会漏掉三倍：

```ts
// 形态 A —— 单行，56 处
vi.stubGlobal("fetch", fetchMock)

// 形态 B —— 多行，内联 mock，无变量绑定，111 处
vi.stubGlobal(
  "fetch",
  vi.fn<typeof fetch>().mockResolvedValue(…)
)
```

（`globalThis.fetch =` 与裸 `fetch =` 赋值在全仓为 0 处，所以这两种形态是穷尽的。）共 167 处已全部收敛，现在 `apps/web/tests/unit/` 里唯一的 `vi.stubGlobal("fetch"` 是 `support/api-client.ts` 自己的实现行。形态 B 去掉一层嵌套会让 prettier 重排实现体的整体缩进，这是本次改动的直接结果，不是无关格式化。

`pages/admin/platform-oauth/admin-platform-oauth-page.test.tsx` 的 3 处走本地 `providerFetch(requests, mutation)` helper。处理方式是把该 helper 从「返回 `vi.fn(...)` 包装」改为「直接返回实现函数」，调用点变成 `installFetchMock(providerFetch(…))`，而不是放弃迁移。

**3. `requestDetails` 的 10 份变体全部合并，未保留本地变体。** 其中 `lib/api/endpoints/editorial.test.ts` 差异最大：它把 `body` 返回为 `Promise<string>`、`url` 返回为 `URL` 对象，并额外断言 `headers`。实测确认 canonical 版本覆盖它的全部用法，因此合并而非保留；该文件里两处随之失效的 `await`（`await requests[0]?.body`）已删除，因为 `body` 现在是普通字符串。

**4. 收尾续批：系统性排查出的其余四类跨文件重复也收敛进 `support/`。** 首轮完成后做了一次全量重复扫描（提取每个测试文件的顶层 `function` 定义，归一化函数体后按哈希分组），发现除 `requestDetails` 外还有四类逐字符重复，性质相同——都是把「这个项目怎么装配」写在每个文件里：

| 重复项 | 迁移前 | 共享后位置 |
| --- | --- | --- |
| 本地 `jsonResponse`（4 种签名） | 17 文件 | `api-client.ts` 的 `jsonResponse(payload, status = 200)` |
| 本地 `requestFrom` | 10 文件 | `api-client.ts` 的 `requestFrom` |
| 本地 `touchEvent` | 3 文件 | `dom-events.ts` |
| `document.cookie = "…"` 手写 | 92 处 / 35 文件 | `auth-cookies.ts` 的 `setCsrfCookie` / `clearCsrfCookie` |

`jsonResponse` 的四种本地签名（无 status、带 `status = 200`、`Response.json(payload, {status})`、带 `init?: ResponseInit`）全部由 canonical 的 `(payload, status = 200)` 覆盖。`requestFrom` 的 10 份里 9 份基址是 `http://ims.test`、1 份是 `http://localhost`；该差异不进任何断言（只用于读 `request.method` 与 body），因此统一到 canonical。

`auth-cookies.ts` 从生产模块 `~/lib/api/request` 导入三个 cookie 名常量并映射为 `"backoffice" | "platform" | "legacy"`，同时把 `path=/` 收进 helper。消掉的不只是重复行数，还有「测试必须知道 cookie 的 wire name 与 `path=/` 要求」这条项目知识——迁移前 92 处各自书写，其中 1 处漏了 `path=/` 仍能通过（jsdom 的默认路径就是 `/`）。清理站点保持各自原来的名字集合：一次清两个名字的两个站点落成两条 `clearCsrfCookie` 调用，没有扩大清理范围。

收尾后 `apps/web/tests/unit/` 内为 0：本地 `jsonResponse`、`requestFrom`、`touchEvent`，以及手写 cookie 字符串（仅剩 `support/auth-cookies.ts` 内的两行实现）。另有 4 处 `"ims_admin_csrf"` 字面量刻意保留：它们在 `api.test.ts` / `platform-api.test.ts` 里作为 `cookieSource` 的**输入夹具**，用于验证策略能解析一段原始 Cookie 头；这些断言旁边已并行使用生产常量，夹具本身保持字面量更贴近被测输入。

刻意**不**收敛的项，附理由：

- **`LocationProbe`（6 个文件、3 种变体）**：变体分别暴露 `pathname` 与 `search`，且各自有被断言的 `data-testid`。合并要么做成带 prop 的组件（多一层间接），要么改断言（禁止）。
- **每个文件自己的 `render<Page>()` helper（16 个文件）**：它同时持有页面组件、默认路由与探针，是比通用 `renderPage` 更好的抽象（共享版需要 21 个调用点重写这三样信息）。
- **`response()`（2 个文件）**：返回 `Promise<Response>`，与 `jsonResponse` 的 `Response` 不同型，合并会让调用点变长。
- **`cookieSource` 字面量（4 处）**：见上。

### R3 契约驱动 fixture 工厂

位置：`apps/web/tests/unit/support/fixtures/<domain>.ts`，按 `@imsweb/contracts` 的域划分。

每个工厂配一个一致性断言，抽成共用助手：

```ts
export function requiredKeysOf(schema: unknown): string[] | null
```

实现走 zod 3 的对象形状：`schema.shape` 中 `isOptional()` 为 false 的键。非 `ZodObject`（union、ref、lazy）返回 `null`，调用方跳过键覆盖检查并记录为已知缺口。

一致性测试的形状：

```ts
expect(schema.parse(makeWikiCategory())).toEqual(makeWikiCategory())
expect(requiredKeysOf(wikiCategorySchema)).toEqual([])  // 或断言键集合包含
```

#### R3 可行性排查（实施前实测）

动手前枚举了 `@imsweb/contracts` 全部 21 个模块的导出 schema，确认 `requiredKeysOf` 这条路能走通：

| 结果 | 数量 | 构成 |
| --- | ---: | --- |
| 可取 required 键 | 232 | 响应对象与请求对象 |
| 返回 `null` | 46 | 叶子原子（`ZodEnum` 15、`ZodString` 8、`ZodNumber` 7、`ZodArray` 3、`ZodRecord` 1）加 HTTP 错误联合（`ZodUnion` 12） |

**没有阻塞项**：全仓没有 `ZodLazy`，也没有「对象被藏在 union 里」的情况——12 个 union 全是 HTTP 错误响应体，不是工厂的目标形状。所以 `null` 精确落在「本来就没有必填键可枚举」那一类，与设计预期一致。

#### 工厂的类型从哪来

类型导入有一处分叉需要钉死。`~/lib/api` 是 Web 侧聚合面但缺 6 个形状，`@imsweb/contracts/<domain>` 裸子路径也缺 4 个：

| 形状 | `~/lib/api` | 契约裸子路径 | 实际可用来源 |
| --- | --- | --- | --- |
| `WikiCategory`、`WikiPublicGroup`、`WikiImageTransform`、`WikiRandomBackground` | ✗ | ✓ | `@imsweb/contracts/wiki` |
| `FudabaRegisteredCardReview`、`FudabaAdminCardClaim` | ✓ | ✗ | `@imsweb/contracts/fudaba/card-claims` |
| `WikiPublicStoryLink`、`WikiStoryCard`、`WikiAdminStoriesIdol`、`NamecardIdol` | ✗ | ✗ | **不存在**（schema 有，类型未单独导出） |

前两类按可用来源导入。第三类**不**做 `z.infer` 包装，改用已被导出的外层类型的索引访问（例如 `WikiPublicStories["items"][number]`），避免为了拿一个类型名引入 `z`。

工厂类型一律从 `@imsweb/contracts/<domain>` 取，不从 `~/lib/api` 取：工厂是契约一致性产物，应与它的一致性测试读同一份模块，少一层转发。

#### 一致性测试的实际形状

```ts
const summary = makeChronicleActivitySummary()
assertFactoryCoversSchema(chronicleActivitySummarySchema, summary)      // 先
expect(chronicleActivitySummarySchema.parse(summary)).toEqual(summary)  // 后
```

顺序是实测定的：`schema.parse` 排在前面时，漏键会先抛 zod 的 path 错误，助手那条 `fixture is missing contract keys: title` 永远看不到——而那个消息正是这个助手存在的理由。

`.toEqual` 那一半不多余：响应 schema 是 exact 的（不 strip、不 default、不 transform），所以 `parse` 的输出必须与原值逐字段相等，容器形状（数组顺序、`null`）也因此被覆盖。

#### 反向验证（AC 要求，已执行）

把 `makeChronicleActivitySummary` 的 `title` 删掉，两道独立闸门都断：

```text
① typecheck
tests/unit/support/fixtures/chronicle.ts(9,3): error TS2322: Type '{ date: string; id: string; title?: string | undefined; location: string; cover: string | null; }' is not assignable to type '{ date: string; id: string; title: string; location: string; cover: string | null; }'.

② 运行时
Error: fixture is missing contract keys: title
      Tests  2 failed | 1 passed (3)
```

① 比一致性测试更早：工厂签名是 `Partial<T> => T`，契约新增必填字段时工厂的返回字面量在编译期就不成立。② 由 `support/fixtures/schema-conformance.test.ts` 里一条**永久用例**承担（构造一个漏掉 `title` 的对象并断言抛出），所以这条验证不再依赖一次性手工操作，每次跑单测都在跑。还原后 `git diff` 为空。

#### 迁移集合的修正

**先说一个测量修正。** 首轮用「到下一个顶层声明的距离」估算块长，这会把**每个文件的最后一个声明**虚报成横跨到 EOF。`renderAccountSection` 被报成 654 行（实际 10 行）、`cardFields` 被报成 744 行（实际 10 行）、`producerMapContent` 被报成 446 行（实际 37 行）都是这个 bug。改用花括号配对重测后：

| 文件 | 具名夹具数据 | 测试体内的内联数据 | 结论 |
| --- | --- | --- | --- |
| `lib/api/media-urls.test.ts` | **~458 行 / 23 个已标注契约类型的常量** | — | **迁移，最佳目标** |
| `pages/wiki/classic/classic-wiki-pages.test.tsx` | ~341 行 / 4 个构造器（属性行 113+59+39+18） | — | 迁移 |
| `lib/api/endpoints/fudaba.test.ts` | ~111 行 / 7 个常量 | 183 属性行，在 730 行 describe 内 | 迁移 |
| `lib/api/endpoints/wiki.test.ts` | ~70 行 / 4 个 helper | **461 属性行，在 1029 行 describe 内** | 迁移，但在 it 体内 |
| `pages/community/exchange/community-exchange-me-page.test.tsx` | ~52 行 | 136 属性行加 80 行 `apiMocks` | **不迁移**（杠杆低） |
| `pages/community/community-office-page.test.tsx`（替补） | ~48 行 / 3 个 fudaba 夹具 | 91 属性行 | 迁移 |

`community-exchange-me-page.test.tsx` 是唯一被剔除的：它的具名数据只有约 52 行，主体是 `apiMocks` mock 装配与分散在 643 行 describe 里的一次性 payload，不是可复用的领域夹具。替补为 `community-office-page.test.tsx`。

`media-urls.test.ts` 的价值恰在于它是**跨域**的：按域各放一份代表实例（wiki、fudaba、namecards、platform、chronicle、about、producer-map），23 个常量占该文件一半行数。为它建工厂会强制这一层真的跨域，而不是某一个域的私有助手。

**为什么不写通用 schema 生成器**：zod 3 没有公开的「示例值」API；不允许引入 faker 类新依赖；通用 walker 会产出语法合法但语义错误的数据（例如 enum 里随便挑一个成员），把一个看似通过、实则无意义的 fixture 固化成契约。手写工厂加键覆盖断言拿到的是同等的漂移保护，没有虚假信心。

#### R3 实施记录

工厂层最终 8 个文件、48 个导出工厂、1,660 行，配 58 条 `assertFactoryCoversSchema` 断言（60 个用例）。按域：`wiki.ts` 19、`fudaba.ts` 14、`namecards.ts` / `platform.ts` / `about.ts` / `producer-map.ts` 各 3、`chronicle.ts` 2。

**实施中发现并修掉的导出面缺陷。** 首版把 `makeFudabaOwnerCard`、`makeFudabaOwnerOffice`、`makeFudabaPlacedCard`、`makePlatformSessionProfile` 留成模块私有，理由是「只有列表包装用得到，响应级工厂应是唯一导出面」。迁移立刻推翻了它：`fudaba.test.ts` 与 `community-office-page.test.tsx` 里出现 3 处 `makeFudabaOwnerCardList().items[0]` —— 调列表工厂只为取第一项，既费解又浪费。这 4 个 helper 已改为导出并各配一致性测试（用例从 56 增至 60）。教训：**有 schema 就有独立的 item 类型，item 级工厂是合法的公开单元**，“最小导出面”的判断不能只看当时的调用方。

**`FudabaOfficeDetail` 的类型与 schema 不在同一层。** 契约里 `fudabaOfficeDetailSchema` 是 `exactJsonResponse({ office: ... })`，而 `FudabaOfficeDetail` 定义为 `FudabaOfficeDetailResponse["office"]`——是内层。所以 `makeFudabaOfficeDetail` 的一致性测试对 `fudabaOfficeDetailSchema.shape.office` 断言，测试文件里用注释写明了这层差异。

**迁移结果。** 4 个声明目标加 1 个替补（原第 5 名剔除，理由见上节）：

| 文件 | 行数（HEAD → 现在） | 净减 |
| --- | ---: | ---: |
| `lib/api/media-urls.test.ts` | 946 → 551 | −395 |
| `lib/api/endpoints/wiki.test.ts` | 1,182 → 989 | −193 |
| `pages/wiki/classic/classic-wiki-pages.test.tsx` | 1,109 → 994 | −115 |
| `lib/api/endpoints/fudaba.test.ts` | 909 → 836 | −73 |
| `pages/community/community-office-page.test.tsx` | 429 → 369 | −60 |

（表内是 HEAD 到工作区的总差，含 R2 阶段对同一批文件的改动。）

`media-urls.test.ts` 的迁移最干净：从第一个 `describe` 到 EOF 的 404 行**逐字节未变**，被替换掉的只是它上方的 23 个具名常量。`wiki.test.ts` 的 12 个 `it` 块里 8 个完成迁移，其余 4 个保留——它们是请求体或没有工厂的小变更信封。

**没有一个文件改动了断言。** 64 个改动的测试文件用规范化 token 序列与 `HEAD` 逐行比对，除 `editorial.test.ts` 那处 R2 已知的换行假象外完全一致；`wiki.test.ts` 的 136 行断言文本与 12 个标题逐字节相同。

**“交给默认值”的字段已复核。** 两处高风险项都查过：`makeWikiAdminStories` 的 `agency.code`（源 `"765pro"` → 默认 `"765"`）与 `makeWikiPublicCatalog` 的 `selection.layoutRevision`（源 `0` → 默认 `3`）。前者只有 `searchParams.get("agency")` 读它，而那个断言取的是 `name`（两边同为 `"765PRO"`）；后者在该文件里不参与任何断言，且这是端点测试不做渲染。两者都确认惰性。

**未覆盖的形状（已知缺口，不是疏漏）。** 工厂层只覆盖领域实体，没有 mutation 结果信封的工厂，例如 `{ status, url }`、`{ status, softDeleted }`、`{ status, sourceCount, mediaRevision }`、`{ status, agency, assets }`，这些在 `wiki.test.ts` 里保持内联。另外 `wikiAgencyMutationResultSchema` / `wikiGroupMutationResultSchema` 是 `.strict()` 响应，而 `makeWikiAdminAgency` / `makeWikiAdminGroup` 的输出带 `idols` / `groups`，严格解析会拒绝；字段投影比原字面量更长，rest 解构剔除又触发本仓的 `no-unused-vars`（`ignoreRestSiblings` 默认 false），所以那两个 helper 也保持内联。

### R4 API 测试应用工厂与数据行构造器

#### R4 实施前实测（修正初版范围）

初版设计的数字与迁移范围都需要按 `tests/server/` 的实测修正。

| 轴 | 实测 | 结论 |
| --- | --- | --- |
| `createHonoApp(...)` | 51 处 / 30 文件，**全部**已是 `createHonoApp(() => …)` 一种外层形态 | 包装本身只省掉 `() =>` |
| `app.request(...)` | **450 处 / 38 文件**，其中显式写 `http://ims.test` 的 245 处 / 33 文件 | 真正的主重复轴 |
| `INSERT INTO` | 63 处 / 22 文件 | 只有 38 处在测试体里直接内联 |

初版设计说 `createHonoApp` 有「四种调用形态」，实测是四种 **services 实参**写法（`() => ({})`、`() => ({ storage })`、`() => services` / `() => runtime`、`() => this.runtime() as never`），另有一种带第二个 options 实参的调用；外层数组一律是 `createHonoApp(() => …)`。

**`app.request` 的请求 host 是历史噪音。** 同一个 app 的调用点现在同时存在两种 host：65 处传相对路径，Hono 的 `request()` 对它兜底为 `http://localhost`（实测 `app.request('/api/x')` 得到 `http://localhost/api/x`）；87 处显式写 `http://ims.test`；另有 `main.test` 7 处、`api.test` 3 处。而 `src/app.ts` 只在 `new URL(c.req.raw.url).pathname` 处读请求 URL——**只取 pathname，不读 host**；CORS 判定是 `app.use(cors({ origin: allowedCorsOrigin }))`，只依赖 `Origin` 头。因此请求 host 对 API 行为不起作用，两种 host 并存是历史偶然。

#### 接口修正

```ts
export const TEST_ORIGIN = "http://ims.test"

export function createTestApp<Bindings extends object = Record<string, unknown>>(
  services: Bindings | (() => Bindings),
  options?: CreateHonoAppOptions
): ImsHonoApp

export function testRequest(
  app: ImsHonoApp,
  path: string,
  init?: RequestInit
): Promise<Response>
```

`createTestApp` 保持 drop-in（仍返回 `ImsHonoApp`），但把 `() => this.runtime() as never` 那类强制转换收进签名。`testRequest` 是真正省行数的那个：`path` 不以 `http` 开头时补 `TEST_ORIGIN`，否则原样透传——host 敏感的 CORS 用例继续传绝对 URL。

非目标：`test-app.ts` **不得变成第二个 composition root**。路由注册、中间件、服务装配仍归 `src/app.ts`，测试助手只提供 services 与 options。

**请求 host 的迁移取有界策略，不重写 450 处调用点。** PRD 的约束是「迁移逐文件可审查」与「新写即用新层，旧文件不动」；450 处重写既不可审也不可回滚。只在本次已经要动的文件里迁移，其余保持原样。

**砍掉通用的公开 `insertRows(t, connection, sql, values)`。** 实测插入走的是 D1 形态的 `database.prepare(sql).bind(...values).run()`，已经是单行链式调用；包一层只是把 SQL 从调用点移走，正是下一段自己列为反模式的事。

**`rows.ts` 的构造器收窄到 4 个。** 实测 25 个表里只有 10 个跨文件复现：

| 表 | 文件数 | 结果 |
| --- | ---: | --- |
| `platform_accounts` | 9 | `insertPlatformAccount` |
| `fudaba_cards` | 6 | **无构造器**（见下） |
| `backoffice_accounts` | 4 | `insertBackofficeAccount` |
| `cards` | 4 | **无构造器**（见下） |
| `users` | 3 | `insertUser` |
| `fudaba_office_public_locations` | 3 | `insertFudabaOfficePublicLocation` |

其余 15 个表各只在一个文件出现，为它们建构造器属于提前抽象。63 处 `INSERT INTO` 的分类也支持收窄：**7 处在 `assert.rejects` / `assert.throws` 内部**（在断言数据库拒绍坏行，必须保持原始字面量），**18 处已在文件本地的 seeder 函数里**，真正内联的 38 处里绝大多数落在这 4 张表上。

```ts
export async function insertPlatformAccount(database, id, overrides?): Promise<void>
export async function insertBackofficeAccount(database, username, overrides?): Promise<number>
export async function insertUser(database, username, overrides?): Promise<number>
export async function insertFudabaOfficePublicLocation(database, officeId, submittedAt, overrides?): Promise<void>
```

配一个模块私有的 `runInsert(database, sql, values)` 作为这 4 个共用的底座（**不导出**）。

**`fudaba_cards` 与 `cards` 量出来跨文件复现，但实测后没有建构造器——因为「表名复现」不等于「插行形状复现」。** 这两张表的每一处插行写的都是不同的**行种类**：

- `namecard-ownership-migration`：21 列，带 `owner_account_id`，无 `card_number` / `origin`
- `core-runtime-contract`：12 列子集，带 `card_number`
- `fudaba-claim-review-repository`：带 `card_number` + `origin`、无 `owner_account_id`、大部分列为 `NULL`，且与一条配对的 `cards` 行和一次 `cards_id_seq` 的 `setval` 推进绑在一起
- `cards` 的四处里三处是**无绑定参数的字面量行**，那些取值就是迁移测试的输入本身

给任何一处建构造器都得接受几乎所有列，并把「正在被断言的那个形状」搬出断言它的测试。这与 design.md 已列的反模式（「SQL 是证据」）是同一件事，所以 `rows.ts` 的文件头注释里写明了这条判据，避免以后有人按表名把它加回来。

**为什么不写反射式通用 seeder**：这些测试里手写的列名与取值就是「这条用例依赖哪些字段」的可读证据。按表封装成显式列清单，既省掉重复的 SQL 骨架，又不隐藏依赖关系。

#### 迁移目标（按模式选，不按行数）

初版设计的「行数最大的 5 个文件」不成立：`handler-validation-compatibility.test.ts`（1,317 行）两个模式都没有，`fudaba-location-routes.test.ts`（1,169 行）也没有 `INSERT INTO`。改按承载模式选 10 个候选，实测后有 8 个真的可迁移：

| 文件 | 行数 | `createHonoApp` | `INSERT INTO` | 涉及的表 | 结果 |
| --- | ---: | ---: | ---: | --- | --- |
| `platform-email-auth.contract.test.ts` | 1,957 | 3 | 3 | `platform_accounts` | 已迁移 |
| `platform-session-security.contract.test.ts` | 1,092 | 3 | 2 | `platform_accounts` | 已迁移 |
| `fudaba-location-repository.test.ts` | 603 | — | 4 | `fudaba_office_public_locations` | 已迁移 |
| `fudaba-domain-repository.test.ts` | 521 | — | 8 | `platform_accounts`、`backoffice_accounts` 加 3 处负例 | 已迁移 |
| `fudaba-public-routes.test.ts` | 514 | **9** | — | — | 已迁移 |
| `backoffice-auth-boundary.contract.test.ts` | 522 | 1 | 2 | `backoffice_accounts` | 已迁移 |
| `admin-accounts.contract.test.ts` | 357 | 1 | 5 | `backoffice_accounts`、`users`、`fudaba_office_public_locations` | 已迁移 |
| `auth-refresh.contract.test.ts` | 249 | 1 | 2 | `users` | 已迁移 |
| `platform-email-delivery-repository.test.ts` | 1,318 | — | 2 | `platform_email_request_cooldowns`、`platform_password_reset_codes` | **无可迁移面** |
| `story-repository.test.ts` | 1,136 | — | 2 | `agencies`、`idols` | **无可迁移面** |

末尾两个是初版表格的判断错误：它们确实各有 2 处 `INSERT INTO`，但插的都是只在这一个文件出现的表，而且文件里**没有** `createHonoApp`、也没有 `app.request`（实测均为 0）。先前是把全局表频次错误地套到了这两个文件头上——「有 2 处插行」与「插的是那 6 张表」是两件事。这两个文件保持不变。

#### R4 实施记录

新建 `apps/api/tests/server/test-app.ts`（`TEST_ORIGIN`、`createTestApp`、`testRequest`）与 `apps/api/tests/fixtures/rows.ts`（4 个域构造器加私有的 `runInsert` / `requireInsertedId`）。`CreateHonoAppOptions` 与 `ImsHonoApp` 取自 `@/app`，`RuntimeServices` 取自 `@/ports/runtime-services`；services 实参类型用 `RuntimeServices | (() => RuntimeServices)`，因此 `() => this.runtime() as never` 的强制转换在调用点消失。`testRequest` 是 `async`，因为 Hono 的 `request()` 类型是 `Response | Promise<Response>`。

迁移 8 个文件（候选 10 个，实测末尾 2 个无迁移面）：

| 文件 | `testRequest` | `createTestApp` | rows 调用 | 行数 | 用例 | 断言行 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `backoffice-auth-boundary.contract.test.ts` | 20 | 1 | 2 | 521 → 536 | 6 | 66 |
| `fudaba-public-routes.test.ts` | 20 | 9 | 0 | 513 → 525 | 8 | 41 |
| `admin-accounts.contract.test.ts` | 12 | 1 | 3 | 356 → 367 | 6 | 34 |
| `platform-session-security.contract.test.ts` | 12 | 3 | 0 | 1,091 → 1,101 | 11 | 116 |
| `auth-refresh.contract.test.ts` | 8 | 1 | 2 | 248 → 257 | 4 | 26 |
| `platform-email-auth.contract.test.ts` | 3 | 3 | 0 | 1,956 → 1,961 | 20 | 212 |
| `fudaba-domain-repository.test.ts` | 0 | 0 | 2 | 520 → 515 | 5 | 38 |
| `fudaba-location-repository.test.ts` | 0 | 0 | 4 | 602 → 577 | 1 | 37 |

**行数几乎没降，这是本阶段的诚实结果。** 8 个文件合计只减了约 20 行。原因是这两类替换都是**等长重写**而非删除：`createHonoApp(() => services)` → `createTestApp(services)` 省 6 个字符，`app.request('http://ims.test/api/x', init)` → `testRequest(app, '/api/x', init)` 省约 17 个字符，而 `INSERT INTO` 换构造器省下的是 SQL 骨架的 3–8 行、代价是新增实参列表。R4 与 R2/R3 不同：R2/R3 删掉的是**被复制了 17–167 次**的同一段代码，R4 可删的重复量本来就小（`INSERT INTO` 在 `tests/server` 只有 63 处，7 处是负例、18 处已在本地 helper 里）。真正降下来的是**读者负担**——调用点不再需要决定 fake host 写哪一个、不再需要知道 `platform_accounts` 哪几列之间有约束关系。因此 R4 不应该用行数衡量，该用「新增一个带数据库装配的 API 测试还要手写哪几样东西」。

**断言零改动**：8 个文件的断言行序列与用例标题与 `HEAD` 逐行逐字节一致（脚本比对）。

**迁移中修掉的一个约束冲突。** `insertUser` / `insertBackofficeAccount` 首版用 `overrides.admin_role ?? 'admin'`，而 `null ?? 'admin'` 得到 `'admin'`，对 `dept='user'` 的账号违反 `backoffice_accounts_admin_role_matches_department_check`。改为 `overrides.admin_role === undefined ? 'admin' : overrides.admin_role`——`null` 是合法取值（非 op 账号），只有**属性缺失**才回落到 op 默认值。

**`insertUser` 的返回类型从计划的 `void` 改成 `Promise<number>`。** `admin-accounts.contract.test.ts` 的本地 `insertAccount` 需要拿回主键，而 `users` 是 `backoffice_accounts` 上的可更新视图，`INSERT … RETURNING id` 可用；若保持 `void`，那个文件的本地 SQL 就得留着。

**一个 LSP 假阳性，已用注入验证排除风险。** 编辑 `tests/fixtures/rows.ts` 时编辑器持续报 `Cannot find module '@/infra/db/sql/database'`。判断依据不是「看起来像误报」，而是三条实测：

1. 没有任何 tsconfig 的 `include` 覆盖 `tests/fixtures/`，`apps/api` 的 `typecheck` 用 `tsconfig.server.json`（只 include `src/**`，**根本不检查测试**）；测试的类型检查只在 `test:server` 里的 `tsc -p tests/server/tsconfig.json --noEmit`。
2. 同目录既有的 `account-security-fixture.ts` 被同一套 LSP 报 **20 个错误**（含 5 个同款模块解析失败），而该文件自 9 月 8 日起一直在仓库里且 CI 始终绿——说明该目录的 LSP 解析本身就不可信，不是因为本文件新建。
3. **关键否定测试**：向 `rows.ts` 注入一个故意类型错误（`insertUser` 返回 `Promise<string>`），真实 `tsc` 报两处 `TS2322`（`rows.ts(128,5)` 与消费方 `admin-accounts.contract.test.ts(41,5)`）并以 exit=1 失败。这证明 `rows.ts` 确实经 import 被真实检查覆盖，LSP 的模块错误不是「文件没人管」的信号。错误已还原，`tsc` 回到 exit=0。

### R5 低产值测试裁剪与守卫

**根 Python 测试**：把「文档必须包含自然语言 token」的元组断言换成结构断言——`Path.exists()`，以及从 `.env.example` / YAML 里解析出键名后断言键存在。判据是：改一句文档措辞不应导致测试失败。

**`home.smoke.spec.ts` 拆分**：几何布局断言（`desktop navigation lens stays within its glass segment` 等）移入独立的 `home-layout-geometry.spec.ts`；`home.smoke.spec.ts` 保留文档健康、渲染、主题开关这类 smoke 语义。拆分不改断言内容，只改文件归属。

**`apps/web/tests/unit/e2e/unit-source-policy.test.ts`**：与 `e2e-source-policy.test.ts` 同型（`readdir` + TypeScript AST）。首版只拦两条已经咬过的规则：

1. `tests/unit/**` 里重新出现 `vi.unstubAllGlobals()` 调用；
2. `tests/unit/**` 的测试文件里直接 `import { MemoryRouter } from "react-router"`。

第二条需要豁免名单机制：既有 56 个文件已经直接 import。首版做法是只对新文件生效——遍历时跳过基线快照里已存在的文件路径。策略代码本身也是开销，只拦已经咬过两次的规则。

## 度量口径

以下口径写死，AC 复核时按同一脚本重跑。

- **产品代码**：`apps/api/src/`、`apps/web/app/`、`packages/contracts/src/`，文件扩展名 `.ts .tsx .js .jsx .mjs .cjs .py .css .rs .html .sh`，取 `git ls-files` 跟踪的文件。
- **测试代码**：路径匹配 `(^|/)(tests|__tests__|e2e)/`，或文件名匹配 `*.test.*`、`*.spec.*`、`test_*.py`，或位于 `fixtures/`、`__mocks__/`，或为 `vitest.*` / `playwright*.config.*`。
- **SLOC**：去掉 `/* */` 块注释（Python 另去 `'''` / `"""`），丢掉空行与以 `//`、`#`、`*` 开头的行。
- **断言行**：匹配 `expect(|\.toBe|\.toEqual|\.toHave|\.toContain|\.not\.`。
- **排除**：`.trellis/`、`node_modules/`、构建产物。

度量脚本是复核工具，不提交进仓库。

### 量化 AC 的口径问题（Phase 6 前需修正）

PRD 的两条量化指标是「`tests/unit` 断言行占比 ≥ 18%」与「测试/产品 SLOC ≤ 82%」。R1+R2 全部完成后实测：

| 指标 | 基线 | R1+R2 后 | AC 目标 |
| --- | ---: | ---: | ---: |
| `tests/unit` 原始行 | 38,798 | 37,844 | — |
| `tests/unit` SLOC | 34,691 | 33,829 | — |
| `tests/unit` 断言行 | 4,438 | 4,439 | — |
| 断言行占比（原始行口径，与 PRD 的 11.4% 同口径） | 11.44% | 11.73% | ≥ 18% |

要在断言数不变的前提下达到 18%，总行数必须降到 24,661，即再删 13,760 行（36%）。R3 能吃掉的内联数据量级是 E2 表里那约 1,395 行，R4、R5 更小，都不足以接近。根因是**占比这个口径的分母就是测试文件本身**：收敛装配层把分子分母一起缩小，占比几乎不动。它度量的是「测试里有多少是断言」，不是「写一个测试要花多少装配」，而后者才是本任务的目标。

因此 Phase 6 应把这两条换成能反映真实收益的口径，例如：

- 新增一个页面测试所需写的装配行数（目标 ≤ 5 行）；
- `tests/unit` 的**非断言行绝对数**下降量（基线 33,554 行 = SLOC − 断言行，当前 29,507 行）；
- 新增测试文件对 `support/` 的采用率。

在指标被修正之前，不允许通过删断言来凑占比——PRD Notes 已把这条写作硬约束。

## 取舍

- **抽象带来的阅读跳转 vs 复制的行数**。选择共享装配层，因为复制的是「这个项目怎么装 router / 怎么 stub fetch」这类与用例无关的知识；但对断言一律不抽象——断言写在哪，失败信息就在哪。任何把断言包成一行调用的做法都视为违反本设计。
- **全局 `unstubGlobals` vs 逐文件显式 teardown**。全局开关改变的是隐式行为，可能让个别依赖「stub 跨用例存活」的测试失败。缓解：改动后立刻全量跑 `test:unit`，把失败用例当作需要显式声明 stub 的信号处理，而不是回退配置。
- **有界迁移 vs 一次到位**。只迁移指定的 20 个单测文件加 5 个 API 文件，剩余 150 多个文件保持原样。代价是仓库中期存在两种风格；收益是 diff 可审、每个文件可独立回滚。用守卫测试阻止新增分叉，而不是靠一次性大重写。
- **守卫测试本身的开销**。`e2e-source-policy.test.ts` 415 行是已经付过的成本。新增守卫保持最小，且带基线豁免，避免变成第二个需要维护的规则引擎。

## 兼容性与回滚

- 五个需求彼此独立，任一阶段可单独 revert，不影响其它阶段。
- R1 的回滚是删掉一行配置并恢复 69 处 teardown。
- R2、R3、R4 的回滚是按文件还原迁移；新增的 `support/` 与 `fixtures/` 文件在没有调用方后删除，不留下悬空引用。
- R5 的回滚是还原被裁剪的断言与文件拆分。
- 生产代码、CI 配置、Playwright 配置全程不变，因此回滚不触及构建产物与发布路径。

## 验证方式

每个阶段收尾跑该阶段的最小集，阶段全部完成后跑一次全量：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm run check:rules
```

其中 R3 需额外做一次**反向验证**：临时删掉一个工厂产出里的 required 键，确认一致性测试失败；R5 需额外做一次**措辞验证**：改动被断言文档的一句措辞，确认根 Python 测试不失败。两次验证的结果记入任务 notes。
