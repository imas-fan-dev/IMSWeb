# 根契约与治理套件迁移：验证记录

本文件按批次追加。每条记录给出改动文件、执行的精确命令、迁移前后的 file/test/skip 数字，以及与计划的偏差。

## 批次 F：根契约与治理套件迁移（`09-19-vitest-root-suite`）

范围：把 `tests/` 与 `scripts/**/tests/` 下由 Node test runner 承载的 9 个用例文件迁移到 Vitest，并把 `run-test-owner.mjs` 的 `governancePlan()` / `contractsPlan()` / `deliveryPlan()` 三个 Node 段换成一次显式 Vitest 调用。Python `unittest` 段、Playwright、owner 分派与治理断言不动。

分支 `chore/vitest-test-unification`，起点 `e68e25b6`。工作目录：`/Users/texas/Workspace/IMSWeb/.worktrees/vitest-test-unification`。原始日志：`research/baseline-root.log`（迁移前）、`research/after-root.log`（迁移后）。

### 改动文件

| 文件 | 改动 |
| --- | --- |
| `scripts/testing/run-test-owner.mjs` | 新增 `repositoryVitestConfig` 常量与 `repositoryVitestCommand(label, files)` 局部 helper；`governancePlan()` / `contractsPlan()` / `deliveryPlan("root"\|"repository"\|"app")` 的 Node 段由 `node --experimental-strip-types --test <files…>` 改为 `pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts <files…>`，cwd 改为 `apiRoot`。Python 段、`web` / `integration` profile、`apiPlan()` / `webPlan()` / `rootPlan()` 未动 |
| `scripts/testing/tests/run-test-owner.test.mjs` | 迁移到 Vitest（`import { test } from "vitest"`）；`scripts()` 改为按 `args[0] === "--filter" && args[2] === "run"` 识别 workspace 脚本；plan 断言就地重写并新增 repository Vitest 形状与 Python 段断言 |
| `tests/development-environment.test.js` | CJS→ESM：`require` → `import`，`node:test` → `vitest`；20 个用例、断言与用例名不变 |
| `tests/ci-affected-workspaces.test.js` | 同上；`t.test` 子测试改为一用例一 `test`，wrapper 保留为计数用例；新增 `classify()` 局部 helper；28 个用例、断言与用例名不变 |
| `tests/contracts/non-json-boundaries.test.mjs` | 仅 import 行：`import test from "node:test"` → `import { test } from "vitest"` |
| `scripts/contracts/tests/compile-route-inventory.test.mjs` | 同上；两处 `t.test` 子测试改为一用例一 `test`，wrapper 保留为计数用例；各提取一个断言 helper；19 个用例、断言与用例名不变 |
| `scripts/contracts/tests/compile-frontend-route-metadata.test.mjs` | 仅 import 行替换；6 个用例不变 |
| `tests/exchange-map-assets.test.js` | CJS→ESM；`require(publicationScriptPath)` → 静态 `import * as publication from "../../apps/api/scripts/operations/publish-openmap.js"`，删除失去用途的 `publicationScriptPath`；6 个用例不变 |
| `tests/tauri-build-configuration.test.js` | CJS→ESM，无其他改动；11 个用例不变 |
| `tests/tauri-device-delivery.test.js` | CJS→ESM，无其他改动；10 个用例不变 |

未改动：全部 `tests/test_*.py`、Playwright、`apps/api/vitest.config.mts`、`scripts/testing/vitest/vitest.repository.config.mts`、根 `package.json`（未新增 vitest 依赖，未新增 alias）、`governanceNodeTests` 的显式清单内容（只换 runner）。

### 迁移前基线（`node --test`，逐文件）

```sh
cd /Users/texas/Workspace/IMSWeb/.worktrees/vitest-test-unification
node --test tests/development-environment.test.js tests/ci-affected-workspaces.test.js \
  tests/exchange-map-assets.test.js tests/tauri-build-configuration.test.js tests/tauri-device-delivery.test.js
# → tests 75 / pass 75 / fail 0 / skipped 0
node --test tests/contracts/non-json-boundaries.test.mjs               # tests 4
node --test scripts/contracts/tests/compile-route-inventory.test.mjs   # tests 19
node --test scripts/contracts/tests/compile-frontend-route-metadata.test.mjs  # tests 6
node --test scripts/testing/tests/run-test-owner.test.mjs              # tests 11
```

| 执行域 | 文件 | 迁移前（node:test） | 迁移后（Vitest） | 差异 |
| --- | --- | --- | --- | --- |
| governance Node | `tests/development-environment.test.js` | 20 | 20 | 0 |
| governance Node | `tests/ci-affected-workspaces.test.js` | 28 | 28 | 0 |
| governance Node | `scripts/testing/tests/run-test-owner.test.mjs` | 11 | 11 | 0 |
| governance Node 小计 | 3 files | **59** | **59** | 0 |
| governance Python | 9 × `tests/test_*.py` | Ran 123 / OK（150.35s） | Ran 123 / OK（143.41s） | 0 |
| contracts | `tests/contracts/non-json-boundaries.test.mjs` | 4 | 4 | 0 |
| contracts | `scripts/contracts/tests/compile-route-inventory.test.mjs` | 19 | 19 | 0 |
| contracts | `scripts/contracts/tests/compile-frontend-route-metadata.test.mjs` | 6 | 6 | 0 |
| contracts 小计 | 3 files | **29** | **29** | 0 |
| delivery root | `tests/exchange-map-assets.test.js` | 6 | 6 | 0 |
| delivery root | `tests/tauri-build-configuration.test.js` | 11 | 11 | 0 |
| delivery root | `tests/tauri-device-delivery.test.js` | 10 | 10 | 0 |
| delivery root Node 小计 | 3 files | **27** | **27** | 0 |
| delivery root Python | `tests/test_public_assets.py` | Ran 2 / OK | Ran 2 / OK | 0 |
| delivery repository | `tests/exchange-map-assets.test.js` | **6** | **6** | 0 |
| delivery app | `tests/tauri-build-configuration.test.js` + `tests/tauri-device-delivery.test.js` | **21** | **21** | 0 |

迁移前各域 `skipped` 均为 0；迁移后同样为 0（`run-test-owner.test.mjs` 的两条 `{ skip: process.platform === "win32" }` 在 darwin 上照常执行，与迁移前一致）。

### 自举顺序证据（父任务 design §3 要求的第 2 步）

严格按顺序执行，中间态未被跳过：

1. **先改 `run-test-owner.mjs` 的三个计划函数**（Node 段换 Vitest、cwd 换 `apiRoot`），此时 `scripts/testing/tests/run-test-owner.test.mjs` 仍是 node:test 文件、断言未改。
2. **用现状 runner 跑一次，记录失败点**：

   ```sh
   node --test scripts/testing/tests/run-test-owner.test.mjs
   # → tests 11 / pass 10 / fail 1 / skipped 0，退出码 1
   ```

   唯一失败的是 `the root plan builds API once before its prepared API test group`，失败在 `run-test-owner.test.mjs:97` 的 `deepStrictEqual`：

   ```text
   actual:   [ 'scripts/testing/tests/run-test-owner.test.mjs',
               'scripts/contracts/tests/compile-frontend-route-metadata.test.mjs',
               'tests/tauri-device-delivery.test.js',
               'build', 'test:assets', 'syntax', 'check:architecture' ]
   expected: [ 'build', 'test:assets', 'syntax', 'check:architecture' ]
   ```

   根因：新的 repository 段是 `pnpm --filter @imsweb/api exec vitest …`，旧 `scripts()` helper 的「`executable === "pnpm"` 且 `args[0] !== "exec"`」启发式把这三个步骤当成 workspace 脚本收进去了，末尾参数是测试文件而不是 script 名。其余 10 条用例在旧 runner 下仍通过。

3. **就地重写断言（强度不降）**：
   - `scripts()` 改为按 `executable === "pnpm" && args[0] === "--filter" && args[2] === "run"` 识别 `pnpm --filter <workspace> run <script>`，`exec` 形态的 Vitest 步骤只由形状断言负责。
   - 新增 `repositoryVitestCommand` 常量、`isRepositoryVitestStep()` / `repositoryVitestSteps()`，在 `governance, contracts, and delivery keep disjoint source lists` 内对三个计划逐条断言：恰好 1 条 repository Vitest 步骤、`executable === "pnpm"`、`cwd === <repo>/apps/api`、`args` 与写死的「前缀 + 该计划显式文件清单」深等、`args` 不含 `--test`、计划内 `executable === "node"` 的步骤数为 0；并新增 governance Python 段与 delivery root Python 段的 `args` 深等与位置（index 1）断言。
   - `the root plan builds API once before its prepared API test group` 补一条 `repositoryVitestSteps(plan).length === 3`；`apiBuildIndex < apiSuiteIndex`、`apiSuiteSteps(plan).length === 1`、plan/step/args 三层冻结性断言保留。
   - 该文件本身迁到 Vitest；11 条用例名全部保留，无删用例，断言数由 38 增至 49。
4. **再跑一次**（Vitest）：`Tests 11 passed (11)`，退出码 0。

### 执行的命令与结果

```sh
cd /Users/texas/Workspace/IMSWeb/.worktrees/vitest-test-unification

# 1. owner 端到端（迁移后）
node scripts/testing/run-test-owner.mjs governance
# → [governance Node contracts] Test Files 3 passed / Tests 59 passed
# → [governance Python contracts] Ran 123 tests / OK，退出码 0
node scripts/testing/run-test-owner.mjs contracts
# → Test Files 3 passed / Tests 29 passed，退出码 0
node scripts/testing/run-test-owner.mjs delivery root
# → [root delivery contracts] Test Files 3 passed / Tests 27 passed
# → [Web public asset contracts] Ran 2 tests / OK，退出码 0
node scripts/testing/run-test-owner.mjs delivery repository
# → Test Files 1 passed / Tests 6 passed，退出码 0
node scripts/testing/run-test-owner.mjs delivery app
# → Test Files 2 passed / Tests 21 passed，退出码 0

# 2. Python 侧（零改动）
python3 -m unittest tests.test_operations_docs tests.test_workspace_boundaries \
  tests.test_agent_rules tests.test_source_rules -v
# → Ran 67 tests / OK，退出码 0
#   tests/test_operations_docs.py 断言的仍是外层 "node scripts/testing/run-test-owner.mjs governance"，
#   tests/test_workspace_boundaries.py 的 57/43/21 script 计数均未变，故两个文件都零改动。

# 3. 残留引用
grep -rn "node --test\|--experimental-strip-types" tests scripts/testing tests/contracts
# → tests/test_source_rules.py:64:  "--experimental-strip-types",   （唯一命中）
#   + tests/__pycache__/test_source_rules.cpython-314.pyc（生成物）
#   该行是 Python 用例在 fixture 目录里直接执行仓库 CLI
#   `node --experimental-strip-types scripts/contracts/compile-frontend-route-metadata.mjs --write`，
#   属于 Python 段的子进程调用，不在本次 runner 迁移范围内，保持原样。

# 4. 治理与边界
pnpm run check:rules
# → Agent rules / Source rules（895 files）/ Contracts entrypoint（30）/ route inventory（244 mounts, 323 carriers, 658 responses）
#   / Documentation rules（25 Markdown）全部通过，退出码 0
pnpm run check:boundaries
# → Workspace boundary check passed，退出码 0

# 5. 断言数量机械核对（`git show HEAD:<file>` vs 工作区，`grep -c "assert\."`）
#    dev-environment 146→146、exchange-map 29→29、tauri-build 153→153、tauri-device 101→101、
#    non-json-boundaries 20→20、compile-route-inventory 50→50、compile-frontend-route-metadata 13→13、
#    ci-affected 21→22（wrapper 聚合断言 +1）、run-test-owner 38→49（形状断言扩充）
```

### 偏差

1. **`t.test` 子测试的 Vitest 映射**：Vitest 没有子测试。node:test 里 wrapper 本身计一个用例，所以 `t.test` 直接展平会少 1 个用例（`ci-affected-workspaces.test.js` 28→27，`compile-route-inventory.test.mjs` 19→17）。为满足「计数不变」，wrapper 保留为**真实的 `test`**（body 仍折叠同一批用例并断言），每个 case 再各注册一个 `test`；断言文本经局部 helper（`classify()` / `assertLinkageMutationIsStale()` / `assertResponseChangeIsStale()`）收敛，不重复写。代价是 wrapper 会把同一批纯函数/CLI fixture 再执行一遍（`compile-route-inventory` 多 7 次 fixture CLI 调用，实测该文件总时长约 10s 内）；换来的是计数、wrapper 名与失败定位都不降级。
2. **`tests/exchange-map-assets.test.js` 的 CJS 依赖**：`require(publicationScriptPath)` 改为静态 `import * as publication from "../../apps/api/scripts/operations/publish-openmap.js"`（Vite 的 CJS interop，已探针验证具名导出可用），并删除仅此一处使用的 `publicationScriptPath`。备选 `createRequire(import.meta.url)` 同样实测可用；选静态 import 是为了少一层 require shim，语义（取 `module.exports`）不变。
3. **`governance, contracts, and delivery keep disjoint source lists` 用例被扩充**（同一用例内新增 repository Vitest 形状、`--test`/`node` 缺席、Python 段 argv 与位置断言）。用例名与数量不变（11），断言数增加。
4. **`--experimental-strip-types` 的显式缺席断言**在实现中撤掉：新增的 `args` 全量 `deepEqual`（写死前缀 + 该计划文件清单）已经严格覆盖它的存在性，保留字面量只会让 AC2 的 grep 多一条非 Python/文档命中。

### 未验证 / 遗留

- 未以单条命令跑 `pnpm run test:infra`；其内容等于 `governance && contracts && delivery root`，三者已分别通过。
- 未跑 `delivery web`（纯 Python 段）与 `delivery integration`（build + `test:assets`，本次未触碰）。
- 未在 `CI=1` 下复核 repository 域的 JUnit 产物（`reports/junit-repository.xml`）；本次均为本地默认 reporter，该配置的加载证据已在 `88934a1d` 记录。
- 规格/文档仍有过期描述，**按本轮 scope 未改动**，留待主会话的 spec 更新步骤：
  - `.trellis/spec/repository/ci.md` §6「Tests Required」仍写 `node --test tests/ci-affected-workspaces.test.js`（现应指向新的 Vitest 调用或 `node scripts/testing/run-test-owner.mjs governance`）。
  - `docs/development/testing.md` 仍称根目录测试用 Node test runner，且写着 55/41/20 的 script 计数（后者是父任务 design §5 记录的既存漂移）。
- 本 worktree 在本批次期间出现了**不属于本次改动**的两处并发变更（mtime 16:43）：`.trellis/spec/api/backend/testing.md`（已修改）与 `apps/api/tests/tsconfig.json`（未跟踪，内容为 `{"extends": "../tsconfig.tests.json"}`）。未回退、未纳入本批次。
