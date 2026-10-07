# 报表与覆盖率接线：验证记录

## 第一段：配置骨架

采集时间：2026-09-19
分支：`chore/vitest-test-unification`
基点提交：`bedb2b7debb03a2eb756580a833ef85c4a5c4b8a`（骨架改动尚未提交）
运行时：Node `v24.18.0`、pnpm `11.10.0`、vitest 与 `@vitest/coverage-v8` 均为 4.1.11

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| Web JUnit 产出 | `CI=1 pnpm --filter @imsweb/web run test:unit` | exit 0；1532 例全过；`apps/web/reports/junit-web.xml` 464730 字节，根节点 `<testsuites name="web" tests="1532" failures="0" errors="0">` |
| 本地不写报表 | 同上但不设 `CI` | 只输出 default reporter，无 JUnit 文件 |
| Web 覆盖率 | `pnpm --filter @imsweb/web exec vitest run --coverage` | exit 0；产出 `apps/web/coverage/{coverage-summary.json,lcov.info,lcov-report/}` |
| 阈值占位不误杀 | 同上 | 四项阈值均为 0，未触发失败 |
| API 配置可用（别名、node 环境、TS 转换、真实源码导入） | 临时探针 `import { RUNTIME_ENV } from '@/config/env'`，`pnpm --filter @imsweb/api exec vitest run tests/__probe.test.ts` | exit 0，1 例通过；探针已删除 |
| API 覆盖率路径 | `pnpm --filter @imsweb/api exec vitest run --passWithNoTests --coverage src` | 采集生效，`include: ['src/**']` 分母 13703 行 |
| 产物被忽略 | `git check-ignore -v apps/web/coverage/lcov.info apps/web/reports/junit-web.xml` | 命中 `.gitignore:93` 与 `:94` |
| Web 配置通过类型检查 | `pnpm --filter @imsweb/web run typecheck` | exit 0（Web 的 tsconfig include 为 `**/*`，会检查该配置） |

## 已确认的行为

- 配置里写 `coverage.enabled: false` 不会压掉命令行的 `--coverage`，CLI 开关优先。因此本地默认不写文件、CI 或手动加 `--coverage` 即采集，两者可以共存。
- `coverage.include` 确实决定分母。Web 用 `app/**` 得到 13506 statements / 12081 lines，API 用 `src/**` 得到 13703 lines；不写 include 只会统计被加载的文件。
- JUnit 的 `suiteName` 与 `outputFile` 按域写定后，产物名可推断，CI 上传不需要额外探测。

## 临时数据（不是阈值依据）

Web 一次性覆盖率，采集于迁移前，测试集与迁移无关（Web 不迁移）：

```
Statements   : 70.5% ( 9523/13506 )
Branches     : 67.85% ( 7415/10928 )
Functions    : 67.32% ( 2868/4260 )
Lines        : 73.43% ( 8872/12081 )
```

耗时不可用于横向比较：带覆盖率那次 49.4s，不带那次 82.0s，后者反而更慢，差值是 Vite 转换缓存冷热造成的，不是覆盖率开销。要给出开销数字必须在同一缓存状态下做 A/B，留到收口阶段。

## 两个方法坑（验证过程本身踩到的）

- `pnpm run <script> -- --coverage` 会把 `--` 原样透传给 vitest，命令变成 `vitest run -- --coverage`，`--coverage` 被当成文件过滤参数，覆盖率根本不采集且不报错。要加 CLI 开关就用 `pnpm --filter <pkg> exec vitest ...`。
- 探针第一次断言 `typeof env === 'object'` 拿到 `undefined`，原因是 `@/config/env` 并不导出 `env`，不是别名失效。判断配置是否可用要看模块是否真的执行（当时模块里的安全警告已打印）。别名、环境、转换三项在改用真实导出 `RUNTIME_ENV` 后一次通过。

## 待办与阻塞

- ~~阻塞~~ 已解除（2026-09-19）：`scripts/check-workspace-boundaries.mjs` 的 retired Cloudflare Worker 清单里已删除 `vitest.config.mts` 条目，`node scripts/check-workspace-boundaries.mjs` 重新通过（`Workspace boundary check passed`）。同组的 `tsconfig.worker.json`、`tests/worker`、`wrangler.jsonc`、`.assetsignore` 未动。
- 根域配置已按选项 B 建在 `scripts/testing/vitest/vitest.repository.config.mts`（普通对象导出，无 `vitest/config` 导入）。已实测：CI=1 下 `pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts --passWithNoTests zzz-no-such-file` 退出码 0，`include` 打印为相对仓库根的两条模式，JUnit 写到仓库根 `reports/junit-repository.xml`（`suiteName="repository"`），并被 `.gitignore:94` 忽略。所以三份配置的“同形”只保留在值层面，写法差异是有意接受的代价。
- CJS helper 具名导出的 interop 已实测可用：一个 ESM 探针测试从 `tests/contracts/runtime-contracts.js` 与 `tests/postgres-test-lifecycle.js` 具名 import 的 8 个导出全部解析为期望类型，且 `deepEqual` 的函数体真的执行（不等输入抛出 `probe: expected {"a":2}, received {"a":1}`）。所以 helper 保持 `.js` 与 CJS 形态，只有测试文件自身需要 ESM 化。
- 仓库级 reporting 不变量测试未写，按计划在收口阶段落地（届时子任务 2 已改完 `run-test-owner.mjs`，避免两个子任务并发改同一文件）。
- 阈值仍未填实，`0` 是显式占位，AC3 在替换前不成立。

## 骨架提交与 lockfile 取证（2026-09-19）

骨架已作为 `88934a1d`（test(vitest): add per-domain runner configs and reporting scaffolding）提交：三份域配置、`apps/api` 的 `vitest` + `@vitest/coverage-v8` 与 `apps/web` 的 `@vitest/coverage-v8`、`.gitignore` 的 `coverage/` `reports/`、以及 retired Worker 清单里 `vitest.config.mts` 条目的删除。提交前跑过 pre-commit 快检（contracts owner、design lint、eslint、web typegen+tsc、api syntax 含 typecheck 与 architecture）全部通过。

`pnpm-lock.yaml` 在这个提交里被整文件重写（约 -7389/+4249 行），**不是依赖升级**。取证方法：用同一个正则从 `git show HEAD~1:pnpm-lock.yaml` 与新文件里抽取全部 `name@version` 键（两种引号写法都归一化）后做集合差；旧文件 827 行键用双引号、新文件 835 行用单引号，而 pnpm 版本就是 `packageManager` 钉的 11.10.0，所以任何依赖改动都会触发这种引号风格重排。集合差只有四项：新增 `@vitest/coverage-v8` 依赖树（9 个包：`@bcoe/v8-coverage`、`ast-v8-to-istanbul`、`html-escaper`、`istanbul-lib-coverage`、`istanbul-lib-report`、`istanbul-reports`、`magicast`、`make-dir`、`js-tokens@10.0.0`）、`apps/api` 自己的 peer 上下文出现（`typescript@7.0.2`、`@types/node@22.20.1`）、`picomatch` 去重（4.0.4 -> 4.0.5），其余没有任何产品依赖版本变化。该说明已写进提交正文，避免评审者把格式重排当成升级。

## 第二段：阈值与 CI artifact 收口

采集时间：2026-09-19
分支：`chore/vitest-test-unification`
基点提交：`323e56f1`（本段改动尚未提交）
运行时：Node `v24.18.0`、pnpm `11.10.0`、vitest 与 `@vitest/coverage-v8` 均为 4.1.11
环境：PostgreSQL 可达 `127.0.0.1:5432`（生命周期默认回环 URL，未设 `IMS_TEST_POSTGRES_ENABLED`，即启用）
完整基线（分母口径、命令、耗时 A/B）：`research/coverage-baseline.md`

### 阈值

| 执行域 | Statements | Branches | Functions | Lines | 设定阈值（S/B/F/L） |
| --- | --- | --- | --- | --- | --- |
| API | 76.66% (11544/15057) | 66.15% (7285/11012) | 84.03% (2505/2981) | 79.74% (10927/13703) | 76 / 66 / 84 / 79 |
| Web | 70.5% (9523/13506) | 67.85% (7415/10928) | 67.32% (2868/4260) | 73.43% (8872/12081) | 70 / 67 / 67 / 73 |
| 根契约与治理 | 1.33%（三次调用最小值） | 0.76% | 0.38% | 1.36% | 该行已被 §3 推翻：不再设阈值 |

均取实测值下取整。根契约与治理域的阈值**不是**域级合并运行的数字（那是 lines 39.73%）：该配置被 CI lane 的三次调用共用，`include: ['scripts/**']` 让三次调用共用同一个分母，绑定项是 `delivery repository`（1 文件 / 6 用例，只覆盖 45 行 `scripts/**`），任何大于 1 的门禁都会让那一次调用必红。三次调用的完整覆盖率表见 `research/coverage-baseline.md`。**本段结论已在 §3 被推翻**：与其设一个 1/0/0/1 的装饰性门禁，该域改为不产覆盖率、只写 JUnit。

### AC1：三域各一次运行同时产出 JUnit 与覆盖率

| 域 | 命令（`CI=1`） | 结果 |
| --- | --- | --- |
| API | `CI=1 pnpm exec vitest run`（cwd `apps/api`） | exit 0；134 文件 / 884 用例；`apps/api/reports/junit-api.xml`（`<testsuites name="api" tests="884" failures="0">`）与 `apps/api/coverage/{coverage-summary.json,lcov.info,lcov-report/}`；覆盖率与本地 `--coverage` 完全一致；墙钟 61s（`CI` 下 maxWorkers 2） |
| Web | `VITE_IMS_APP_TARGET=web CI=1 pnpm --filter @imsweb/web exec vitest run` | exit 0；220 文件 / 1532 用例；`apps/web/reports/junit-web.xml`（`name="web" tests="1532" failures="0"`）与 `apps/web/coverage/…` |
| 根契约与治理 | `CI=1 pnpm exec vitest run --root ../.. --config scripts/testing/vitest/vitest.repository.config.mts <governance files>`（cwd `apps/api`） | exit 0；4 文件 / 62 用例；仓库根 `reports/junit-repository.xml`（`name="repository" tests="62" failures="0"`）；不产覆盖率（§3） |

### AC2：CI artifact 步骤

三条，参数形状与相邻 Playwright evidence 步骤一致（同一个 `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7`、`if-no-files-found: ignore`、`retention-days: 7`），每域上传自己的 JUnit 与覆盖率目录：

| lane | 步骤名 | artifact 名 | 上传路径 | 条件 |
| --- | --- | --- | --- | --- |
| repository | `Upload repository reports` | `repository-reports-${{ github.run_id }}-${{ github.run_attempt }}` | `reports/junit-repository.xml` | `if: always()` |
| web | `Upload Web reports` | `web-reports-${{ github.run_id }}-${{ github.run_attempt }}` | `apps/web/reports/junit-web.xml`、`apps/web/coverage` | `if: always()` |
| api | `Upload API reports` | `api-reports-${{ github.run_id }}-${{ github.run_attempt }}` | `apps/api/reports/junit-api.xml`、`apps/api/coverage` | `if: always()` |

未引入任何 JUnit 注解 action（2026-09-19 决定）。上传步骤本身**无法在本地执行**（没有 Actions runner，`actions/upload-artifact` 也不会在本地跑），本地核对的是：YAML 通过 `prettier --check .github/workflows/ci.yml`，以及 `python3 -m unittest tests/test_github_deployment.py` 的 27 例工作流契约（步骤名、路径、`if: always()`、artifact 名、固定 SHA）。

### AC3：门禁会红

两项临时改动都已撤销，`git status` 里没有残留。

| 检查 | 临时改动 | 观察 |
| --- | --- | --- |
| 覆盖率低于阈值 | 新增 `apps/api/src/zz-coverage-probe.ts`（155 行 / 150 个未被覆盖的 statement）后 `pnpm exec vitest run --coverage` | exit **1**；`ERROR: Coverage for lines (78.86%) does not meet global threshold (79%)` 与 `ERROR: Coverage for statements (75.9%) does not meet global threshold (76%)`；884 个用例仍然全过，说明红的是门禁不是测试 |
| 用例失败写进 JUnit | 新增 `tests/zz-junit-failure-probe.test.mjs`（`assert.equal(1, 2)`）后 `CI=1 pnpm exec vitest run --root ../.. --config … --coverage.enabled=false tests/zz-junit-failure-probe.test.mjs` | exit **1**；`reports/junit-repository.xml` 根节点 `<testsuites name="repository" tests="1" failures="1" errors="0">`，`<failure message="probe: intentional failure …" type="AssertionError">`，`<testcase … file="tests/zz-junit-failure-probe.test.mjs">`（`addFileAttribute` 生效） |

### AC4：跨域不变量测试

新增 `tests/vitest-reporting.test.mjs`（`node:assert/strict`；不是 1 个，因此 governance 域是 **4 文件 / 62 用例**，不是规划里估的 60。**§3 与 §4 加完断言后为 5 个 `test` / 4 文件 / 64 用例**），登记进 `run-test-owner.mjs` 的 `governanceNodeTests`。断言清单：

- 每份配置的 JUnit 片段（用平衡花括号切出，避免匹配到 `test.include` 之类的同名键）：`outputFile: 'reports/junit-<domain>.xml'`、`suiteName: '<domain>'`、`includeConsoleOutput: false`、`addFileAttribute: true`；
- 每份配置的 `reporters` 仍是 `process.env.CI` 门控（本地不写报表）；
- 每份配置的 coverage 片段：`provider: 'v8'`、`reportsDirectory: 'coverage'`、`enabled: Boolean(process.env.CI)`、`include: ['<该域 glob>']`（API `src/**`、Web `app/**`、仓库 `scripts/**`）；（§4 后：`enabled` 改为 `process.env.IMS_TEST_COVERAGE_ENABLED === 'true'` 并由 ci.yml 的两个域级步骤打开，仓库配置不再有 coverage 片段）；
- `thresholds` 里 `lines`/`branches`/`functions`/`statements` 四个键都存在 —— **只断言键存在，不断言数值**，否则每次单调上调阈值都要改测试；
- 根域配置保持普通对象导出：不 import `vitest/config`、`export default {`。

值断言用正则，单双引号都接受（三份配置的引号风格本来就不一致），断言的是值不是排版。`scripts/testing/tests/run-test-owner.test.mjs` 的 governance 文件清单（穷尽 argv `deepEqual`）同步加了一行，并新增 `assert.ok(paths.includes("tests/vitest-reporting.test.mjs"))`；cwd、冻结、无 `--test`、无 `node` 步骤、Python 段 argv 与顺序等原有断言一条未删。

### AC5：本地默认不写文件

不设 `CI` 跑仓库域 `tests/exchange-map-assets.test.js`（exit 0）后，仓库根与 `apps/api` 的 `reports/`、`coverage/` 四个目录都不存在。命令行 `--coverage` 仍然压过配置里的 `IMS_TEST_COVERAGE_ENABLED` 判断（本段全部基线都是这样采的）。

### AC6：覆盖率开销

见 `research/coverage-baseline.md` 的「覆盖率开销」表：API +2s（32→34s）、Web +9s（44→53s）、仓库域 8 文件 +42s（11→53s，CPU 密集契约吃满 V8 精确块覆盖的代价）。

### AC7：跑完全量后 `git status` 干净

三域全量（含 `CI=1`）跑完后的 `git status --short`：本段改动的 7 个文件、新测试文件、并发改动中的 `docs/development/testing.md`（不是本 agent 改的）、以及 `.trellis/tasks/` 未跟踪目录。没有任何 `coverage/` 或 `reports/` 产物出现。

### 顺带修掉的治理断言

`tests/test_github_deployment.py` 的 `test_ci_workflow_splits_affected_validation_lanes` 断言 `ci.count(UPLOAD_ARTIFACT_ACTION) == 2`；新增三个上传步骤后为 5。改 `2 → 5`，并补上三段完整步骤的逐行断言（步骤名、`if: always()`、固定 SHA、artifact 名、两条上传路径、`if-no-files-found`、`retention-days`）。改后 `python3 -m unittest tests/test_github_deployment.py` 27 例全过。

### 其它已跑通的检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| governance owner（含新测试） | `node scripts/testing/run-test-owner.mjs governance` | 4 文件 / 64 用例 + Python `Ran 123` 全过（§3/§4 后）；实测 144s |
| contracts owner | `node scripts/testing/run-test-owner.mjs contracts` | 3 文件 / 29 用例全过 |
| delivery repository owner | `node scripts/testing/run-test-owner.mjs delivery repository` | 1 文件 / 6 用例全过 |
| 仓库级检查 | `pnpm run check:root` | 全过 |
| 工作区边界 | `python3 -m unittest tests/test_workspace_boundaries.py` | `Ran 26 tests` OK（脚本计数 57/43/21 未变） |
| Web 类型检查（`tsconfig` include `**/*`，会检查 `vitest.config.ts`） | `pnpm --filter @imsweb/web run typecheck` | exit 0 |
| Web lint | `pnpm --filter @imsweb/web run lint` | exit 0 |
| 源码规则 | `node scripts/check-source-rules.mjs` | passed |
| YAML / 新测试格式 | `prettier --check .github/workflows/ci.yml tests/vitest-reporting.test.mjs` | clean（三份根域 `scripts/**` 文件在 HEAD 上本来就不符合 prettier 默认值，仓库根没有 prettier 配置，本段维持既有排版） |

### 未做到 / 需要你决定

1. **根契约与治理域的阈值实际是弱门禁。** 该配置被 lane 的三次调用共用，`include: ['scripts/**']` 让三次调用共用同一个分母，绑定项是 `delivery repository`（lines 1.36%）。要让这个域有有意义的门禁，需要让三次调用共享一次覆盖率采集 —— 也就是改 `run-test-owner.mjs` 的 plan 形状，本段按决策 1 不动。现值 1/0/0/1 是「实测最小值下取整」，分支与函数两项等同不设限。
2. **仓库域的 `testTimeout` 从默认 5s 提到 60s。** 见 design §7.4：这是「同一次运行既写 JUnit 又采覆盖率」在 CPU 密集契约上不超时的唯一代价，没有跳过或排除任何用例。若更希望不动 timeout，就得给该域换成独立的一次「只采覆盖率」运行（会引入第二次执行）。
3. ~~**API 与 Web 配置的 `exclude` 未动。**~~ **（§3 已处理）** `apps/api/src/**` 下的 5 个 `README.md` 会在每次 API 覆盖率运行里打印 `Failed to parse file … Excluding it from coverage`（数值不受影响，因为解析失败即自动排除），已在 API 的 `exclude` 补 `**/*.md`；Web 的 19 个 `.css`/`.json`/`.svg` 同样补进 `exclude`。
4. **`docs/development/testing.md` 在工作树里被并发改动**（不是本 agent 改的），所以 `git status` 不是「只有本段改动」。
5. **`.trellis/spec` 未动**（按约定由你收口）。

## 第三段：主会话交叉评审（2026-09-19）

子任务结束后，主会话独立复核了改动与结论，处理了四项：

1. **根契约与治理域的覆盖率门禁是装饰性的，已撤掉。** `research/coverage-baseline.md` 自己就记录了口径冲突：CI 的 repository lane 是三次独立调用共用一份配置与同一个 3292 行 `scripts/**` 分母，`delivery repository` 只覆盖其中 45 行（lines 1.36%），任何大于 1 的阈值都会让该步必红；而 CPU 密集的 contracts 要为覆盖率付出 12s → 52s。决定改为该域只产 JUnit（design §7.3、prd Confirmed Decisions），并同时移除仅为覆盖率加的 `testTimeout: 60_000`（design §7.4）。
   - 复核命令与结果：`rm -rf reports coverage && CI=1 node scripts/testing/run-test-owner.mjs delivery repository` → 1 文件 / 6 用例通过、写出 `reports/junit-repository.xml`（1635 B）、**没有**产生 `coverage/` 目录、退出码 0。`ci.yml` 的 repository lane 上传路径同步只剩 JUnit，`tests/test_github_deployment.py` 的逐行断言改为允许各 lane 各自的路径集合。
   - 顺带修掉一处噪音：`apps/api/src/**` 下的 5 个 `README.md` 命中 `coverage.include`，v8 remapper 解析失败并在每次运行打印错误栈（非致命，数值不变）。已在 API 配置的 `exclude` 补 `**/*.md`（design §7.2）。
2. **阈值确实会拦下不达标的运行** —— 失败方向由主会话独立复现，且未改任何配置：在 `apps/api` 下执行 `pnpm exec vitest run --coverage tests/wiki`，7 文件 / 60 用例通过，覆盖率 16.74% statements / 11.43% branches / 15.29% functions / 17.7% lines，四条 `ERROR: Coverage for … does not meet global threshold` 全部触发，退出码 1。
3. **不变量测试与治理域计数**：`tests/vitest-reporting.test.mjs` 由 3 个用例变为 4 个（新增“根域没有 coverage 段”），`node scripts/testing/run-test-owner.mjs governance` → 4 文件 / 63 用例 + Python `Ran 123 tests OK`，退出码 0（§4.3 又加一组断言后为 5 个用例 / 64 用例）。`python3 -m unittest tests.test_github_deployment` → `Ran 27 tests OK`；该命令必须在仓库根执行，从 `apps/api` 执行会因找不到模块报 1 个错误（不是回归）。

### 4.1 一次失败运行的解释：同域并发采集冲突

CI 模式的第一次复核里，Web lane 通过（1532 用例、70.5 / 67.85 / 67.32 / 73.43，四条阈值全部满足、退出码 0、写出 `reports/junit-web.xml`），但 API lane 退出码 1，报错是：

```
Error: Something removed the coverage directory ".../apps/api/coverage/.tmp" Vitest created earlier.
Make sure you are not running multiple Vitests with the same "coverage.reportsDirectory" at the same time.
Caused by: ENOENT ... apps/api/coverage/.tmp/coverage-1.json
```

原因不在改动，而在复核方式：该后台任务跑 API 全量时，主会话同时在 `apps/api` 下跑自己的阈值失败方向探针（`pnpm exec vitest run --coverage tests/wiki`），两个进程共用 `apps/api/coverage`，各自的 `.tmp/coverage-*.json` 互相删除。同一域的两次 Vitest 运行不能并发——它们共用 `coverage.reportsDirectory` 与同一个 JUnit 输出文件。

这不是被测代码的问题：`run-test-owner.mjs` 的步骤顺序执行，CI 每个 lane 一个独立 job，取消并发后重跑 API lane 即通过（见 §4.2）。代价是这一条经验要进文档：文档段落里应写明"同一域不要并发跑两次 Vitest"。

### 4.2 CI 模式下的通过方向证据（无并发 Vitest）

- API：`CI=1 pnpm --filter @imsweb/api run test` → 134 文件 / 884 用例通过，耗时 60.10s，写出 `apps/api/reports/junit-api.xml`（247106 B）与 `apps/api/coverage/coverage-summary.json`，覆盖率 76.66% statements / 66.15% branches / 84.03% functions / 79.74% lines，**四条阈值全部满足**，退出码 0。四项数值与收口前的基线逐位相同，说明 API 配置新增的 `**/*.md` 排除只清掉了日志噪音，没有动分母。
- Web：`CI=1 pnpm --filter @imsweb/web run test:unit` → 1532 用例 / 220 文件，覆盖率 70.5 / 67.85 / 67.32 / 73.43，四条阈值（70 / 67 / 67 / 73）满足，写出 `apps/web/reports/junit-web.xml`，退出码 0。

### 4.3 阻塞项：`Boolean(process.env.CI)` 让过滤运行也被域级阈值压死（已修）

独立 check 覆盖发现两处 CI 回归，同一个根因：初版把覆盖率开关写成 `enabled: Boolean(process.env.CI)`，而 GitHub 对每条 CI 步骤都设 `CI=true`，于是**任何**用到该配置的 CI 运行都会压上域级阈值，包括只跑几个文件的过滤运行：

- App lane：`pnpm --filter @imsweb/web run test:unit tests/unit/scripts/build-app.test.ts`（21 用例）→ 实测 0.04% / 0% / 0% / 0.04%，四条阈值全红、退出码 1。任何 app 相关 PR 都会断。
- integration lane：`test:web-routing` → `@imsweb/api run test:assets`（10 用例）→ 同类失败。

阈值是按「一次覆盖整个域的运行」实测出来的，过滤运行本来就达不到；这不是被测代码的问题，而是开关粒度的问题。修法：把开关从「猜是不是 CI」改成「由拥有全域运行的那一步声明」——`enabled: process.env.IMS_TEST_COVERAGE_ENABLED === 'true'`，只在 ci.yml 的 `Test Web owner`（`test -- ci`，`check` 末尾是全量 `test:unit`）与 `Test API owner`（整棵 API 测试树）这两个步骤上设 `IMS_TEST_COVERAGE_ENABLED: "true"`。JUnit 仍只由 `CI` 决定，因此过滤运行照旧写自己的报表文件（那两条 lane 不上传这些路径，artifact 不受影响）。

复核证据（全部在最终配置上重跑，步骤内不含其它 Vitest 进程）：

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| App lane 过滤运行 | `CI=1 pnpm --filter @imsweb/web run test:unit tests/unit/scripts/build-app.test.ts` | 1 文件 / 21 用例通过，**没有** `apps/web/coverage/`，退出码 0 |
| integration lane 过滤运行 | `CI=1 pnpm --filter @imsweb/api run test:assets` | 2 文件 / 10 用例通过，**没有** `apps/api/coverage/`，退出码 0 |
| Web lane 全域运行 | `CI=1 IMS_TEST_COVERAGE_ENABLED=true pnpm --filter @imsweb/web run test:unit` | 220 文件 / 1532 用例，70.5 / 67.85 / 67.32 / 73.43，四条阈值满足，写出 JUnit 与 `apps/web/coverage/`，退出码 0 |
| API lane 全域运行 | `CI=1 IMS_TEST_COVERAGE_ENABLED=true pnpm --filter @imsweb/api run test` | 134 文件 / 884 用例，76.66 / 66.15 / 84.03 / 79.74，四条阈值满足，写出 JUnit 与 `apps/api/coverage/`，退出码 0 |

不变量测试同步加了两组断言：coverage 的 `enabled` 必须是旗标表达式、且不得只看 `process.env.CI`；并按步骤切分 ci.yml，要求带旗标的步骤恰好是 `["Test Web owner", "Test API owner"]` 且都设为 `"true"`。删掉旗标（CI 静默不再采集覆盖率）或把旗标挪到过滤运行的步骤上（该 lane 立刻变红）都会失败。

### 4.4 其余复核结果

- Web 的 `exclude` 补 `**/*.css` / `**/*.json` / `**/*.svg` 后重跑全域：`apps/web/coverage/coverage-summary.json` 的条目从 382 降到 363，非 `.ts`/`.tsx` 条目为 0，四项总分逐位不变（70.5 / 67.85 / 67.32 / 73.43），阈值照旧满足。
- API 的 `exclude` 补 `**/*.md` 后，日志里的 `Failed to parse file … README.md` 错误栈消失，分母与总分不变（见 §4.2）。
- `python3 -m unittest tests.test_github_deployment` 在 ci.yml 加了两处 `env:` 之后仍是 `Ran 27 tests OK`：该文件只断言上传步骤的完整文本与命令子串，不断言这两个测试步骤，所以断言未受影响。

### 4.5 收尾门禁与耗时重测（2026-09-19）

`docs/development/testing.md` 里 `pre-commit` 的耗时数字来自 Node test runner 时代，迁移后必须重测；同时补上此前一直没作为单条命令跑过的 `check:pre-commit`。

| 对象 | 命令 | 结果 |
| --- | --- | --- |
| contracts 守护 | `node scripts/testing/run-test-owner.mjs contracts` | exit 0，11s |
| API migration 守护 | `pnpm --filter @imsweb/api run test:migration` | exit 0，4s |
| Web routes 守护 | `pnpm --filter @imsweb/web run test:unit routes.test.ts` | exit 0，1s |
| governance owner | `node scripts/testing/run-test-owner.mjs governance` | exit 0，144s；4 文件 / **64** 用例（59 + 5）+ Python `Ran 123 tests OK` |
| pre-commit 快检 | `pnpm run check:pre-commit` | exit 0，166s |

三个守护合计从约 10s 变为约 16s（Vitest 每次启动的固定成本高于 `node --test`），相对 `check:pre-commit` 的 166s 仍可忽略；文档的数字已按此表更新。`check:pre-commit` 作为单条命令通过，关闭了 API 批次留下的“未作为单条命令验证”的缺口。

不变量用例数是分两次长的：收口时为 3 个（governance 4 文件 / 62 用例），§3 加“根域没有 coverage 段”后为 4 个（63），§4.3 加 coverage 旗标与 ci.yml 落点两组断言后为 5 个（64）。文档与任务记录统一按最终值 64。

### 4.6 提交哈希变更（rebase）

本文件提到的提交哈希是 rebase 前的。分支后来 `git rebase --onto release/v1.1 bedb2b7d`（丢弃与 release `879a8203` 重复的 spec 提交），对应关系见父任务
`.trellis/tasks/09-19-vitest-test-unification/implement.md` 的「Rebase 记录」；本文的最终两次提交是 `0104741c`（报表与覆盖率门禁）与 `9653a250`（陈旧注释）。
