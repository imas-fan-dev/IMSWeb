# Implement: 测试编写开销收敛与装配层统一

阶段顺序是刻意的：R1 最小、可立刻验证方向；R2 复用 R1 建立的 `support/` 目录；R3 依赖 R2 的目录约定；R4 独立于 R2/R3，可与 R3 交换顺序；R5 最后做，因为裁剪需要前面阶段已经稳定。

每个阶段结束都是一个可提交、可回滚的点。

## Phase 0 — 基线与度量

在动任何文件之前，先固定基线数字，否则阶段完成后无法判断是否真的有收益。

- [ ] 建立度量脚本（临时文件，不入库），按 design.md「度量口径」实现四项统计：
  - `apps/web/tests/unit/` 的文件数、总行数、SLOC、断言行数与占比
  - 产品代码 SLOC 与测试代码 SLOC 之比
  - `apps/web/tests/unit/` 里各重复模式的出现次数与涉及文件数
  - `apps/api/tests/` 里 `INSERT INTO` 与 `createHonoApp(` 的出现次数
- [ ] 跑一次基线，把结果写入任务 `notes`。
- [ ] 跑一次全量前置验证，确认起点是绿的：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
```

**评审门**：基线数字与本 PRD 的 E1–E4 一致。不一致时先解释差异再继续。

**回滚点**：仅新增临时脚本，无需回滚。

## Phase 1 — R1 全局 teardown 收敛

- [ ] 在 `apps/web/vitest.config.ts` 的 `test` 段加入 `unstubGlobals: true`。
- [ ] 列出全部 69 处 `vi.unstubAllGlobals()`，按 design.md 的判据分类：整块仅剩该语句的删除；混有其它语句的只删该行。
- [ ] 逐文件提交删除，检查 `afterEach` 与 `vi` 的 import 是否变成未使用并清理。
- [ ] 验证：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
```

**评审门**：单测全绿，且没有测试因为 stub 生命周期变化而失败。若有用例失败，判断它是「本来依赖了跨用例的 stub 泄露」还是「配置真的不生效」——前者补显式 stub，后者回退配置并记录原因。

**回滚点**：`git revert` 本阶段提交即可，不涉及其它阶段。

## Phase 2 — R2 Web 单测共享装配层 【已完成】

实际范围见 design.md「R2 实施记录」：`renderPage` 收窄到 2 个文件 18 处，`installFetchMock` 扩大到全仓 167 处手写 stub，`setupUser` 取消。

- [x] 新建 `apps/web/tests/unit/support/api-client.ts`，实现 `requestDetails`、`successResponse`、`installFetchMock`。
- [x] 新建 `apps/web/tests/unit/support/harness.tsx`，实现 `I18nTestProvider`、`renderPage`。`setupUser` 已取消，理由记在 design.md。
- [x] 给 `support/` 的两个文件补最基本的自测？**不补**。它们是薄包装，行为由使用它们的测试覆盖；为它们单独写测试是把开销从一处搬到另一处。此条为显式决策，不是遗漏。
- [x] 迁移 10 个含本地 `function requestDetails` 的文件，10 份变体全部合并（含差异最大的 `endpoints/editorial.test.ts`）。
- [x] 迁移 4 份本地 `TestI18nProvider` 到 `I18nTestProvider`。
- [x] 迁移 `renderPage`：实际适用面是 2 个文件 18 处内联 `<MemoryRouter>`（`classic-wiki-pages.test.tsx` 12 处、`community-exchange-page.test.tsx` 6 处），而不是原设想的 10 个文件。
- [x] 额外完成：`installFetchMock` 从「10 个文件」扩大到全仓手写 fetch stub。单行形态 56 处 + 多行形态 111 处，共 167 处，分布在 59 个文件。完成后 `apps/web/tests/unit/` 仅剩 `support/api-client.ts` 实现行一处。
- [x] 额外完成（收尾续批）：全量重复扫描后收敛其余四类跨文件重复——本地 `jsonResponse` 17 文件、本地 `requestFrom` 10 文件、本地 `touchEvent` 3 文件、手写 `document.cookie = "…"` 92 处 / 35 文件（新增 `support/dom-events.ts` 与 `support/auth-cookies.ts`）。四类本地定义均归零；手写 cookie 字符串仅余 `auth-cookies.ts` 内两行实现。
- [x] 每迁移一个文件，确认断言数量不减少（用 Phase 0 的脚本按文件核对）。
- [x] 验证结果：`test:unit` 185 files / 1181 tests 全绿；`lint`、`typecheck` 通过；改动提交前用规范化比对确认 63 个改动文件的断言 token 序列与 `HEAD` 完全一致（含顺序）。
- [ ] 验证：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
```

**评审门**：逐个文件 review 迁移 diff，确认没有任何断言被改写或放宽。迁移只允许改动 import、wrapper 与 setup 行。

**回滚点**：本阶段逐文件独立，可只还原单个文件。`support/` 目录在本阶段完成后即被使用，若整体回退需连同调用方一起还原。

## Phase 3 — R3 契约驱动 fixture 工厂 【已完成】

可行性排查、类型来源与一致性测试的形状见 design.md「R3 可行性排查」「工厂的类型从哪来」「一致性测试的实际形状」。

- [x] 可行性排查：枚举 21 个契约模块，232 个 schema 可取 required 键，46 个（叶子原子加 HTTP 错误联合）返回 `null`；无 `ZodLazy`，无对象藏在 union 里。
- [x] `requiredKeysOf` 与 `assertFactoryCoversSchema` 落在 `support/fixtures/schema-conformance.ts`；非 `ZodObject` 返回 `null`，调用方跳过键覆盖检查。
- [x] 范例域 `support/fixtures/chronicle.ts`（`makeChronicleActivitySummary`、`makeChronicleActivity`）加一致性测试；助手另配自测，覆盖 `null` 分支与批量报错消息。
- [x] **反向验证**（已执行并还原）：删掉工厂的 `title` 后 typecheck 报 `TS2322`，运行时由助手报 `fixture is missing contract keys: title`。该验证已固化为 `schema-conformance.test.ts` 的永久用例，不再依赖手工操作。
- [x] 其余域工厂：`wiki.ts`（19）、`fudaba.ts`（14）、`namecards.ts`（3）、`platform.ts`（3）、`about.ts`（3）、`producer-map.ts`（3），加上 `chronicle.ts`（2），共 48 个导出工厂，配 58 条 `assertFactoryCoversSchema` 断言。
- [x] 迁移集合：`lib/api/media-urls.test.ts`（−395 行）、`lib/api/endpoints/wiki.test.ts`（−193）、`pages/wiki/classic/classic-wiki-pages.test.tsx`（−115）、`lib/api/endpoints/fudaba.test.ts`（−73）、`pages/community/community-office-page.test.tsx`（−60）。剔除 `pages/community/exchange/community-exchange-me-page.test.tsx`（数据是 mock 装配，非领域夹具）。
- [x] 实施中修掉一个导出面缺陷：4 个 item 级 helper 原为模块私有，迁移暴露出 3 处 `makeFudabaOwnerCardList().items[0]` 的绕道写法，已改为导出。见 design.md「R3 实施记录」。
- [x] 断言未变：64 个改动的测试文件 token 序列与 `HEAD` 逐行一致（仅 `editorial.test.ts` 的 R2 已知换行假象例外）；`media-urls.test.ts` 从首个 `describe` 到 EOF 的 404 行逐字节未变；`wiki.test.ts` 的 136 行断言文本与 12 个标题逐字节相同。
- [x] 验证：`pnpm --filter @imsweb/web run test:unit` 193 files / 1241 tests 全绿；`typecheck`、`lint`、`prettier --check` 均通过。

原始验证命令：

```sh
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run typecheck
```

**评审门**：迁移后每个文件的断言数量不减少，且被替换的内联数据在语义上与原值一致（逐 fixture 对照，不是抽样）。

**回滚点**：工厂文件与调用方一起还原。未迁移的文件不受影响。

## Phase 4 — R4 API 测试应用工厂与数据行构造器 【已完成】

范围已按实测修正，见 design.md「R4 实施前实测」「接口修正」「迁移目标」「R4 实施记录」。与初版设计的四处偏离：`createTestApp` 之外补 `testRequest`（`app.request` 450 处、手写 host 245 处才是主重复轴，而非 `createHonoApp` 的 51 处）；砍掉通用的公开 `insertRows`；`rows.ts` 从 6 个构造器收到 **4 个**（`fudaba_cards` / `cards` 去掉，表名复现不等于插行形状复现）；迁移目标从 10 个文件收到 8 个。

- [x] 新建 `apps/api/tests/server/test-app.ts`：`TEST_ORIGIN`、`createTestApp`（drop-in，仍返回 `ImsHonoApp`，吸收 `() => this.runtime() as never` 那类转换）、`testRequest`（path 不以 `http` 开头时补 `TEST_ORIGIN`，否则原样透传）。
- [x] 新建 `apps/api/tests/fixtures/rows.ts`：4 个域构造器（`platform_accounts`、`backoffice_accounts`、`users`、`fudaba_office_public_locations`）加模块私有的 `runInsert` / `requireInsertedId`。适配 `ManagedSqlDatabase` 的 `prepare(sql).bind(...values).run()`；需要 id 的用 `RETURNING id` 加 `.first()`。列集从仓内现有 INSERT 与 repository 代码推导。
- [x] `fudaba_cards` / `cards` **不建构造器**：两者的每一处插行写的都是不同的行种类（21 列带 `owner_account_id` / 12 列子集带 `card_number` / 带 `origin` 且与 `setval` 及配对的 `cards` 行绑定；`cards` 四处里三处是字面量迁移输入），构造器会把被断言的形状搬出断言它的测试。判据已写进 `rows.ts` 文件头。
- [x] 迁移 8 个文件：`platform-email-auth.contract.test.ts`、`platform-session-security.contract.test.ts`、`fudaba-location-repository.test.ts`、`fudaba-domain-repository.test.ts`、`fudaba-public-routes.test.ts`、`backoffice-auth-boundary.contract.test.ts`、`admin-accounts.contract.test.ts`、`auth-refresh.contract.test.ts`。
- [x] `platform-email-delivery-repository.test.ts` 与 `story-repository.test.ts` **无可迁移面**：插的都是单文件表（`platform_email_request_cooldowns`、`platform_password_reset_codes`、`agencies`、`idols`），且文件里没有 `createHonoApp` 也没有 `app.request`。初版表格把全局表频次套到了这两个文件头上，已纠正。
- [x] 刻意保留原样：`assert.rejects` / `assert.throws` 内的插行（7 处）、只在一个文件出现的表（15 个）、已在本地 seeder 函数里的 18 处、host 敏感的 CORS 绝对 URL、其余 28 个文件里的 `app.request` 调用点。
- [x] 迁移中未改变任何断言的期望值与覆盖的场景，未新增、未删除用例（8 个文件的断言行序列与用例标题经脚本比对与 `HEAD` 逐字一致）。
- [x] 验证：`test:server` 536 pass / 0 fail / 0 skip；`test:wiki` 60 pass / 0 fail；`syntax` exit 0；`check:architecture` 通过（353 domain modules）；`check:rules` 通过。

```sh
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run syntax
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
```

`check:architecture` 必须跑：`test-app.ts` 不得变成第二个 composition root，架构检查会验证 `src/app.ts` 仍是唯一装配入口。

**评审门**：迁移文件的用例数与断言数不减少；`rows.ts` 只导出 4 个域构造器、不导出通用 `insertRows`；负例断言内的插行未被改造；`check:architecture` 确认 `src/app.ts` 仍是唯一装配入口。均已核对。

**回滚点**：逐文件可还原；`test-app.ts` 与 `rows.ts` 在没有调用方后删除。

## Phase 5 — R5 低产值测试裁剪与守卫 【已完成】

- [x] 根 Python 测试：把自然语言 token 元组断言替换为结构断言（`exists()`、解析后断言键存在）。范围按 PRD 的稳健性判据选定：改动文档措辞不得使测试失败。实际清掉 13 个 CJK 散文 token（`test_operations_docs.py` 8 个、`test_github_deployment.py` 5 个），用模块级 `ENVIRONMENT_ASSIGNMENT` 正则加 `parse_environment_template(text)` 取键；英文键、`package.json`、`assertNotIn`/`assertNotRegex` 与 SQL 断言全部保留，11/27 用例计数不变。
- [x] **措辞验证**：把 `docs/operations/database-configuration.md` 的「同一个 PostgreSQL 物理数据库」改为「同一套 PostgreSQL 数据」，`tests.test_operations_docs` 随即以 `AssertionError: '一个 PostgreSQL 物理数据库' not found` 失败并倾倒整篇文档；还原后 11 项 OK。证明该类断言纯粹是负债。（此处记录的是改动前的实测；R5 之后的回归已由结构断言覆盖。）
- [x] 拆分 `apps/web/tests/e2e/home.smoke.spec.ts`：几何断言移入 `home-layout-geometry.spec.ts`（609 行 / 7 用例），smoke 从 1279 降到 675 行 / 8 用例；共用的 `homeSeededApis` 常量移入 `tests/e2e/fixtures/public-content.ts`，避免 spec 互相 import。
- [x] 新增 `apps/web/tests/unit/e2e/unit-source-policy.test.ts`：拦截全局 teardown 外迁、`vi.unstubAllGlobals()` 回归、新增直接 `MemoryRouter` import（带 53 文件基线豁免）。
- [x] 验证：`test:unit` 194 files / 1247 tests 全绿；两个 home spec 经 Playwright 列出 40 个用例。

**评审门**：拆分与裁剪只删除了「断言文档措辞」类断言，没有删除任何验证产品行为的断言。逐个被删断言说明它验证的是什么、为什么可以不要。

**回滚点**：本阶段全部是测试文件与守卫，还原范围独立。

## Phase 7 — R5 之后的追加工作（超出原 PRD 范围）

R5 完成后，同一工作区又落了四批改动。它们不属于本任务的 R1-R5 判据，但与本任务共用同一批测试与装配层文件，且用户要求归档后统一提交，因此一并记录，避免账本失真。

- [x] **Web 测试 import 改绝对路径**：新增 `@/*` → `apps/web/*` 别名（`tsconfig.json` 的 `paths`，加 `vitest.config.ts` 的显式 `resolve.alias`）。无需改 `vite.config.ts`：其 `resolve.tsconfigPaths: true` 已让 Vite dev 与构建认 tsconfig paths。改写 `tests/` 下 161 处两层以上爬升，分布为 `@/tests` 101、`@/mocks` 49、`@/scripts` 等 9、`~/`（app）2；残留 0。四套解析器均验证：tsc、vitest、Vite dev 与构建、Playwright `--list`（31 文件 / 115 用例）。
- [x] **开发期 mock API（MSW）**：`apps/web/mocks/`（`data/` 15 个契约化工厂模块、`handlers/` 的 26 个只读 handler、两个 `assets/` 占位图）加 `app/entry.client.tsx` 的 `VITE_IMS_MOCK_API` 门控、`mocks/worker-script-plugin.ts`（从已装 msw 包供给 worker 脚本，不 vendored）、漂移守卫 `tests/unit/mocks/`（16 文件 / 87 用例）。入口 `pnpm run dev:web:mock`。生产构建实测不含 mock 代码。
- [x] **修 `/information/:id/content` 在 dev 与打包 App 下的断裂**：根因是 iframe 用裸根相对 src，而该路径由 API 渲染。生产由同一 Node 进程兼供前端与 API 故正常；dev 下落到 React Router 自己的 404 文档，打包 App 下解析到 WebView 从不外出。组件改走 `resolveMediaUrl`（非 App target 为空操作），并在 `vite.config.ts` 加正则代理 `^/information/[^/]+/content(?:$|\?)`——不能用 `/information` 前缀，Vite 按前缀匹配会连带吞掉页面路由。
- [x] **修 chronicle fixture 的领域不变量**：`makeEditorialArticle()` 缺 `source_type` 等必填语义字段（契约里是 optional，故 zod 与 `assertFactoryCoversSchema` 双双放过），导致 `/chronicle` 两个泳道皆空、只剩 142 字符，且详情页徽章会错显「民间」。已补 `article_id`/`occurred_on`/`date_precision`/`source_type`/`location`/`timeline_order`。
- [x] **补一个确定性 CI 阻断**：新增 package 脚本会使 `tests/test_workspace_boundaries.py` 的脚本数量棘轮失败（root 56→57、web 20→21）。已按该测试的既定约定抬计数并注明用途。

**与 Phase 6 的一处偏离**：Phase 6 原计划「按阶段拆分提交」；用户明确要求归档后统一提交，故改为单个提交。各阶段信息不丢，记录在提交正文与本文件。

## Phase 6 — 全量验证与收尾

- [ ] 跑 design.md「验证方式」的全部命令。
- [ ] 重跑 Phase 0 度量脚本，与基线对照，核对 AC 的量化指标。
- [ ] 逐条核对 PRD 的 Acceptance Criteria，未达成的条目写明原因，不允许默默跳过。
- [ ] 若量化指标未达成，先判断是「迁移范围不足」还是「口径问题」，再决定追加迁移或修正指标——不通过删断言凑数。
- [x] 更新 `.trellis/spec/web/frontend/testing.md`（新增 shared assembly layer、contract-typed fixture fidelity、dev-time API mocks 三节）、`.trellis/spec/repository/index.md`（脚本计数棘轮与本地跑治理测试的检查项）、`docs/development/testing.md`（指向上述三节、位置表补 `apps/web/mocks/`）。
- [x] 在 `docs/development/testing.md` 留一处指向 spec 的指针。
- [x] 提交：按用户要求归档后统一提交（偏离原「按阶段拆分」计划，理由与范围见 Phase 7）。
- [x] 全量 CI 等价验证（本地）：`check-root`、`contracts`、`delivery repository`、`delivery web`、`delivery integration`、`api`、`governance` 全过。E2E 在默认并行下失败 11 例，按 CI 条件 `CI=1 --workers=1` 复跑同一批后 49 通过 / 3 跳过 / 0 失败，判定为本地并行争用而非回归。

**评审门**：AC 全绿，spec 已更新，度量对照已记录。

**回滚点**：逐阶段提交，可选择性回滚某个阶段而不影响其它阶段。

## 验证命令汇总

```sh
# 单测与类型
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck

# API
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run syntax
pnpm --filter @imsweb/api run check:architecture

# 仓库级
pnpm run check:rules

# E2E 抽样（仅 R5 拆分后）
pnpm --filter @imsweb/web exec playwright test tests/e2e/home.smoke.spec.ts tests/e2e/home-layout-geometry.spec.ts
```

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 全局 `unstubGlobals` 让个别依赖 stub 泄露的用例失败 | Phase 1 立刻全量跑单测；失败用例补显式 stub，不回退配置 |
| 迁移过程中无意放宽断言 | 每个文件迁移前后用脚本核对断言数量；评审门要求逐文件 review |
| `requestDetails` 的 4 份变体语义不同，合并后改变边界行为 | 只先合并 5 份逐字节相同的；其余逐个 diff 后决定，必要时保留本地变体 |
| `renderPage` 隐藏了 Provider 组合，新测试不知道渲染环境 | harness 保持薄包装，只包 i18n 与 router；文档在 spec 里写明它包含什么、不包含什么 |
| `test-app.ts` 演化成第二个 composition root | `check:architecture` 作为阶段门；测试助手只接受 services |
| 度量指标驱动出「删断言凑数」的行为 | PRD Notes 已写明判据是装配行数下降；Phase 6 明令不允许通过删断言达成指标 |
| 迁移范围有界导致中期两种风格共存 | 守卫测试阻止新增分叉；剩余文件按「新写即用新层」渐进迁移 |
