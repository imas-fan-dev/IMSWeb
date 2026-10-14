# API 测试套件迁移：验证记录

本文件按批次追加。每条记录给出改动文件、执行的精确命令、迁移前后的 file/test/skip 数字，以及与计划的偏差。

## 批次 E：脚本、typecheck、适配器归属与 plan 收口

范围：共享 PostgreSQL 适配器的归属（`tests/server/postgres-test-database.ts` → `tests/postgres-test-database.ts`）、单一 `tsconfig.tests.json` 类型门禁、`apiPlan()` 的三段套件折叠为一次全树 Vitest。
分支 `chore/vitest-test-unification`，起点 `e232e68f`。本批是批次 A–D 之后的收口批；docs 与 `.trellis/spec` 的散文改写不在本批（父任务的收口步骤）。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `apps/api/tests/server/postgres-test-database.ts` → `apps/api/tests/postgres-test-database.ts` | `git mv`（git 识别为 rename），文件名不变；文件内 `from '../postgres-test-lifecycle.js'` → `from './postgres-test-lifecycle.js'`（与它并列的 `tests/postgres-test-lifecycle.js` 同目录） |
| 32 个 `tests/server/*.ts` | `from './postgres-test-database'` → `from '../postgres-test-database'`（`s3-object-storage.test.ts` 原为双引号，同步改） |
| `apps/api/tests/node-security.test.js` | `from './server/postgres-test-database.ts'` → `from './postgres-test-database.ts'` |
| `apps/api/tsconfig.tests.json`（新增） | `extends: ./tsconfig.server.json`，`noEmit: true`，`rootDir: "."`，include `src/**/*.ts` + `src/**/*.tsx` + `tests/**/*.ts` |
| `apps/api/package.json` | `typecheck`：`tsc -p tsconfig.server.json --noEmit` → `tsc -p tsconfig.tests.json --noEmit`；`test:server` → `vitest run tests/server`；`test:wiki` → `vitest run tests/wiki`（两个 per-suite `tsc` 前缀删除）。script 总数仍为 43，`test:node` / `test:migration` / `test:assets` / `test` 未动 |
| `apps/api/tests/server/tsconfig.json`、`apps/api/tests/wiki/tsconfig.json` | 删除（见下「删除前调查」） |
| `apps/api/tests/wiki/README.md` | 1 处旧门禁描述改为指向共享 `typecheck`（该文件在批次 B 已被改过一次，属同一维护线，不是 docs 散文批） |
| `scripts/testing/run-test-owner.mjs` | `apiPlan()`：`all` profile 在 build/check 之后只留一次 `pnpm exec vitest run`（cwd apps/api），删除 `test:server` / `test:wiki` / `test:migration` 三个步骤；`node` profile 的「build → 显式 5 文件 Vitest 命令」原样保留 |
| `scripts/testing/tests/run-test-owner.test.mjs` | API plan 断言就地重写（命令、argv、cwd、冻结性、build 先于 test 的顺序全部保留，见「计划断言的自举证据」） |

未改动：`tests/integration/postgres-harness.ts`（保持原位，显式 close 语义不变）、`tests/postgres-test-lifecycle.js` 与其 `.d.ts`、`apps/api/vitest.config.mts`、`tests/**` 的其余文件、根 `package.json`、`scripts/ci/detect-affected-workspaces.mjs` 的清单、`apps/api/tests/server/postgres-test-database.ts` 以外的测试逻辑。

### 改动 1：适配器归属（`git mv` + 33 个导入文件）

- 引用面：33 个文件、49 行 `postgres-test-database` 引用。其中 `tests/server` 32 个文件、顶层 `tests/node-security.test.js` 1 个；有 17 个文件同时导入 `postgresTest` 与 `createPostgresTestDatabase`，所以 33 个文件对应 49 行。
- 迁移后用「不匹配新路径」的反向 grep 收口：`grep -rn "postgres-test-database" tests/ | grep -vE "from ['\"]\.\./postgres-test-database['\"]" | grep -vE "from ['\"]\./postgres-test-database(\.ts)?['\"]"` → 0 行。
- `tests/integration/postgres-harness.ts` 未动：它不是「Hono 行为与服务边界」目录的一部分，但它是 runner 中立的显式 close 适配器，本批只处理 Vitest 适配器的归属。

### 改动 2：单一类型门禁

**删除前调查**（grep 全仓，排除 `.trellis/` 任务记录）：

| 目标 | 命中 | 结论 |
| --- | --- | --- |
| `tests/server/tsconfig` | 0（排除 `.trellis/` 后无任何命中） | 无脚本/测试/工具引用 → 删除 |
| `tests/wiki/tsconfig` | 1：`apps/api/tests/wiki/README.md:13`（散文，非调用） | 无脚本/测试/工具引用 → 删除，并修 README 那一句 |
| `wiki-contract-tests`（outDir） | 1：`tests/wiki/tsconfig.json` 自身的 `outDir` | 无任何消费方 → 删除该配置后成孤儿项一并消失 |

**覆盖范围对照**：

| 指标 | 迁移前 | 迁移后 | 说明 |
| --- | --- | --- | --- |
| `tsc` 调用数（测试树） | 3（`typecheck` 的 server 配置 + `test:server` 前缀 + `test:wiki` 前缀） | 1（`tsconfig.tests.json`） | — |
| `src/**` 被检文件 | 497（`tsconfig.server.json`） | 497（同一组 glob、同一组继承选项，仅 `rootDir` 由 `src` 变 `.`） | 覆盖等价 |
| `tests/**/*.ts` 被检文件 | 113（server 105 + wiki 8） | 124 | 新增 11 个从未被任何 tsconfig include 的文件 |
| 被检文件合计 | — | 621（497 src + 124 tests） | `--listFiles` 实测 |

新增覆盖的 11 个 `.ts`：`tests/contracts/contract-json.ts`、`tests/contracts/runtime-contracts.d.ts`、`tests/fixtures/account-security-fixture.ts`、`tests/fixtures/auth-request.ts`、`tests/fixtures/fudaba-agency-catalog.ts`、`tests/fixtures/owner-route-fixture.ts`、`tests/fixtures/rows.ts`、`tests/integration/fudaba-agency-fixture.ts`、`tests/integration/migration-catalog.ts`、`tests/integration/postgres-harness.ts`、`tests/postgres-test-lifecycle.d.ts`。`tests/migration` 的 18 个测试与 `tests/assets` 的 2 个都是 `.js`，`allowJs` 不开，与迁移前一致（等价迁移，非降级）。

**门禁是新造的活跃检查，不是空跑**（先证明它能抓到错误，再报 0 错误）：

```sh
# 探针：往 tests/ 放一个必然报错的 .ts，跑门禁，然后删除
cp /tmp/gate-probe.ts tests/__gate_probe.ts   # export const broken: string = 123;
node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit
# → tests/__gate_probe.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'.  exit=1
rm -f tests/__gate_probe.ts

# 正式一次
node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit
# → 0 行输出，exit=0（无任何既存类型债：新增的 11 个 helper 与本批移动的适配器都干净，没有需要修的 TS 错误，也没有加 any、没有放宽 tsconfig）
```

### 改动 3：API plan 折叠为一次运行

形状（`apiPlan(profile, buildPrepared)`）：

| profile | 步骤 |
| --- | --- |
| `all` | `pnpm --filter @imsweb/api run check`（或 prepared 形态的 `syntax` + `check:architecture`）→ **一次** `pnpm exec vitest run`（cwd `apps/api`，`include` 已解析 `tests/**`） |
| `node` | `pnpm --filter @imsweb/api run build` → `pnpm exec vitest run <5 个顶层文件>`（cwd `apps/api`，文件清单仍显式写死） |

被删掉的三段 `run API test:server` / `test:wiki` / `test:migration` 已被全树那一次覆盖；`test:node` 仍委派给 owner runner（`api node`），没有改成裸 `vitest run`——它是「已构建产物」车道，折叠发生在 plan 内部。

计数对照（PG 启用）：

| 命令 | 折叠前 | 折叠后 | 差异 |
| --- | --- | --- | --- |
| `node scripts/testing/run-test-owner.mjs api all` | 4 次 Vitest：5/74 + 102/626 + 7/60 + 18/114 = **132 files / 874 tests**，39.3s | 1 次 Vitest：**134 files / 884 tests**，35.0s | +2 files / +10 tests |
| `node scripts/testing/run-test-owner.mjs api node` | 5 files / 74 tests，5.0s | 5 files / 74 tests，5.0s | 0 |

`+2 files / +10 tests` 就是 `tests/assets`（`client-allowlist` 4 + `frontend-routing.contract` 6）：它原先只在 delivery integration 计划里跑，现在落进折叠后的全树运行，属**新增可见覆盖**而非计数漂移。`874 + 10 = 884 = 134` 个文件的合计与 132+2 完全对齐，没有任何用例丢失。

### 计划断言的自举证据（父任务 design §3 要求的第 2 步）

按顺序执行，中间态没有被跳过：

1. **先改 `run-test-owner.mjs` 的 `apiPlan()`**（删除三段套件、`all` 用一个无文件参数的 vitest 步骤），此时 `scripts/testing/tests/run-test-owner.test.mjs` 仍是 node:test 文件、断言未改。
2. **用现状 runner 跑一次，记录失败点**：`node --test scripts/testing/tests/run-test-owner.test.mjs`
   → 退出码 1，`tests 11 / suites 0 / pass 8 / fail 3 / skipped 0`，失败的正是覆盖被改形状的三条：

   ```text
   ✖ the root plan builds API once before every prepared API test group
     + actual - expected
       [ 'build', 'test:assets', 'syntax', 'check:architecture',
     -   'test:server', -   'test:wiki', -   'test:migration' ]

   ✖ the standalone API owner builds once and retains every check and group
     actual: [ 'check' ]
     expected: [ 'check', 'test:server', 'test:wiki', 'test:migration' ]

   ✖ every API profile runs the Node artifacts in one explicit Vitest command
     actual: [ 'exec', 'vitest', 'run' ]
     expected: [ 'exec', 'vitest', 'run', 'tests/hono-app-contract.test.js', … ]
   ```

   第一条在 `scripts(apiSteps)` 的 deepEqual 就中止，所以它原本还有的两条断言（`apiBuildIndex < apiNodeIndex`、`plan.filter(args.includes('tests/hono-app-contract.test.js')).length === 1`）没有被执行到——它们同样依赖被删掉的字符串，重写时按形状逐条核对确认，不靠这次运行观察。
3. **就地重写断言（强度不降）**：
   - 新增两个助手：`isApiSuiteStep`/`apiSuiteSteps`（按 `executable === "pnpm"`、`cwd === <repo>/apps/api`、且 `args` 与写死的 `["exec","vitest","run"]` 逐项相等来识别折叠后的那一次运行）、`apiVitestSteps`（原 `apiNodeSteps` 改名并加 `cwd` 限定）。
   - `the root plan …`：`scripts(apiSteps)` 改为 `["build","test:assets","syntax","check:architecture"]`；`apiBuildIndex < apiSuiteIndex` 仍断言「build 先于 test」；`apiSuiteSteps(plan).length === 1` 仍断言「恰好一次测试运行」；plan/step/args 三层冻结性断言保留。
   - `the standalone API owner …`：`scripts(complete)` 改为 `["check"]`；`apiSuiteSteps(complete).length === 1`。
   - `every API profile runs its tests in one explicit Vitest command`：`node` profile 仍断言恰好 1 步、`executable === "pnpm"`、argv 与写死的 5 文件 `apiNodeCommand` 深等、`cwd === <repo>/apps/api`；`api`/`root` 两个 plan 断言 `apiSuiteSteps` 恰好 1 步、argv 与 `apiSuiteCommand` 深等、cwd 相同，并逐文件断言计划里**不再出现**那 5 个产物文件名（防止折叠后重复跑一份清单）。
   - 两条用例名随形状改名（`… before its prepared API test group`、`… runs one API test group`），其余用例（`node` profile 的 build-before-artifact、integration delivery、Web、错误信息/flag fail-closed、spawn 的 cwd/env/退出码/信号传播）未改。
4. **再跑一次**：`node --test scripts/testing/tests/run-test-owner.test.mjs` → 退出码 0，`tests 11 / pass 11 / fail 0 / skipped 0`（用例数 11 → 11，未删用例，未降强度）。

### 执行的命令与结果

```sh
cd <worktree>   # /Users/texas/Workspace/IMSWeb/.worktrees/vitest-test-unification

# 1. owner 端到端
node scripts/testing/run-test-owner.mjs api all
# → [test-owner] check and build API → [test-owner] test prepared API
# → Test Files 134 passed (134) / Tests 884 passed (884) / Duration 31.43s，总耗时 34.98s，退出码 0
node scripts/testing/run-test-owner.mjs api node
# → [test-owner] build API → [test-owner] test prepared API Node artifacts
# → Test Files 5 passed (5) / Tests 74 passed (74) / Duration 3.52s，总耗时 5.02s，退出码 0

# 2. owner 自带测试
node --test scripts/testing/tests/run-test-owner.test.mjs
# → tests 11 / pass 11 / fail 0 / duration_ms 944，退出码 0
node --check scripts/testing/run-test-owner.mjs && node --check scripts/testing/tests/run-test-owner.test.mjs
# → 退出码 0

# 3. 四个同名套件脚本（PG 启用）
pnpm --filter @imsweb/api run test:server    # → Test Files 102 passed (102) / Tests 626 passed (626)，退出码 0
pnpm --filter @imsweb/api run test:wiki      # → Test Files   7 passed   (7) / Tests  60 passed  (60)，退出码 0
pnpm --filter @imsweb/api run test:migration # → Test Files  18 passed  (18) / Tests 114 passed (114)，退出码 0
pnpm --filter @imsweb/api run test:assets    # → Test Files   2 passed   (2) / Tests  10 passed  (10)，退出码 0
# 计数与批次 A–D 的记录值逐一相同（102/626、7/60、18/114、2/10），差异 0

# 4. 新类型门禁
pnpm --filter @imsweb/api run syntax
# → $ node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit（+ 各脚本 node --check），退出码 0，1.82s

# 5. PG 禁用孪生路径（全树）
#    任务给的形状 `pnpm exec vitest run --root apps/api` 在仓库根直接失败：
#    [ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "vitest" not found（根 node_modules 没有 vitest，父任务 design §1.1）
cd apps/api && IMS_TEST_POSTGRES_ENABLED=false pnpm exec vitest run
# → Test Files 133 passed | 1 skipped (134) / Tests 666 passed | 218 skipped (884) / Duration 12.81s，退出码 0
#   666 + 218 = 884，与启用态总数一致 → 声明全部保留、没有被静默丢弃；唯一整体跳过的文件是
#   tests/migration/namecard-unification-reconcile.test.js (2 tests)
#   跳过文案取证（单文件 verbose）：
#   IMS_TEST_POSTGRES_ENABLED=false pnpm exec vitest run tests/server/story-repository.test.ts --reporter=verbose
#   → ↓ tests/server/story-repository.test.ts > PostgreSQL … [PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false] ×10

# 6. Python 侧
python3 -m unittest tests.test_operations_docs tests.test_workspace_boundaries -v
# → Ran 37 tests in 1.21s / OK，退出码 0（api script 计数 43 的断言照旧通过，未改任何 Python 断言）
pnpm run check:rules && pnpm run check:boundaries
# → Documentation rules passed: 25 Markdown files …；Workspace boundary check passed…；退出码 0，1m53s

# 7. runner 残留门禁
grep -rn "node --test\|--experimental-strip-types\|--import tsx --test" apps/api scripts/testing/*.mjs
# → apps/api/vitest.config.mts:24（注释里提到 `node --test` 的隔离语义，不是命令）
# → scripts/testing/run-test-owner.mjs:44,59,72,88,97（governancePlan / contractsPlan / deliveryPlan(root|repository|app) 的
#     `--experimental-strip-types`，属根契约与治理域，归子任务 2；apiPlan 内 0 命中）
# → 即 API 执行域内 node --test / tsx 加载器 / --experimental-strip-types 全部消失
```

### 与计划的偏差

1. **`typecheck` 是替换而不是串联**。父任务 design §2.4 写「新配置挂到现有 `typecheck` 脚本里**串联执行**」，本批把 `typecheck` 的内容整体换成单一 `tsc -p tsconfig.tests.json --noEmit`。理由：新配置的 `src` 覆盖与 `tsconfig.server.json` 逐项等价（同一组 glob、同一组继承选项，仅 `rootDir` 由 `src` 变 `.`；`--listFiles` 两侧都是 497 个 src 文件，`rootDir` 不参与诊断），串联会重复检查同一批文件；`src` 的独立程序仍由 `build`（`tsc -p tsconfig.server.json --outDir <staging>`，`noEmitOnError`）保留。dispatch 要求的是「one gate replaces three」，所以按单条落地。这是本批唯一一处偏离父任务 design 文字的地方。
2. **PG 禁用全树检查换成了等价命令**。dispatch 的形状 `IMS_TEST_POSTGRES_ENABLED=false pnpm exec vitest run --root apps/api` 在仓库根必然失败（根没有 vitest），改为 `cd apps/api && IMS_TEST_POSTGRES_ENABLED=false pnpm exec vitest run`，语义相同。
3. **动了 `apps/api/tests/wiki/README.md` 的一句散文**。该 README 记录的正是被删掉的 `tsc -p tests/wiki/tsconfig.json --noEmit`；不修会留下一处指向已删文件的说明。它既不在 `docs/` 也不在 `.trellis/spec/`，批次 B 已改过同文件一次，属同一维护线。其余 docs 与 spec 散文未动（`.trellis/spec/api/backend/testing.md` 仍写着 node:test 时期的形状，留给父任务的收口步骤）。
4. **`scripts/ci/detect-affected-workspaces.mjs` 的 `API_INTEGRATION_FILES` 未加 `apps/api/tsconfig.tests.json`**。那份清单是「改了会触发 API 集成测试」的运行时面；类型门禁配置不改变运行时行为，且批 A–D 也未把测试文件加进该清单。没有测试要求它，故不动。

### 未验证 / 遗留

- **没有提交**。本批改动留给主会话审查与提交（`git add` / `git commit` 禁止）。
- **`pnpm run check:pre-commit` 没有端到端跑**（它包含 web build/lint 与 contracts 构建）。已用 `check:rules` + `check:boundaries` + `syntax` + 四个套件 + 两份 Python 用例覆盖本批触及的面。
- **`pnpm run test:web-routing`（delivery integration）没有跑**：本批只折叠了 owner plan 的 API 段，未改 delivery 段；`tests/assets` 已单独跑过（2/10）。
- **根契约与治理域仍是 node:test**：`scripts/testing/run-test-owner.mjs` 里 governance/contracts/delivery 的 Node 段仍带 `--experimental-strip-types --test`（上面 grep 的 5 处），属子任务 2（根契约与治理迁移，仍 planning）的范围，本批不碰。
- **`.trellis/spec/api/backend/testing.md` 与 `docs/development/testing.md` 的散文未对齐**：spec 的 Test ownership / Signatures（`postgresTest(name, async (t) => …)`）/ Commands（`node --test apps/api/tests/postgres-test-lifecycle.test.js`）/ Test ownership 段仍写 node:test 与旧的 `tests/server/tsconfig.json` 门禁；docs 的 script 计数属既有漂移。按 dispatch，docs 与 spec 的散文改写是后续独立步骤。
- **`tests/wiki/README.md` 之外的 12 处 `.trellis` 任务记录**仍引用被删的两个 per-suite tsconfig；那是历史批次的过程记录，按「不重写任务记录」保留。

## 批次 D：tests/assets 与顶层 5 文件

范围：`apps/api/tests/assets/*.test.js`（2）、顶层 5 个文件（`hono-app-contract`、`node-listener-probe`、`node-security`、`operation-scripts`、`postgres-test-lifecycle`）、`apps/api/package.json` 的 `test:assets`、`scripts/testing/run-test-owner.mjs` 的 API plan Node 段、`scripts/testing/tests/run-test-owner.test.mjs` 的 API 断言。
分支 `chore/vitest-test-unification`，起点 `9ad5a5b3`。这 7 个测试文件迁移前都是 CJS（`'use strict'` + `require`），所以本批同时是模块格式变更。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `tests/assets/client-allowlist.test.js` | 导入 ESM 化（`node:test` → `vitest`）；首个用例加 `{ timeout: 60_000 }`（见偏差 1） |
| `tests/assets/frontend-routing.contract.test.js` | 导入 ESM 化；4 处对编译产物的 `require(path.join(SERVER_ROOT, …))` 改为 `const loadCompiled = createRequire(import.meta.url)` 后的 `loadCompiled(…)`（装载顺序与 `requireBuild` 守卫的报错文案不变） |
| `tests/hono-app-contract.test.js` | 导入 ESM 化；17 处子进程 `node -e` 脚本里的 `require(` 改为 `loadModule(`，由 `const CHILD_LOADER = "const { require: loadModule } = module;\n"` 统一前置（见偏差 2） |
| `tests/node-listener-probe.test.js` | 导入 ESM 化；`context.diagnostic(…)` → `context.task.meta.listenerProbe = { phase, status, elapsedMs }` |
| `tests/node-security.test.js` | 导入 ESM 化；fixture 改为注入 `{ test: postgresTest, beforeAll, afterAll }`，`test` 复用 `tests/server/postgres-test-database.ts` 的 Vitest 适配器 |
| `tests/node-security/fixture.js` | 删除 `require('node:test')`；`before/after` → `beforeAll/afterAll`；`test` 由调用方注入。**仍是 CJS**，不加 vitest 导入 |
| `tests/operation-scripts.test.js` | 导入 ESM 化；`add-user.js` 与 `container-data.js` 的 require 改为静态具名 import（两个死掉的路径常量随之删除，`HASH_PASSWORD_SCRIPT` 保留给子进程调用） |
| `tests/postgres-test-lifecycle.test.js` | 导入 ESM 化；2 处 `t.mock.method(console, 'warn', impl)` → `vi.spyOn(console, 'warn').mockImplementation(impl)` + `onTestFinished(() => warn.mockRestore())` |
| `apps/api/package.json` | 仅 `test:assets`：`node --test tests/assets/frontend-routing.contract.test.js tests/assets/client-allowlist.test.js` → `vitest run tests/assets`。script 总数仍为 43 |
| `scripts/testing/run-test-owner.mjs` | `apiPlan()` 的 Node 段：`node ["--test", ...apiNodeTests]`（cwd apiRoot）→ `pnpm ["exec","vitest","run", ...apiNodeTests]`（cwd apiRoot，文件清单仍显式 5 条，不改成目录 glob） |
| `scripts/testing/tests/run-test-owner.test.mjs` | `scripts()` 助手收窄为「非 `exec` 的 pnpm 步骤」；新增 1 个用例钉住三个 API profile 的 Vitest 命令/argv/cwd；重写 api-node 用例的断言（见「计划断言的自举证据」） |

未改动：`apps/api/vitest.config.mts`（未加 loader、未加 setup、未改 maxWorkers/超时/isolate）、`tests/integration/postgres-harness.ts`、`tests/postgres-test-lifecycle.js` 与其 `.d.ts`、`tests/node-security/*.owner.js`、`tests/server`、`tests/wiki`、`tests/migration`、`apps/api/package.json` 的其余 42 条脚本、`test:node`。断言仍全部是 `node:assert/strict`，没有换成 `expect`。

### 计数对照

`tests/assets`（PG 无关）：

| 指标 | 迁移前（`node --test <2 文件>`） | 迁移后（`vitest run tests/assets`） | 差异 |
| --- | --- | --- | --- |
| files | 2 | 2（`Test Files 2 passed (2)`） | 0 |
| tests / pass / fail / skipped | 10 / 10 / 0 / 0 | 10 / 10 / 0 / 0 | 0 |
| 逐文件 | `client-allowlist` 4、`frontend-routing.contract` 6 | 4、6 | 0 |

顶层 5 文件（PG 启用，任务给定的记录值 74）：

| 文件 | 迁移前 file/test/pass/fail/skip | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- |
| `hono-app-contract` | 1 / 10 / 10 / 0 / 0 | 10 / 10 / 0 / 0 | 0 |
| `node-listener-probe` | 1 / 1 / 1 / 0 / 0 | 1 / 1 / 0 / 0 | 0 |
| `node-security` | 1 / 36 / 36 / 0 / 0 | 36 / 36 / 0 / 0 | 0 |
| `operation-scripts` | 1 / 8 / 8 / 0 / 0 | 8 / 8 / 0 / 0 | 0 |
| `postgres-test-lifecycle` | 1 / 19 / 19 / 0 / 0 | 19 / 19 / 0 / 0 | 0 |
| 合计 | 5 / 74 / 74 / 0 / 0 | 74 / 74 / 0 / 0 | 0 |

PG 禁用（`IMS_TEST_POSTGRES_ENABLED=false`）的孪生路径：

| 文件 | 迁移前 | 迁移后 | 差异 |
| --- | --- | --- | --- |
| `node-security` | 36 / 0 / 0 / 36 | 36 声明 / 0 passed / 36 skipped（`Test Files 1 passed (1)`） | 0 |
| `postgres-test-lifecycle` | 19 / 19 / 0 / 0 | 19 passed | 0 |
| 合计 | 55 / 19 / 0 / 36 | `Tests 19 passed \| 36 skipped (55)` | 0 |

禁用态的跳过文案实测为 `[PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false]`，与批次 A 的适配器契约一致（由 `postgresTest` 的 `ctx.skip` 产生，逐条用例自带的 skip 文案本来就不存在）。

### 计划断言的自举证据（父任务 design §3 要求的第 2 步）

按顺序执行，中间态没有被跳过：

1. **先改 `run-test-owner.mjs` 的 plan**（上面表格里的那一行），此时 `scripts/testing/tests/run-test-owner.test.mjs` 仍是 node:test 文件、断言未改。
2. **用现状 runner 跑一次，记录失败点**：`node --test scripts/testing/tests/run-test-owner.test.mjs`
   → 退出码 1，`tests 10 / pass 8 / fail 2`，失败的两条正是覆盖被改形状的断言：

   ```text
   test at scripts/testing/tests/run-test-owner.test.mjs:78:1
   ✖ the standalone API owner builds once and retains every check and group
     actual: [ 'check', 'tests/postgres-test-lifecycle.test.js', 'test:server', 'test:wiki', 'test:migration' ]
     expected: [ 'check', 'test:server', 'test:wiki', 'test:migration' ]

   test at scripts/testing/tests/run-test-owner.test.mjs:95:1
   ✖ the standalone API Node profile builds before using its artifact
     at …run-test-owner.test.mjs:98:10
     actual: [ 'build', 'tests/postgres-test-lifecycle.test.js' ]
     expected: [ 'build' ]
   ```

   两个失败都来自 `scripts()`（`pnpm` 步骤取尾参）把新的 `pnpm exec vitest run <files>` 步骤的最后一个文件当成了脚本名；第二条用例在第 98 行就中止了，**原 `assert.equal(plan[1].args[0], "--test")` 那一行因此没有被执行到**，它的失效是随后重写时按形状逐条核对确认的，不是靠这次运行观察到的。
3. **就地重写断言（强度不降，且新增覆盖）**：
   - `scripts()` 收窄为「`executable === "pnpm"` 且 `args[0] !== "exec"`」——语义就是「plan 跑的 workspace 脚本」，`pnpm exec` 的 Vitest 调用改由各自的 command/argv/cwd 断言覆盖；
   - 新增用例 `every API profile runs the Node artifacts in one explicit Vitest command`：对 `api/node`、`api`、`root` 三个 plan 断言恰好 1 个 Vitest 步骤、`executable === "pnpm"`、`args` 与写死的 `[exec, vitest, run, <5 个文件>]` 深等、`cwd === <repo>/apps/api`。文件清单写死在断言里，所以「某个测试从 owner 计划里掉出去」是硬失败；
   - 原 api-node 用例改为：`scripts(plan)` 仍为 `["build"]`、`plan.length === 2`、`plan[1].executable === "pnpm"`、`plan[1].args.slice(0,3) === ["exec","vitest","run"]`、cwd 不变。命令、argv、cwd、冻结性与失败传播（后两条由未改动的既有用例覆盖）都保留。
4. **再跑一次**：`node --test scripts/testing/tests/run-test-owner.test.mjs` → 退出码 0，`tests 11 / pass 11 / fail 0 / skipped 0`（10 → 11 是新增用例）。

### 执行的命令与结果

```sh
# 1. 迁移前基线（起点 9ad5a5b3，全部在 apps/api 下）
node --test tests/hono-app-contract.test.js tests/node-listener-probe.test.js tests/node-security.test.js tests/operation-scripts.test.js tests/postgres-test-lifecycle.test.js
# → tests 74 / pass 74 / fail 0 / skipped 0 / duration_ms 3692.6
# 逐文件：hono 10、listener 1、security 36、operation 8、lifecycle 19
IMS_TEST_POSTGRES_ENABLED=false node --test tests/node-security.test.js tests/postgres-test-lifecycle.test.js
# → tests 55 / pass 19 / fail 0 / skipped 36（security 36 skipped、lifecycle 19 pass）
pnpm --filter @imsweb/api run test:assets
# → tests 10 / pass 10 / fail 0 / skipped 0 / duration_ms 7523（逐文件 client-allowlist 4、frontend-routing 6）
node scripts/testing/run-test-owner.mjs api node
# → 退出码 0，末段 `tests 74 / pass 74`
node --test scripts/testing/tests/run-test-owner.test.mjs
# → tests 10 / pass 10 / fail 0

# 2. 迁移后（本批 7 个文件一起）
cd apps/api && pnpm exec vitest run tests/assets/client-allowlist.test.js tests/assets/frontend-routing.contract.test.js tests/hono-app-contract.test.js tests/node-listener-probe.test.js tests/node-security.test.js tests/operation-scripts.test.js tests/postgres-test-lifecycle.test.js
# → Test Files 7 passed (7) / Tests 84 passed (84) / Duration 9.44s，退出码 0
#   逐文件：assets 4 + 6；顶层 10 + 1 + 36 + 8 + 19 = 74

# 3. 包脚本（同名替换后）
pnpm --filter @imsweb/api run test:assets
# → Test Files 2 passed (2) / Tests 10 passed (10)，退出码 0

# 4. PG 禁用孪生路径
cd apps/api && IMS_TEST_POSTGRES_ENABLED=false pnpm exec vitest run tests/node-security.test.js tests/postgres-test-lifecycle.test.js
# → Test Files 2 passed (2) / Tests 19 passed | 36 skipped (55)，退出码 0
# 跳过文案：↓ … [PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false]

# 5. owner plan 端到端（新 API plan）
node scripts/testing/run-test-owner.mjs api node
# → 退出码 0；`[test-owner] build API` → `[test-owner] test prepared API Node artifacts`
#   → Test Files 5 passed (5) / Tests 74 passed (74)

# 6. owner 自带测试（本批仍是 node:test）
node --test scripts/testing/tests/run-test-owner.test.mjs
# → tests 11 / pass 11 / fail 0 / skipped 0，退出码 0

# 7. 相邻套件不回退
pnpm --filter @imsweb/api run test:server
# → Test Files 102 passed (102) / Tests 626 passed (626)（迁移前记录 102/626，差异 0）
pnpm --filter @imsweb/api run test:migration
# → Test Files 18 passed (18) / Tests 114 passed (114)（迁移前记录 18/114，差异 0）
pnpm --filter @imsweb/api run syntax
# → 退出码 0（tsc -p tsconfig.server.json --noEmit + 各脚本 node --check）
node --check scripts/testing/run-test-owner.mjs
# → 退出码 0

# 8. 治理
python3 -m unittest tests.test_operations_docs tests.test_workspace_boundaries -v
# → Ran 37 tests … OK（api script 计数仍 43 / root 57 / web 21；test:infra 的字符串未变，未改任何 Python 断言）
node scripts/testing/run-test-owner.mjs governance
# → 退出码 0：Node 段 tests 59 / pass 59（含 run-test-owner.test.mjs 的 11 条），Python 段 Ran 123 tests … OK

# 9. runner 残留门禁（任务指定的 grep）
grep -rn "require(\|node:test" apps/api/tests/assets apps/api/tests/*.test.js
# → 0 命中（退出码 1）

# 10. 资源残留（PostgreSQL 生命周期不变量）
# 跑 tests/node-security.test.js 前 / 后同一次测量：ims_test* 数据库 17 → 17
# 日志中 force_drop_with_active_connections / drain_check_failed 告警 0 条
# （17 个是历史遗留，与批次 A 记录一致；本批命令不新增）
```

### 与计划的偏差 / 计划未覆盖的细节

1. **`tests/assets/client-allowlist.test.js` 的首个用例加了显式 `{ timeout: 60_000 }`。** 该用例跑整条客户端构建 + manifest 校验，实测约 8s（本轮 7.9–9.3s），而 Vitest 默认 `testTimeout` 是 5s；旧 runner 无默认超时，不加就会因「时间」而不是「行为」失败。加的是天花板不是放宽度：`apps/api/vitest.config.mts` 的 `pool/isolate/maxWorkers` 都没动，其他 6 个文件也没有用例接近默认值（实测最大单项 4.4s，属 PG 文件）。
2. **`hono-app-contract.test.js` 的子进程脚本用 `module` 取装载器。** 这 17 处 `require(` 都在 `node -e`（CJS）字符串里，必须继续走 CJS loader 才能加载编译产物；为满足本批「7 个文件中不得出现 `require(` / `node:test` 字面」的门禁，每个子脚本统一由 `CHILD_LOADER` 前置 `const { require: loadModule } = module;`，脚本内改用 `loadModule(…)`。挂载顺序完全保留（`[RUN-02]` 仍是先 patch `http.Server.prototype.listen`、再在 async 体内装载两个入口），错误消息与断言不变；10 条用例的 stderr 匹配断言全绿。
3. **`node-security` 的 fixture 保留 CJS，改为注入 runner 原语；`test` 复用 server 域的适配器。** `tests/node-security/fixture.js` 不能 `require('vitest')`（4.1.11 直接抛错），所以 runner 注册由 `tests/node-security.test.js` 注入；注入的 `test` 直接是 `tests/server/postgres-test-database.ts` 导出的 `postgresTest`，没有复制那段 skip 包装（设计把该适配器定为唯一的 Vitest PostgreSQL 适配器）。副作用有两点，请主会话确认：**(a)** 该文件因此新增一个跨目录依赖（顶层测试 → `tests/server` 适配器）；**(b)** 导入适配器会为该文件追加一个 `afterAll(closeSharedPostgresTestAllocator)`，与 fixture 自己 `afterAll` 里的同名调用重复（幂等，且实测无泄漏、无 drain 告警，见命令 10）。备选方案是在该文件复制约 10 行 skip 包装以避免跨目录依赖，与本批的复用取向冲突，故未采纳。
4. **`t.diagnostic` → `ctx.task.meta`。** `context.diagnostic(…)`（唯一的真实调用点）改为把 `phase/status/elapsedMs` 写进 `context.task.meta.listenerProbe`，即设计给的两种映射之一；信息没有静默丢弃，字段比原来的单行文本更结构化。
5. **三处注释里的 `node:test` 字样被改成「the previous runner」。** 门禁要求这 7 个文件里 `node:test` 0 命中，注释也算命中；搬运/映射的理由改由本节记录。
6. **`scripts()` 助手收窄，并新增 1 个用例（10 → 11）。** 收窄后「非 `exec` 的 pnpm 步骤」仍全部可见（`pnpm run check:root` 这类步骤不受影响），被排除的只是 Vitest 调用；新增用例把三个 API profile 的 Vitest 命令、5 文件清单、cwd 钉死，强度是增加而非下降。`apiPlan` 未加 `--config`：cwd 已是 `apps/api`，`vitest.config.mts` 由 vitest 按 root 自动发现，与 `test:assets` 等包脚本的调用形状一致（根契约域因为配置在 cwd 之外才需要显式 `--config`）。
7. **`operation-scripts.test.js` 顺带删掉了两个随 require 一起失效的路径常量**（`ADD_USER_SCRIPT`、`CONTAINER_DATA_SCRIPT`），避免留下指向已具名导入模块的死常量。
8. **`tests/node-security/*.owner.js` 一个字符没改**：它们只消费 `fixture.test`，注入点放在 fixture 里即可（已 grep 确认 7 个 owner 文件全部走 `fixture.test`）。

### 未验证 / 遗留

- **未跑 delivery integration（`pnpm run test:web-routing`）**：本批改了 `test:assets` 的实现，但该 profile 由根 owner 的 `deliveryPlan("integration")` 调用（build Web → build API → `test:assets`），已在命令 5 的 `api node` 之外单独跑过 `test:assets`（2/10 绿）。跨域收口由主会话在根任务验收时跑。
- **未跑 `pnpm --filter @imsweb/api run test:node`**：它现在仍是 owner 脚本（`node ../../scripts/testing/run-test-owner.mjs api node`），等价命令已在本批直接跑通（命令 5）；脚本替换与 tsconfig 收口属批次 F。
- **顶层 5 文件与 `tests/assets` 是否与 `tests/server` 共用进程池未单独压测**：本批用与 `tests/server` 同一份配置的默认 `maxWorkers`（本地 4 / CI 2）跑通，无超时、无 PG 残留；是否要按目录分组降并发留给收口批次按实测决定。
- **17 个历史 `ims_test_*` 数据库未清理**（与批次 A 的说明一致），本批只验证「跑前 = 跑后」。
- **`.trellis/spec/api/backend/testing.md` 未改**：Signatures/Contracts/Commands 三节的收敛属批次 F。
- **未在主检出写入任何文件**：所有编辑都在 worktree 绝对路径下；`tests/__probe*` 探针用完即删。

## 批次 C：tests/migration

范围：`apps/api/tests/migration/*.test.js`（18 个文件）+ `apps/api/package.json` 的 `test:migration`。
分支 `chore/vitest-test-unification`，起点 `af81a955`。本批含 4 个真实 PostgreSQL 文件（`cms-article-title-backfill`、`fudaba-metadata-import`、`namecard-unification-reconcile`、`postgres-migrations`），因此启用与禁用两条路径都跑了。

**本批有一个必须由主会话裁决的偏差：3 个测试文件新增了 `import 'tsx/cjs'`。** 详见「偏差」第 1 条。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `tests/migration/cms-article-title-backfill.test.js` | 导入 ESM 化；`test.after` → `afterAll`；5 处 `t.after` → `onTestFinished`；5 个用例回调去掉 `t` |
| `tests/migration/fudaba-media.test.js` | 同上；`createFixture(t)` → `createFixture()`（helper 内 `t.after` → `onTestFinished`）；6 个用例回调去掉 `t`；**新增 `import 'tsx/cjs'`** |
| `tests/migration/fudaba-metadata-import.test.js` | 同上；`createSourceFixture(t, …)` / `createApprovedSnapshot(t, …)` 去掉 `t`；8 处 `t.after` → `onTestFinished`；25 个用例回调去掉 `t`；`sqlite3` 绑定改写（见偏差第 3 条） |
| `tests/migration/information-to-community-posts.test.js` | 仅导入 ESM 化 |
| `tests/migration/legacy-about-avatars.test.js` | 导入 ESM 化；**新增 `import 'tsx/cjs'`** |
| `tests/migration/legacy-brand-assets.test.js` | 导入 ESM 化；用例内联的 `require('node:crypto')` 提到顶部默认导入 |
| `tests/migration/legacy-information-media.test.js` | 导入 ESM 化；`sourceFixture(t)` → `sourceFixture()`（1 处 `t.after` → `onTestFinished`）；1 个用例回调去掉 `t`；**新增 `import 'tsx/cjs'`** |
| `tests/migration/legacy-namecards.test.js`、`legacy-producer-map.test.js`、`local-upload-media.test.js`、`namecard-thumbnail-backfill.test.js`、`public-object-placement.test.js`、`semantic-object-keys.test.js`、`single-bucket-consolidation.test.js`、`wiki-media-sync.test.js`、`wiki-metadata-audit.test.js` | 仅导入 ESM 化（`node:test` → `vitest`） |
| `tests/migration/namecard-unification-reconcile.test.js` | 导入 ESM 化；`test.after` → `afterAll`；2 处 `t.after` → `onTestFinished`；2 个用例回调去掉 `t`；`poolClient()` 内联的 `require('pg')` 提到顶部具名导入 `{ Client }` |
| `tests/migration/postgres-migrations.test.js` | 导入 ESM 化；`test.after` → `afterAll`；2 处 `t.after` → `onTestFinished`；2 个用例回调去掉 `t` |
| `tests/migration/json-fixture-file.js` | This batch directory's private helper becomes ESM（`export function writeRestrictedJsonFixture`）；见偏差第 2 条 |
| `apps/api/package.json` | `test:migration` 同名替换：`TSX_TSCONFIG_PATH=… node --import tsx --test <18 文件清单>` → `vitest run tests/migration` |

未改动：`apps/api/vitest.config.mts`、`tests/postgres-test-lifecycle.js` 与其 `.d.ts`、两个 PostgreSQL 适配器、`tests/server`、`tests/wiki`、`tests/assets`、顶层 5 个文件、`run-test-owner.mjs`、`apps/api/package.json` 的其余 42 条脚本。断言语汇全部保持 `node:assert/strict`，**本批没有把任何 `assert` 换成 `expect`**。

### 计数对照

PG 启用（真实 PostgreSQL）：

| 指标 | 迁移前（`node --import tsx --test`） | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- |
| files | 18 | 18（`Test Files 18 passed (18)`） | 0 |
| tests | 114 | 114 | 0 |
| pass | 114 | 114 | 0 |
| fail | 0 | 0 | 0 |
| skipped | 0 | 0 | 0 |
| duration | 3760 ms | 3.82 s（复跑 3.8–7.0 s） | 同量级 |

PG 禁用（`IMS_TEST_POSTGRES_ENABLED=false`）：

| 指标 | 迁移前 | 迁移后 | 差异 |
| --- | --- | --- | --- |
| files | 18 | 18（`Test Files 17 passed \| 1 skipped (18)`，文件级 skip 见偏差第 6 条） | 0 |
| tests / pass / fail / skipped | 114 / 99 / 0 / 15 | 114 / 99 / 0 / 15 | 0 |

18 个文件的**逐文件** file/test/pass/fail/skip 在两种模式下都与迁移前**逐行相同**（迁移前用 `node --test --test-reporter=tap` 逐文件跑一次取数，迁移后用 `--reporter=json` 取数）：

| 文件 | 启用：前 → 后 | 禁用：前 → 后 |
| --- | --- | --- |
| `cms-article-title-backfill` | 9/9/0/0 → 9/9/0/0 | 9/5/0/4 → 9/5/0/4 |
| `fudaba-media` | 11/11/0/0 → 11/11/0/0 | 11/11/0/0 → 11/11/0/0 |
| `fudaba-metadata-import` | 20/20/0/0 → 20/20/0/0 | 20/13/0/7 → 20/13/0/7 |
| `information-to-community-posts` | 3/3/0/0 → 3/3/0/0 | 3/3/0/0 → 3/3/0/0 |
| `legacy-about-avatars` | 9/9/0/0 → 9/9/0/0 | 9/9/0/0 → 9/9/0/0 |
| `legacy-brand-assets` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `legacy-information-media` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `legacy-namecards` | 5/5/0/0 → 5/5/0/0 | 5/5/0/0 → 5/5/0/0 |
| `legacy-producer-map` | 8/8/0/0 → 8/8/0/0 | 8/8/0/0 → 8/8/0/0 |
| `local-upload-media` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `namecard-thumbnail-backfill` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `namecard-unification-reconcile` | 2/2/0/0 → 2/2/0/0 | 2/0/0/2 → 2/0/0/2 |
| `postgres-migrations` | 10/10/0/0 → 10/10/0/0 | 10/8/0/2 → 10/8/0/2 |
| `public-object-placement` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `semantic-object-keys` | 4/4/0/0 → 4/4/0/0 | 4/4/0/0 → 4/4/0/0 |
| `single-bucket-consolidation` | 3/3/0/0 → 3/3/0/0 | 3/3/0/0 → 3/3/0/0 |
| `wiki-media-sync` | 7/7/0/0 → 7/7/0/0 | 7/7/0/0 → 7/7/0/0 |
| `wiki-metadata-audit` | 3/3/0/0 → 3/3/0/0 | 3/3/0/0 → 3/3/0/0 |

用例名集合逐条比对（迁移前 TAP 的 `# Subtest:` 列表 vs 迁移后 json reporter 的用例全名）：**114 条对 114 条，集合完全相同**（无合并、拆分、改名、删除）。

### 执行的命令与结果

```sh
# 1. 迁移前基线（起点 af81a955）
pnpm --filter @imsweb/api run test:migration
# → tests 114 / suites 0 / pass 114 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms 3760.78
# 逐文件基线（18 次单文件 node --test，取 file/test/pass/fail/skip）
cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test --test-reporter=tap tests/migration/<file>.test.js

# 2. 迁移后（PG 启用）
pnpm --filter @imsweb/api run test:migration
# → Test Files 18 passed (18) / Tests 114 passed (114) / Duration 3.82s，退出码 0

# 3. 迁移后（PG 禁用）
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:migration
# → Test Files 17 passed | 1 skipped (18) / Tests 99 passed | 15 skipped (114)，退出码 0

# 4. 逐文件取证（json reporter，输出到 /tmp，不落进工作区）
pnpm --filter @imsweb/api exec vitest run tests/migration --reporter=json --outputFile=/tmp/migration-after.json
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run tests/migration --reporter=json --outputFile=/tmp/migration-after-disabled.json

# 5. 类型门禁（本轮未改 tests/server；该命令覆盖共享 helper）
pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit
# → 退出码 0
pnpm --filter @imsweb/api run typecheck
# → node node_modules/typescript/bin/tsc -p tsconfig.server.json --noEmit，退出码 0

# 6. server 套件不回退
pnpm --filter @imsweb/api run test:server
# → Test Files 102 passed (102) / Tests 626 passed (626)，退出码 0

# 7. 治理
node scripts/check-workspace-boundaries.mjs
# → Workspace boundary check passed... 退出码 0
python3 -m unittest tests.test_workspace_boundaries -v
# → Ran 26 tests ... OK（api script 计数仍为 43）

# 8. runner 残留门禁
grep -rn "require(\|node:test\|--import tsx" apps/api/tests/migration
# → 0 命中（退出码 1）

# 9. PostgreSQL 残留（spec 的 drain 不变量，方向性检查）
#    跑前 / 跑后同一次测量：ims_test* 数据库 17 → 17，ims_test* backend 0 → 0
#    （17 个是本次会话之前的历史遗留，与批次 A 记录一致；本批命令不新增）
```

`apps/api/package.json` 的 script 数量：迁移前后均为 **43**（`Object.keys(scripts).length` 确认），只有 `test:migration` 一行变化。

### 与计划的偏差 / 计划未覆盖的细节

1. **必须由主会话裁决：3 个测试文件新增 `import 'tsx/cjs'`（本批唯一的产品面外改动）。**
   `tests/migration` 里有 3 个文件会被 CJS 迁移脚本里的 `require(<.ts>)` 挡住，这些 require 是**原生 Node require**，Vite 的 TS 处理不参与：

   - `legacy-about-avatars.test.js`：`scripts/migration/legacy-about-avatars.js` 在**模块顶层** require 3 个 TS 模块（`src/domains/content/about/data.ts`、`src/utils/media/filename.ts`、`src/utils/storage/business-object-keys.ts`），文件在加载期即失败（0 test）。
   - `legacy-information-media.test.js`：`scripts/migration/legacy-information-media.js` 同样顶层 require 3 个 TS 模块（`information/data.ts`、`utils/http/content-type.ts`、`utils/storage/business-object-keys.ts`），同样加载期失败（0 test）。
   - `fudaba-media.test.js`：`scripts/migration/fudaba-media.js:1189` 在 `runFudabaMediaMigration()` 内部 require `src/infra/media/sharp/image-processor.ts`，文件能加载，但 11 个用例里有 5 个调用该函数，全部失败。

   **根因（已实测，不是猜测）**：`apps/api/package.json` 是 `"type": "commonjs"`，而 `src/**/*.ts` 是 ESM 语法。Node 24 的 `require(esm)` 对「commonjs 包内的 `.ts`」不成立：

   ```sh
   node -e "require('apps/api/src/domains/content/about/data.ts')"
   # (node:NNN) Warning: Failed to load the ES module: …/data.ts. Make sure to set "type": "module" …
   # SyntaxError: Cannot use import statement outside a module
   # 同一文件在最近 package.json 为 "type": "module" 的目录下 require 成功（/tmp 复现脚本，OK）
   ```

   Vitest（`pool: 'forks'`）把**内联的 CommonJS 项目文件**的 `require()` 交给原生 Node —— 见 `vitest/dist/module-evaluator.js` 的 `_createCJSGlobals()`：`require: this.createRequire(...)`，非 vm 池时 `createRequire` 就是 `node:module` 的原生版本；Vite 的 `ssrTransformScript` 只改写 `import`/`export`，不改写 `require`。所以这不是本批 18 个文件能改掉的东西：

   - 迁移前之所以能跑，正是因为 `node --import tsx --test`：tsx 的 CommonJS hook 让 `require(<.ts>)` 可用。这 3 个 CJS 脚本的生产命令本身就是 `node --import tsx scripts/migration/…`。
   - 因此本批在**这 3 个测试文件**里注册同一个 tsx CommonJS hook（`import 'tsx/cjs'`，作为首行，保证在脚本被求值前生效；`tsx` 已是 `apps/api` 的 devDependency）。
   - 被否决/待裁决的替代方案：(a) `apps/api/vitest.config.mts` 加 `poolOptions.forks.execArgv: ['--import','tsx']` 或依赖优化器 —— 该文件明确不在本批范围，且全局 `NODE_OPTIONS='--import tsx'` 实测**不可行**（`tsx` 无法从仓库根解析：`ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`）；(b) 把两个脚本的 TS require 改成惰性 —— 不够：测试确实走 `syncLegacyInformation` / `runFudabaMediaMigration` 这些用到 TS 的路径，且属 PRD「Out of Scope：迁移脚本行为变更」；(c) 改包 `type` 或加子目录 `package.json` —— 影响生产加载语义。
   - **需要主会话裁决**：保留这 3 行（各带 6 行注释说明），还是改为配置级方案 / 回退本批。文档与 PRD 都没有覆盖这个边界（PRD 的 R1/AC2 只约束 `package.json` 与 `run-test-owner.mjs` 里不出现 tsx 加载器，本改动不触犯那条 grep 门禁）。
2. **`tests/migration/json-fixture-file.js` 转成 ESM（本批目录内第 19 个文件，超出「18 个文件」的字面范围）。** 理由：验收里的 `grep -rn "require(" apps/api/tests/migration` 要求该目录零命中，而这个 helper 是 `.js` + `require` + `module.exports`，不转换必然命中。它与设计里点名的跨 runner helper（`tests/contracts/runtime-contracts.js`、`tests/postgres-test-lifecycle.js`、`tests/node-security/fixture.js`）不同：consumer 只有本批的 `fudaba-media` 与 `fudaba-metadata-import` 两个文件（`grep -rn json-fixture-file` 全仓只有这 2 处），迁移后两边都在 Vitest 下，不存在「另一个 runner 静态加载它」的约束。行为逐字保留（`mode: 0o600`、末尾换行、`JSON.stringify(value, null, 2)`）。
3. **`sqlite3` 的绑定形状必须显式改写。** `const sqlite3 = require('sqlite3').verbose()` 无法直译：`import sqlite3 from 'sqlite3'` 只给模块本身，而 `verbose()` 的返回值才是该绑定（实测 `lib/sqlite3.js` 的 `verbose()` 在给 Statement 原型挂 trace 包装后 `return sqlite3`，返回值就是模块本身）。写成 `import sqlite3Module from 'sqlite3'` + 顶层 `const sqlite3 = sqlite3Module.verbose();`（放在整段 import 之后），`new sqlite3.Database(...)` 调用点不动。
4. **`import { X: Y }` 不是合法 ESM，实际用 `as`。** 机械转换初版在两个文件写成 `import { writeRestrictedJsonFixture: writeJson }`，rolldown 报 `Expected ',' or '}' but found ':'`，已改为 `writeRestrictedJsonFixture as writeJson`（保留原文件的单行/多行形状与引号风格）。
5. **两处内联 commonjs require 提到顶部**：`legacy-brand-assets.test.js` 用例内的 `require('node:crypto').createHash(...)` → 顶部 `import crypto from 'node:crypto'` + `crypto.createHash(...)`；`namecard-unification-reconcile.test.js` 的 `poolClient()` 内 `const { Client } = require('pg')` → 顶部 `import { Client } from 'pg'`（与 `src/infra/db/postgresql/connection.ts` 的具名导入一致；实测 `import { Pool } from 'pg'` 在 Node ESM/`pg@8.22` 下可用）。
6. **跳过语义与文件级跳过报告**：4 个 PG 文件沿用 `{ skip: !postgresIntegrationEnabled() }`（布尔，Vitest 4 的 `TestOptions.skip` 接受），因此禁用时逐条文案仍是原样、条数不变（15 条）。差别在报告形状：`namecard-unification-reconcile` 的 2 个用例全被跳过时，Vitest 把**文件**也标成 skipped（`Test Files 17 passed | 1 skipped`），node:test 没有文件级 skip 概念；逐文件 test/pass/skip 数字完全一致。
7. **`t.after` → `onTestFinished` 共 20 处、6 个文件**：`cms-article-title-backfill`(5)、`fudaba-media`(2)、`fudaba-metadata-import`(8)、`legacy-information-media`(1)、`namecard-unification-reconcile`(2)、`postgres-migrations`(2)。注册位置与顺序未变。`test.after(...)` → `afterAll(...)` 共 4 处（批次 A 为这 4 个文件补的 allocator 收尾钩子，按计划从 node:test 归属改为 Vitest 归属）。
8. **去掉失效的 `TestContext` 形参**：39 个用例回调 + 4 个 helper 形参（`createFixture`、`createSourceFixture`、`createApprovedSnapshot`、`sourceFixture`）。`tsconfig` 未开 `noUnusedParameters`，去掉是为了不留误导性残留；已用脚本复核 18 个文件无「只出现一次」的死导入（唯一命中 `wiki-media-sync.test.js: extractCssReferences` 在迁移前就是只出现 1 次的历史遗留，非本批引入）。
9. **映射表里本目录不命中的项据实说明**：18 个文件里 0 处 `t.before`/套件级 `t.after`、`t.skip(reason)`、`t.diagnostic`、`t.test` 子测试、`t.mock.fn`、`t.mock.method`、`mock.timers`、`nodeTest` 别名，因此没有对应改写；`tests/migration` 也无 `.js` 后缀指向 `.ts` 文件的导入。
10. **`local-upload-media.test.js` 里用 `spawnSync(process.execPath, ['--import', 'tsx', …])` 拉起迁移 CLI 的用例原样保留**：那是被测对象（脚本的生产加载方式），与 runner 无关；它以数组元素形式出现，不命中 `--import tsx` 的字面门禁。

### 未验证 / 遗留

- **未跑 `pnpm run check:pre-commit` 全量**：该命令还包括 contracts owner、web unit/typecheck/lint、`syntax`、`check:architecture`。本批只直接跑了其中的 `test:migration` 一环（绿）。注意 pre-commit 会调用 `pnpm --filter @imsweb/api run test:migration`，本批之后它走 Vitest（3.8 s 级，PG 启用）；由于 3 行 `import 'tsx/cjs'`，该环是绿的，但**如果主会话否决该偏差而没有替代方案，pre-commit 会红**。
- **未跑 `pnpm run test:web-routing`（delivery integration）**：本批只改测试文件与一条脚本，不触及打包产物，留到收口。
- **未跑 `test:node`（顶层 5 文件 owner 计划）**：批次 D/E 范围。
- **`pg_database` 不变量未清零**：跑前跑后都是 17 个历史 `ims_test*` 库（批次 A 已记录同一批遗留），本批命令不新增、backend 为 0；spec 要求的「全部 project test prefix 为空」仍需收口时统一清理。
- **`.trellis/spec/api/backend/testing.md` 未改**：Signatures/Contracts 的 `postgresTest(name, body)`、去 TestContext 工厂签名与「禁用即 `ctx.skip(共享 reason)`」属批次 F 收口。
- **`import 'tsx/cjs'` 的取舍未验证是否可接受**：本 agent 无法替主会话决定（见偏差第 1 条）。

## 批次 B：tests/wiki

范围：`apps/api/tests/wiki/*.test.ts`（7 个文件）+ `apps/api/package.json` 的 `test:wiki`。
分支 `chore/vitest-test-unification`，起点 `88934a1d`。PostgreSQL 不参与本批（`tests/wiki` 无 PG 用法），因此全部命令均为 PG 无关命令。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `apps/api/tests/wiki/admin-data.contract.test.ts` | `node:test` → `vitest` 的具名导入 |
| `apps/api/tests/wiki/dom.contract.test.ts` | 同上 |
| `apps/api/tests/wiki/public-data.contract.test.ts` | 同上 |
| `apps/api/tests/wiki/wire-contract-conformance.test.ts` | 同上（`schema.parse` 与 raw JSON 等值断言未动） |
| `apps/api/tests/wiki/bilibili.contract.test.ts` | 导入；`mock.timers` → `vi.useFakeTimers`/`vi.advanceTimersByTime` |
| `apps/api/tests/wiki/node-cleanup-compensation.contract.test.ts` | 导入（默认导入 → 具名导入）；`t.after` → `onTestFinished` |
| `apps/api/tests/wiki/security-crud.contract.test.ts` | 导入；2 处 `t.mock.method` → `vi.spyOn(...).mockImplementation(...)`，配套的调用计数/实参断言改写 |
| `apps/api/tests/wiki/README.md` | 该文件中记录的旧 `node --import tsx --test` 命令同样命中 grep 门禁，改为 `pnpm --filter @imsweb/api run test:wiki` |
| `apps/api/package.json` | `test:wiki` 同名替换（仅此一条脚本） |

未改动：`fixture.ts`（runner 中立，不 import 任何 runner）、`tsconfig.json`、`apps/api/vitest.config.mts`、其他任何脚本。

### 计数对照

| 指标 | 迁移前（`node --test`） | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- |
| files | 7 | 7（`Test Files 7 passed`） | 0 |
| tests | 60 | 60 | 0 |
| suites | 14 | —（Vitest 不打印 suite 计数） | 不适用 |
| pass | 60 | 60 | 0 |
| fail | 0 | 0 | 0 |
| skipped | 0 | 0 | 0 |
| todo | 0 | 0 | 0 |

没有新增/合并/改名/删除任何用例；没有新增 skip。

### 执行的命令与结果

```sh
# 1. 迁移前基线（node --test，起点 88934a1d）
pnpm --filter @imsweb/api run test:wiki
# → tests 60 / suites 14 / pass 60 / fail 0 / cancelled 0 / skipped 0 / todo 0

# 2. 迁移后
pnpm --filter @imsweb/api run test:wiki
# → Test Files  7 passed (7) / Tests  60 passed (60) / Duration 1.94s，随后复跑 1.64s

# 3. 类型门禁
pnpm --filter @imsweb/api run typecheck
# → tsc -p tsconfig.server.json --noEmit 退出码 0

# 4. wiki 与 package.json 的 runner 残留
grep -rn "node:test\|--import tsx\|TSX_TSCONFIG_PATH" apps/api/tests/wiki apps/api/package.json
# → tests/wiki 0 命中；package.json 命中 17 行，全部属于本批范围外的脚本
#   （migration:* 14 行 + wiki:metadata:audit 1 行 + test:server + test:migration）
grep -rn "node:test" apps/api/tests/wiki apps/api/package.json
# → 0 命中（退出码 1）

# 5. 治理
node scripts/check-workspace-boundaries.mjs
# → Workspace boundary check passed... 退出码 0
python3 -m unittest tests.test_workspace_boundaries -v
# → Ran 26 tests ... OK（api script 计数仍为 43，root 57 / web 21 不变）
```

`apps/api/package.json` 的 script 数量：迁移前后均为 **43**（`json.load` 计数确认）。

### 与计划的偏差 / 计划未覆盖的细节

逐类映射表里只有四条在本目录命中，另外几条**不适用**，据实说明而不是替换成别的断言：

- `t.skip(reason)`、`t.diagnostic`、`t.test` 子测试、`t.mock.fn`、套件级 `t.before`/`t.after`、`nodeTest` 别名：`tests/wiki` 里 **0 处**，因此没有对应改写。
- 断言语汇：`node:assert/strict` 全部原样保留，包括导入行。本批没有把任何 assert 换成 `expect`。

必须偏离机械映射的三处，均为「runner 语义差」而非断言强度差：

1. **`t.mock.method(console, 'error', impl)`** → `vi.spyOn(console, 'error').mockImplementation(() => undefined)`，但 Vitest 4.1.11 的 `MockInstance` **没有 `callCount()`，也没有 `calls[i].arguments`**（已核对 `node_modules/.pnpm/@vitest+spy@4.1.11/.../index.d.ts`：`mock.calls` 是实参数组数组）。因此同一处断言按 Vitest 形状改写：`logged.mock.callCount()` → `logged.mock.calls.length`，`logged.mock.calls[0]?.arguments[0]` → `logged.mock.calls[0]?.[0]`。计数与匹配正则原样保留（`=== 1`、`/committed Wiki object/`）。
2. **`t.mock.timers.enable({ apis: ['setTimeout'] })`** → `vi.useFakeTimers({ toFake: ['setTimeout'] })`。Vitest 4.1.11 的 `vi.useFakeTimers()` 默认 fake 除 `nextTick`/`queueMicrotask` 外的全部方法（含 `Date`），与 `apis: ['setTimeout']` 不等价；显式收窄以免把 `Date.now()` 变成 0 而改变 JWT 过期判定。`context.mock.timers.tick(n)` → `vi.advanceTimersByTime(n)`。
3. **测试内自动还原 mock 与 timer**：node:test 在每个用例结束后自动 restore。Vitest 配置没有开 `restoreMocks`/`mockReset`（该文件本批不允许改动），且 `vi.spyOn` 对被 mock 过的函数会**返回同一个实例**（已核对 `@vitest/spy` 的 `internalSpyOn` 在 `isMockFunction(originalImplementation)` 时直接 `return originalImplementation`）。若不补还原，第二个用例的 `logged.mock.calls.length` 会累计成 2，断言会假红。因此按 node:test 的自动还原语义补了两处显式还原：`onTestFinished(() => logged.mockRestore())`、`onTestFinished(() => { vi.useRealTimers(); })`。这是补回被迁移掉的 runner 语义，不是新增断言。

一次中间失败并已修正（非计划偏差，记录以便复核）：`onTestFinished(() => vi.useRealTimers())` 触发 `TS2322: Type 'VitestUtils' is not assignable to type 'Awaitable<void>'`，改成块体语句后 `tsc -p tests/wiki/tsconfig.json --noEmit` 通过。

### 未验证 / 遗留

- 未跑 `apps/api/tests/server`、`tests/migration`、`tests/assets`、顶层 5 个文件与 `run-test-owner.mjs`（不在本批范围）。因此 `pnpm --filter @imsweb/api run test:server` 等在本批之后仍走 `node --test`，属预期。
- `apps/api/package.json` 仍保留 `test:node` 的 `run-test-owner.mjs api node` 形态，未改。
- 迁移后未重跑 delivery integration（`pnpm run test:web-routing`）：本批只改测试文件与 wiki 脚本，不触及打包产物，留到子任务收口。

## 批次 A：tests/server（非 PostgreSQL 侧）

范围：`apps/api/tests/server/*.test.ts` 中**不**导入 PostgreSQL 适配器的 68 个文件（该目录共 102 个 `.test.ts`，其余 34 个导入 `./postgres-test-database` 或 `../integration/postgres-harness`，由并行 agent 在同一批次内负责）。外加一个跨 runner 共享 helper `apps/api/tests/integration/migration-catalog.ts`。
分支 `chore/vitest-test-unification`，起点 `841830bd`。本侧无任何 PostgreSQL 用法，因此全部命令都不需要 `IMS_TEST_POSTGRES_ENABLED`，也没有 PG 启用/禁用两条路径可跑。

### 改动文件

共 69 个文件，`+127 / -121`。

| 分组 | 文件数 | 改动 |
| --- | --- | --- |
| 仅改导入 | 60 | `node:test` → `vitest`；默认导入 `import test from 'node:test'` 一律改写为具名导入 `import { test } from 'vitest'`，引号风格保持原样（`'` 与 `"` 各自保留）。`{ describe, test }`（2 个文件：`client-address`、`platform-profile-wire-contract-conformance`）与 `{ afterEach, test }`（`live-schedule`）只换模块名 |
| `t.after` → `onTestFinished` | 6 | `idempotency-fencing`(1)、`local-upload-sync`(1)、`node-email-delivery-runner`(5)、`object-cleanup-lifecycle`(1)、`request-observability`(1)、`runtime-adapters`(5)，共 14 处 |
| `t.mock.method` → `vi.spyOn` | 1 | `chronicle-idempotency.contract`（3 处） |
| `t.test` 子测试 → `describe` 嵌套 | 1 | `node-email-delivery-runner`（1 处） |
| 去掉不再使用的 `TestContext` 形参 | 8 | `chronicle-idempotency.contract`(3)、`idempotency-fencing`(1)、`local-upload-sync`(4，含 helper `fixture`)、`migration-catalog`(2)、`node-email-delivery-runner`(6)、`object-cleanup-lifecycle`(1)、`request-observability`(1)、`runtime-adapters`(5) |
| 跨 runner 共享 helper 中性化 | 1 | `tests/integration/migration-catalog.ts`（见「偏差」第 3 条） |

未改动：`tests/server/postgres-test-database.ts`、`tests/integration/postgres-harness.ts`（并行 agent 的适配器）、`apps/api/package.json`（`test:server` 由主会话替换）、`apps/api/vitest.config.mts`、`apps/api/tests/wiki`、`apps/api/tests/assets`、顶层 `apps/api/tests/*.test.*`、`tests/postgres-test-lifecycle.js`。断言语汇全部保持 `node:assert/strict`，**本批没有把任何 `assert` 换成 `expect`**。

### 计数对照

| 指标 | 迁移前（`node --import tsx --test`） | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- |
| files | 68 | 68（`Test Files 68 passed (68)`） | 0 |
| tests | 437 | 436 | **-1** |
| pass | 437 | 436 | -1 |
| fail | 0 | 0 | 0 |
| skipped | 0 | 0 | 0 |
| todo | 0 | 0 | 0 |
| suites | 2 | —（Vitest 不打印 suite 计数） | 不适用 |
| duration | 5342 ms | 5850–6360 ms | 同量级 |

逐文件对照（68 行）只在一行上不同，其余 67 行 file/test/pass/fail/skip 完全一致：

| 文件 | 前 | 后 |
| --- | --- | --- |
| `tests/server/node-email-delivery-runner.test.ts` | 15 / 15 / 0 / 0 | 14 / 14 / 0 / 0 |

差异原因见「偏差」第 1 条：该文件唯一的 `t.test` 父用例变成 `describe`，Vitest 不计 suite。

静态一致性核对（对 68 个文件逐个比对 `HEAD` 与工作区）：

- 测试/套件名字面量：**0 个文件有差异**（`test(` / `describe(` / `it(` 的字面量集合前后完全相同）。
- `assert.` 出现次数：迁移前 2308，迁移后 2308。
- `test(` 声明数：423 → 423；`describe(` 声明数：2 → 3（唯一新增的一处即偏差第 1 条）。

### 执行的命令与结果

```sh
# 1. 迁移前基线（起点 841830bd，逐个文件与整体各跑一次，用于交叉核对）
cd apps/api && TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test <68 files>
# → tests 437 / suites 2 / pass 437 / fail 0 / cancelled 0 / skipped 0 / todo 0 / duration_ms 5342.448125
#   逐文件跑得的合计：files=68 tests=437 pass=437 fail=0 skip=0（无任何文件带 skip）

# 2. 迁移后
cd <worktree> && pnpm --filter @imsweb/api exec vitest run <68 files>
# → Test Files  68 passed (68) / Tests  436 passed (436) / Duration 5.85s（复跑 6.36s），退出码 0

# 3. 逐文件计数取证（同一次运行，json reporter，输出到 /tmp，不落进工作区）
cd <worktree> && pnpm --filter @imsweb/api exec vitest run --reporter=json --outputFile=/tmp/vitest-after.json <68 files>
# → files=68 tests=436 pass=436 fail=0 skip=0；与基线逐文件比对仅有 node-email-delivery-runner 一行不同

# 4. 类型门禁（覆盖整个 tests/server，含并行 agent 的在改文件）
cd <worktree> && pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit
# → 退出码 0

# 5. 治理
cd <worktree> && node scripts/check-workspace-boundaries.mjs
# → Workspace boundary check passed: root orchestrator, API, web, data, and deployment surfaces are isolated（退出码 0）

# 6. 残留检查
grep -rn "node:test\|require('vitest')\|t\.after\|t\.mock\|t\.diagnostic\|nodeTest" <68 files>
# → 0 命中（唯一字面命中的 `t.test` 是 fudaba-owner-routes.test.ts 第 308 行注释里的文件名，不是 API 调用）
```

### 与计划的偏差 / 计划未覆盖的细节

逐类映射表里本目录实际命中的只有四条，另外几条**不适用**，据实说明而不是替换成别的写法：

- `t.before`/`t.after`（套件级）、`t.skip(reason)`、`t.diagnostic`、`t.mock.fn`、`mock.timers`、`nodeTest` 别名：本目录 68 个文件里 **0 处**，因此没有对应改写。
- 本批也不涉及 `.js` 测试文件 ESM 化（`tests/server` 下只有 3 个 `.ts` helper 与 1 个 `tsconfig.json`，无 `.test.js`）。

必须偏离机械映射的三处：

1. **`t.test` 子测试 → `describe` 嵌套，聚合计数 -1。** `node-email-delivery-runner.test.ts` 的 `email delivery runner cancels a claim when lease renewal is lost` 是 node:test 的「父用例 + 3 个子用例」形状（`await t.test(entry.name, ...)` 在 `for` 循环里）。Vitest 没有「自身计数、又拥有子用例」的 test 节点，只能把父用例降为 `describe`、把 3 个 case 提升为同级 `test`。因此该文件 15 → 14。**没有丢弃任何用例**：3 个 case 名（`false result` / `rejection` / `timeout`）与 3 段 case body 逐字保留，父用例名成为 suite 名，verbose reporter 仍按 `父名 > 子名` 前缀显示失败定位（已用 `--reporter=verbose` 核对三条都真实执行）。vitest 的 `describe` 回调在收集期执行，`cases` 数组留在回调内、`for` 循环改为收集期注册，`entry` 的闭包绑定由 `for...of` 的每次迭代块作用域保证。
2. **`t.mock.method` → `vi.spyOn`，并按 node:test 的自动还原语义补回显式还原。** `chronicle-idempotency.contract.test.ts` 的 3 处 `t.mock.method(console, 'error', () => undefined)` 改为 `vi.spyOn(console, 'error').mockImplementation(() => undefined)`，紧随其后 `onTestFinished(() => logged.mockRestore())`。理由是 Vitest 配置没有开 `restoreMocks`，且 `vi.spyOn` 对被 mock 过的函数会返回同一实例，不还原会让下一个用例的计数累计（该文件第 2 处断言 `=== 0` 就会假红；第 1 处断言 `=== 1` 也会被第 3 处污染）。计数与实参断言按 Vitest 形状等价改写：`logged.mock.callCount()` → `logged.mock.calls.length`（3 处），`logged.mock.calls[0]?.arguments[0]` → `logged.mock.calls[0]?.[0]`（1 处）；断言的字面量（`1`、`0`、`cases.length`、`'Chronicle upload failed'`）一个未动。
3. **跨 runner 共享 helper `tests/integration/migration-catalog.ts` 被中性化（本批唯一的共享面改动）。** 该 helper 有 5 个 consumer：4 个是并行 agent 的 PG 文件（`fudaba-agency-migration`、`namecard-ownership-migration`、`namecard-reaction-reconciliation-migration`、`namecard-unification-migration`），1 个是本批的 `migration-catalog.test.ts`。原签名是 `createMigrationCatalogBefore(t: TestContext /* node:test */, boundary)`，在 Vitest 侧直接报 `TS2345: Argument of type 'TestContext & object' is not assignable to parameter of type 'TestContext'`（vitest 的 TestContext 没有 `after`），运行期则抛 `TypeError: t.after is not a function`。共享模块不能静态 import 任何 runner（否则另一侧在加载期就报错），因此按设计里「runner 归属方各自注册清理」的形状改为 `createMigrationCatalogBefore(registerCleanup: (cleanup: () => void | Promise<void>) => void, boundary)`，`t.after(...)` → `registerCleanup(...)`；node:test 侧传 `t.after`，Vitest 侧传 `onTestFinished`。**重要**：4 个 PG 调用点在本批开始前**已经被并行 agent 改成了 `createMigrationCatalogBefore(onTestFinished, …)`**，即本改动正是他们已假定的共享契约；我这边只把 helper 本体对齐。若并行 agent 也编辑了同一文件，需要主会话核对一次是否重复。本批自己的调用点同步改为 `createMigrationCatalogBefore(onTestFinished, BOUNDARY)`。
4. **去掉因迁移而失去最后用途的 `TestContext` 形参。** 8 个文件共 23 处：22 个用例回调的 `async (t) =>` 改成 `async () =>`，外加 `local-upload-sync` 的 helper `async function fixture(t: TestContext)` 改成 `async function fixture()`（`migration-catalog.test.ts` 另有 2 处调用点实参由 `t` 换成 `onTestFinished`，不算形参）。这些参数在 node:test 下只服务于 `t.after`/`t.mock`，迁移后已无用途；`tsconfig` 未开 `noUnusedParameters`，去掉是为了不留误导性残留。`local-upload-sync` 的 `import { test, type TestContext } from 'node:test'` 随之变成 `import { onTestFinished, test } from 'vitest'`，`TestContext` 类型引用彻底消失。`onTestFinished` 在 helper 内注册是否生效已由实测确认：Vitest 的 `getCurrentTest()` 是模块级当前用例指针（非 AsyncLocalStorage），`sequence.concurrent` 默认为假，同一用例内跨 `await` 调用 helper 仍归到当前用例（`migration-catalog.test.ts` 的两条用例共用同一 helper 且互不干扰，即为证据）。

### 未验证 / 遗留

- **未跑 PG 两条路径**：`IMS_TEST_POSTGRES_ENABLED=false` 与启用态都不适用——本侧 68 个文件不导入任何 PG 适配器，`grep -l "postgres-test-database\|integration/postgres-harness"` 在本侧为 0 命中。批次 A 的 PG 计数证据由并行 agent 提供。
- **未跑 `pnpm --filter @imsweb/api run test:server`**：该脚本本批仍是 `node --test tests/server/*.test.ts`，并行 agent 的 34 个文件已含 `import ... from 'vitest'`，此时整目录是混合 runner，跑它只会得到「node:test 加载期失败」的结果，不构成有效证据。这一步留到两半都落地后由主会话执行。
- **类型门禁是移动靶**：`tsc -p tests/server/tsconfig.json --noEmit` 覆盖整个目录（含并行 agent 的在改文件）。本会话中途它曾单独报 `tests/server/postgres-test-database.ts(28,61): error TS2304: Cannot find name 'DISABLED_REASON'`——该文件不属于我的 68 个文件，**我没有编辑它**；随后该错误随对方继续编辑自行消失，最终一次运行退出码 0。请以主会话在提交前的完整 `typecheck` 为准。
- **`suites` 计数无可比对象**：Vitest 不打印 suite 数，node 的 `suites 2` 无法对照。
- 未跑 `pnpm run test:web-routing`（delivery integration）与 `apps/api/tests/wiki`、`tests/migration`、`tests/assets`、顶层 5 个文件（均不在本批范围）。
- `apps/api/package.json` 的 `test:server` 改名、`run-test-owner.mjs` 的 API plan、`tsconfig.tests.json` 都不在本批，属批次 F。

## 批次 A：tests/server（PostgreSQL 侧）

范围：`apps/api/tests/server` 中导入 `./postgres-test-database` 或 `../integration/postgres-harness` 的 **34 个文件**（17 个从 harness 取 `postgresTest`、17 个从适配器取），加两个适配器模块，加 4 个 `tests/migration` 文件的 allocator 收尾注册。同一目录另外 68 个文件（无 PG）由并行 agent 迁移，见上一节。分支 `chore/vitest-test-unification`。

### 改动文件

34 个测试文件（按 `postgresTest` 来源分两组，逐文件已核对）：

| 从 `../integration/postgres-harness` 取 `postgresTest`（17） | 从 `./postgres-test-database` 取（17） |
| --- | --- |
| `fudaba-agency-migration` | `homepage-links` |
| `fudaba-card-placement-repository` | `admin-accounts.contract` |
| `fudaba-domain-repository` | `object-deletion-worker-fencing` |
| `fudaba-location-repository` | `site-package-routes` |
| `fudaba-office-management-repository` | `core-runtime-contract` |
| `fudaba-owner-write-repository` | `namecard-metadata-repository` |
| `fudaba-public-read-repository` | `postgresql-request-controls` |
| `namecard-ownership-migration` | `object-deletion-worker` |
| `namecard-reaction-reconciliation-migration` | `story-repository` |
| `namecard-unification-migration` | `events-pagination` |
| `platform-account-admin-repository` | `platform-email-auth.contract` |
| `platform-account-management-repository` | `platform-oauth-unlink-repository` |
| `platform-email-auth.contract` | `news-pagination` |
| `platform-email-settings` | `fudaba-claim-review-repository` |
| `platform-oauth-provider-settings` | `platform-email-delivery-repository` |
| `platform-oauth-unlink-repository` | `site-package-repository` |
| `platform-session-security.contract` | `auth-refresh.contract`、`s3-object-storage`、`backoffice-auth-boundary.contract` |

其中 `platform-email-settings` 与 `platform-oauth-provider-settings` 只用 harness 的 `createPostgresTestHarness()`，两条 PG 用例走 vitest 的 `test(..., { skip })` 而不是 `postgresTest` 适配器；`platform-session-security.contract` 与 `platform-email-auth.contract` 另导入了 vitest 的 `test as nodeTest` 给纯用例。

其余改动文件：

| 文件 | 改动 |
| --- | --- |
| `tests/server/postgres-test-database.ts` | 变成唯一的 Vitest 适配器：新增 `postgresTest(name, body)` 包装（禁用时 `ctx.skip(postgresIntegrationSkipReason() \|\| DISABLED_REASON)`），`createPostgresTestDatabase(label)` / `connectPostgresTestDatabase(connection)` 去掉 TestContext 形参，清理改用工厂内注册的 `onTestFinished`，新增 `afterAll(closeSharedPostgresTestAllocator)` |
| `tests/integration/postgres-harness.ts` | 中性化：删除 `node:test` 导入、`postgresTest` 导出与模块级 `after(closeSharedPostgresTestAllocator)`；保留 `PostgresTestHarness` / `PostgresTestHarnessOptions` / `createPostgresTestHarness` / `postgresIntegrationEnabled` 与调用方显式 `close()` 语义；不导入任何 runner（grep 已验） |
| `tests/migration/cms-article-title-backfill.test.js` | 新增 `require('../postgres-test-lifecycle.js')` + `test.after(() => closeSharedPostgresTestAllocator())` |
| `tests/migration/fudaba-metadata-import.test.js` | 把 `closeSharedPostgresTestAllocator` 加入已有的 lifecycle 解构 + `test.after(...)` |
| `tests/migration/namecard-unification-reconcile.test.js` | 同上（新增 require + `test.after(...)`） |
| `tests/migration/postgres-migrations.test.js` | 同上（新增 require + `test.after(...)`） |

未改动：`tests/postgres-test-lifecycle.js` 与 `.d.ts`、`apps/api/package.json`、`apps/api/vitest.config.mts`、`tests/wiki`、`tests/assets`、顶层 `tests/*.test.*`、并行 agent 的 68 个文件、`tests/integration/migration-catalog.ts`（下一节由并行 agent 改造，见「偏差」第 1 条）。

### 计数对照

「迁移前」由 HEAD 版本的 `test(`/`nodeTest(` 声明计数取得（190 条声明），与并行 agent 一节的 437 条相加正好等于整目录基线 627；禁用态 23 passed + 167 skipped = 190，与整目录基线 460 passed / 167 skipped 中的 167 完全一致。

| 指标 | 迁移前（node --test） | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- |
| files | 34 | 34（`Test Files 34 passed`） | 0 |
| tests | 190（165 postgresTest + 25 纯 test） | 190 | 0 |
| pass（PG 启用） | 190 | 190 | 0 |
| skipped（PG 启用） | 0 | 0 | 0 |
| pass（PG 禁用） | 23 | 23 | 0 |
| skipped（PG 禁用） | 167 | 167 | 0 |
| fail（两条路径） | 0 | 0 | 0 |

用例名集合逐文件比对：34 个文件的 190 条声明名与 HEAD **完全一致**（无合并、拆分、改名、删除，脚本输出「identical test-name sets (190 declarations)」）。

### 执行的命令与结果

```sh
# 1. PG 启用
pnpm --filter @imsweb/api exec vitest run <34 files>
# → Test Files 34 passed (34) / Tests 190 passed (190) / Duration 20.21s（复跑 19.60s），退出码 0

# 2. PG 禁用
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run <34 files>
# → Test Files 34 passed (34) / Tests 23 passed | 167 skipped (190) / Duration 2.80s，退出码 0

# 2b. 跳过原因取证（单个文件，verbose）
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run tests/server/homepage-links.test.ts --reporter=verbose
# → ↓ [PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false]

# 3. 类型门禁（覆盖整个 tests/server，含并行 agent 的在改文件）
pnpm --filter @imsweb/api exec node node_modules/typescript/bin/tsc -p tests/server/tsconfig.json --noEmit
# → 退出码 0
pnpm --filter @imsweb/api exec node node_modules/typescript/bin/tsc -p tests/server/tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters
# → 本 34 个文件 0 命中（无因迁移产生的死导入/死形参）

# 4. 4 个 migration 文件仍跑 node:test
pnpm --filter @imsweb/api run test:migration
# → tests 114 / suites 0 / pass 114 / fail 0 / cancelled 0 / skipped 0 / todo 0，退出码 0
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:migration
# → tests 114 / pass 99 / fail 0 / skipped 15，退出码 0

# 5. 治理
node scripts/check-workspace-boundaries.mjs
# → Workspace boundary check passed... 退出码 0

# 6. runner 残留
# → 34 个文件 + 两个适配器 0 命中 node:test / require('vitest')（仅注释提到）；
#   harness 不含 vitest 导入，适配器不含 node:test 导入

# 7. 残留数据库
# → 跑完后 pg_database 中 ims_test_% 数量与跑前一致（本批运行不新增；实测见下）
```

### 与计划的偏差 / 计划未覆盖的细节

1. **共享 helper `tests/integration/migration-catalog.ts` 的形状由并行 agent 决定，本侧只对齐调用点。** 并行 agent 已把它改成 `createMigrationCatalogBefore(registerCleanup, boundaryFilename)`，与本侧 4 个调用点的 `createMigrationCatalogBefore(onTestFinished, …)` 恰好一致，因此**没有**像原设计那样把它做成「函数或 `{after}`/`{onTestFinished}` 联合宿主」——不需要，也没有编辑该文件。若主会话发现两侧都改了同一文件，请以工作区现状（`registerCleanup` 形参版）为准并核对一次。
2. **两个只用显式 close 适配器的 Vitest 文件需要各自补 allocator 收尾，这是计划未覆盖的一点。** `platform-oauth-provider-settings.test.ts` 与 `platform-email-settings.test.ts` 用 `createPostgresTestHarness()` 但**不导入** Vitest 适配器，所以拿不到适配器的 `afterAll(closeSharedPostgresTestAllocator)`。实测确实泄漏：跑这两个文件后 `pg_database` 新增两个 `ims_test_template_head_<pid>_*`（只建库的探针，`pg_stat_activity` 无连接）。修法是按「runner 归属方各自注册」在各自文件里加 `import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle.js'` + `afterAll(closeSharedPostgresTestAllocator)`。修后复跑，数量不变（泄漏消失）。同样形状的 `createPostgresTestHarness` consumer 只剩 4 个 `tests/migration` 文件，它们已在中性化 harness 的同一批里补了 node:test 的 `test.after(...)`。
3. **`skip` 选项从 postgresTest 调用点整体移除，每条用例的自定义 skip 文案被共享 reason 取代。** 7 个文件共 11 处 `test(name, { skip: !postgresIntegrationEnabled() && 'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database' }, body)` 改为 `test(name, async () => {…})`，跳过由适配器 `ctx.skip(postgresIntegrationSkipReason() || DISABLED_REASON)` 决定。**跳过条数不变**，但逐条的文案从「set IMS_TEST_POSTGRES_ADMIN_URL …」变为共享的 `PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false`——这是适配器契约要求的行为，不是断言降级；没有测试断言该文案。
4. **`platform-oauth-provider-settings` / `platform-email-settings` 的纯 node:test `test` 保留 `{ skip: boolean }` 选项**（不能改走适配器，否则 PG 禁用时它们的纯用例会被一起跳过）。原来 `skip: !postgresIntegrationEnabled() && '文案'` 产生的是 `false | string`，而 Vitest 4.1.11 的 `TestOptions.skip` 只接受 `boolean`，因此去掉 `&& '文案'` 保留布尔值。禁用态下这两个文件其余用例照常运行（`23 passed` 的来源）。
5. **`nodeTest` 别名在 2 个文件里保留。** `platform-session-security.contract` 与 `platform-email-auth.contract` 里 `test` 已经是适配器 `postgresTest` 的别名，纯用例用 `nodeTest`；把 `nodeTest` 改名为 `test` 会让两套语义对调（要顺带改 9 / 17 个调用点），风险高于收益，因此保留 `import { onTestFinished, test as nodeTest } from "vitest"`。
6. **`t.mock` 唯一一处按 Vitest 形状改写。** `backoffice-auth-boundary.contract`：`t.mock.method(console, 'warn', () => undefined)` → `vi.spyOn(console, 'warn').mockImplementation(() => undefined)`，并补 `onTestFinished(() => logged.mockRestore())`（Vitest 配置未开 `restoreMocks`，`vi.spyOn` 对被 mock 过的函数返回同一实例，不还原会污染后续用例）；实参断言 `call.arguments[0]` → `call[0]`。7 条期望事件的断言原样保留。
7. **`t.after` / `t.before` 之外的映射在本目录不适用。** 34 个文件里 0 处 `t.skip`、`t.diagnostic`、`t.test` 子测试、`t.mock.fn`、`t.mock.timers`、`nodeTest` 之外别名、套件级 `t.before`/`t.after`。共 50 处 `t.after(...)` 全部改写为 `onTestFinished(...)`，注册顺序与相对位置保持不变。
8. **TestContext 形参移除 17 处、用例回调 `async (t) =>` 改 `async () =>` 共 61 处**，包括 `platform-email-delivery-repository` 的跨行实参 `useDatabase(
 t,
 'label',
)` → 去掉整行 `t,`，以及 `fudaba-agency-migration` 的跨行形参 `createLegacyHarness(
 t: TestContext
)` → `createLegacyHarness()`。
9. **因 `skip` 选项移除而变死的 `postgresIntegrationEnabled` 导入在 9 个文件里删除**（`fudaba-agency-migration`、`fudaba-domain-repository`、`fudaba-office-management-repository`、`fudaba-card-placement-repository`、`fudaba-owner-write-repository`、`fudaba-public-read-repository`、`fudaba-location-repository`、`platform-session-security.contract`、`platform-email-auth.contract`），避免留误导性残留。
10. **`DISABLED_REASON` 从 lifecycle 核心导入**（`module.exports` 已导出，`.d.ts` 也有声明），适配器写成 `postgresIntegrationSkipReason() || DISABLED_REASON`，与任务给定形状一致。

### 未验证 / 遗留

- **未跑 `pnpm --filter @imsweb/api run test:server`**：本批期间该脚本仍是 `node --test tests/server/*.test.ts`，整目录含 `import 'vitest'` 文件即为混合 runner，跑它只能得到加载期失败，不构成有效证据。脚本替换在批次 F，由主会话收口时跑。
- **`tsc -p tests/server/tsconfig.json` 是移动靶**：它覆盖并行 agent 的在改文件。本会话中途它曾单独报 `tests/server/postgres-test-database.ts: Cannot find name 'DISABLED_REASON'`（我编辑中途的真实中间态，随后补齐 import 即消失），最终两次运行均为退出码 0。请以主会话提交前的完整 `typecheck` 为准。
- **`pg_database` 残留未清零**：跑完后仍有 17 个 `ims_test_*`（`template_head`/`node_security`/个别 label 模板），是本次会话之前的历史运行遗留；我另行清理了 6 个可归因于本次实测的库（`…_19926_*`、`…_19936_*`、`…_36922_*`、`…_36923_*`），本批命令本身在配了 `afterAll`/`test.after` 之后不再新增残留（已用「跑前 / 跑后数量一致」验证）。未清理那 17 个是为了不干扰并行 agent；spec 的「全部 project test prefix 为空」不变量需要主会话在收口时统一清一次。
- **`.trellis/spec/api/backend/testing.md` 的 Signatures / Contracts 未改**：属批次 F 收口（需要把 `postgresTest(name, body)`、去 TestContext 的工厂签名与「禁用即 `ctx.skip(共享 reason)`」写进去）。
- 未跑 `pnpm run test:web-routing`（delivery integration）、`tests/wiki`、`tests/assets`、顶层 5 个文件（均不在本批范围）。

### 过程记录（非产品变更，供主会话核对）

- 本 agent 的 file-edit 工具以**会话 cwd**（主检出 `/Users/texas/Workspace/IMSWeb`）解析相对路径，初期 3 个文件（`events-pagination`、`news-pagination`、`platform-email-delivery-repository`）曾被误改在主检出。发现后用 `git show HEAD:<path> > <path>` 逐个还原（未用 `git checkout`/`git reset`/`git stash`），主检出 `git status` 已无这些文件的改动，本次会话未在主检出留下任何修改。此后所有编辑均使用 worktree 绝对路径。
