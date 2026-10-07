# 测试编写开销收敛与装配层统一

## Goal

把「写一个新测试」的固定开销降下来，而不是削减测试本身。具体要做的四件事：让测试装配集中到共享层、让领域数据由契约驱动生成、让 API 测试复用同一个应用工厂、并清掉那批改文档就要跟着改的低产值用例。

目标不是最大化 DRY，而是**减少写一个测试需要做的决策数**：一个新文件的第一屏应该讲这个页面做什么，而不是这个项目怎么装配。

## 背景与证据

以下数字来自 `git ls-files` 跟踪的代码文件实测（排除 `.trellis/`），口径与统计脚本记录在 design.md。

### E1 Web 单测：装配样板在 185 个文件里各自复制

`apps/web/tests/unit/` 共 185 个测试文件、38,798 行，其中包含 `expect`/匹配器的断言行只有 4,438 行，占 11.4%。同一份装配逻辑被反复重写：

| 重复模式 | 出现次数 | 涉及文件 |
| --- | ---: | ---: |
| `vi.unstubAllGlobals()` | 69 | 69 |
| `vi.stubGlobal("fetch", …)` | 91 | 40 |
| `userEvent.setup()` | 227 | 70 |
| `MemoryRouter` 包裹 `render(` | — | 56 |
| 本地 `function requestDetails` | 10 | 10 |

其中 `requestDetails` 有 5 份是逐字节相同的副本。`apps/web/vitest.config.ts` 已经开启 `clearMocks`、`restoreMocks`，唯独漏了 `unstubGlobals`——而 vitest 4.1.11 支持这个配置项（`vitest/dist/config.d.ts:59` 已确认类型存在）。

### E2 大文件里 mock 字面量吃掉四成行数

| 文件 | 总行 | 内联数据字面量行 | 断言行 |
| --- | ---: | ---: | ---: |
| `tests/unit/lib/api/endpoints/wiki.test.ts` | 1,187 | 533 | 136 |
| `tests/unit/pages/wiki/classic/classic-wiki-pages.test.tsx` | 1,112 | 317 | 139 |
| `tests/unit/lib/api/media-urls.test.ts` | 947 | 383 | 68 |
| `tests/unit/pages/community/community-cards-page.test.tsx` | 884 | 162 | 163 |

（内联数据行为启发式统计，用于比较量级，不作为精确指标。）

对照 E2E 侧：`tests/e2e/fixtures/namecards.ts` 早就有 `makeNamecard(overrides)` 与 `makeNamecardPage(...)`。同一个仓库的单测侧一个工厂都没有，每个文件自己内联整份领域对象。

### E3 API 测试：50,235 SLOC 只配了 135 行共享辅助

`apps/api/tests/server/postgres-test-database.ts`（59 行）加 `fake-valkey.ts`（76 行）就是全部共享层。其余靠手工：

- `createHonoApp(...)` 51 处调用散落在 30 个文件，依赖装配各写一遍，且形态分裂：`() => ({})`、`() => runtime(...)`、`() => services`、`() => this.runtime()`
- `INSERT INTO` 118 处散落在 31 个文件，测试数据行全靠手写 SQL
- 单文件最大 1,957 行

DB 生命周期那层已经收敛好了（`tests/postgres-test-lifecycle.js` 加 59 行 adapter），属于 09-08 的成果，本任务不动。

### E4 高 churn 低产值的测试在持续收费

最近 300 个提交里被改次数最多的文件：

| 文件 | 改动次数 |
| --- | ---: |
| `apps/web/tests/e2e/home.smoke.spec.ts` | 38 |
| `apps/api/tests/migration/postgres-migrations.test.js` | 37 |
| `tests/test_operations_docs.py` | 24 |
| `tests/test_workspace_boundaries.py` | 22 |
| `tests/test_github_deployment.py` | 21 |
| `tests/test_compose_deployment.py` | 21 |

`home.smoke.spec.ts` 1,280 行只放了 13 个 test，其中 `desktop navigation lens stays within its glass segment` 一个块跨了 300 多行。根 Python 测试里有 24.1% 的行在做文档子串匹配——文档改个措辞就得跟着改。216 个改动测试的提交中有 33 个（15.3%）完全不碰生产代码也不碰文档。

### E5 E2E 的约束机制已经成熟，不需要重建

38 个 spec 全部从 `./fixtures/test` 导入 `test`，12 个 fixture 文件，`api-dispatcher` 与各域 mock 已到位，还有 415 行的 `tests/unit/e2e/e2e-source-policy.test.ts` 用 AST 拦 `waitForTimeout`、直连 `page.route`、绕过 fixture 的用例。这块是本次要复制的**样板**，不是要改造的对象。

## Requirements

### R1 Web 单测全局 teardown 收敛

- `apps/web/vitest.config.ts` 增加 `unstubGlobals: true`，与既有的 `clearMocks` / `restoreMocks` 并列。
- 删除 69 处 `vi.unstubAllGlobals()` 中的独立形态；混在其它 teardown 语句里的保留。
- 不改变任何断言语义。

### R2 Web 单测共享装配层

- 新增 `apps/web/tests/unit/support/`，至少包含：
  - `api-client.ts`：`requestDetails`、`successResponse`、`installFetchMock`
  - `harness.tsx`：路由/Provider 包裹的渲染函数与配置好的 user-event 实例
- 迁移范围有界，不做全量重写：10 个含本地 `requestDetails` 的文件，加上单测行数最大的 10 个页面测试文件。
- 迁移后这些文件的断言数量不得减少。

### R3 契约驱动 fixture 工厂

- 新增按域的 fixture 工厂（`@imsweb/contracts` 的 schema 是唯一真相）。
- 每个工厂配一个契约一致性测试：工厂产出必须能通过对应 schema 的 `parse`，且键集合覆盖 schema 的全部 required 键——契约新增必填字段时该测试必须失败。
- 迁移 `tests/unit/` 内联数据行最多的 5 个文件。

### R4 API 测试应用工厂与数据行构造器

- 新增 `apps/api/tests/server/test-app.ts`，提供统一的应用构造入口，覆盖 `createHonoApp` 现有的四种调用形态。
- 新增 `apps/api/tests/fixtures/rows.ts`，提供领域数据行构造器，替代手写 `INSERT INTO`。
- 迁移行数最大的 5 个 API 测试文件。
- 不改变断言与覆盖范围。

### R5 低产值测试裁剪与守卫

- 根 Python 测试：删除整段自然语言 token 匹配，保留「文件存在 + 关键配置项存在」的结构断言。
- `home.smoke.spec.ts` 拆分：把布局几何断言移出主 smoke 文件。
- 新增 `apps/web/tests/unit/e2e/unit-source-policy.test.ts`，与既有的 `e2e-source-policy.test.ts` 同型，至少拦截两条回归：重新引入 `vi.unstubAllGlobals()`、新文件直接 `import { MemoryRouter }`。

## Constraints

- 不修改任何生产代码（`apps/api/src/`、`apps/web/app/`、`packages/contracts/src/`）。
- 不修改 Playwright 配置、vitest 的 `timeout`、CI workflow。
- 不引入新依赖。`@imsweb/contracts` 封装 zod 的规则继续生效，测试代码不得直接 import `zod`。
- 迁移逐文件可审查，禁止为统一风格制造与本次目标无关的格式化 diff。
- 测试语义不变：迁移前后断言必须等价，不允许为了通过而放宽断言。
- 已有的测试编排契约（`scripts/testing/run-test-owner.mjs` 的 owner 模型、`tests/e2e/fixtures/test.ts` 的自动 fixture）保持原样。

## Acceptance Criteria

- [ ] `pnpm --filter @imsweb/web run test:unit` 全绿。
- [ ] `pnpm --filter @imsweb/api run test:server` 全绿；`pnpm --filter @imsweb/api run test:wiki` 全绿。
- [ ] `pnpm --filter @imsweb/web run lint`、`pnpm --filter @imsweb/web run typecheck`、`pnpm --filter @imsweb/api run syntax` 通过。
- [ ] `pnpm run check:rules` 通过。
- [ ] `apps/web/tests/unit/` 中不再有 `vi.unstubAllGlobals()` 的独立形态，且不再有本地 `requestDetails` 副本。
- [ ] `apps/api/tests/` 中不再新增手写 `INSERT INTO`（改造过的文件内），且迁移文件全部走 `test-app.ts`。
- [ ] 每个新增 fixture 工厂都有对应的 schema 一致性测试，且该测试在故意删掉一个 required 键时会失败（需在实现时验证一次）。
- [ ] `tests/test_operations_docs.py` 等根 Python 测试不再依赖自然语言 token 匹配；文档措辞调整不应导致这些测试失败（需在实现时用一次措辞改动验证）。
- [ ] 量化指标（用 implement.md 记录的统计命令复核）：
  - `apps/web/tests/unit/` 断言行占比从 11.4% 提升到 ≥ 18%；
  - 测试 / 产品 SLOC 比从 86.7% 降到 ≤ 82%（目标 ≤ 80%）。

## Notes

- 度量脚本不提交为仓库产物；统计口径写在 design.md，复核时按同一口径重跑。
- 迁移范围刻意有界。剩余文件采用「新写即用新层，旧文件不动」的渐进策略，避免一次性 185 文件的大 diff。
- 本任务的判据是「新测试的装配行数下降」，不是「测试总数下降」。任何以删断言换指标的改动都视为违反 R1–R5。
