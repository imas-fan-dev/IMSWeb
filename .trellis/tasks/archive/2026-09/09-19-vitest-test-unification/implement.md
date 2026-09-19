# 统一测试执行到 Vitest：实施计划

> 顺序原则：配置与报表骨架先行（三个域都要用同一份形态），随后 API 与根契约迁移，最后收口覆盖率门禁与集成验收。每个阶段一个提交，可单独回滚。

## 0. 启动前检查与基线

- [x] 确认工作区干净、`release/v1.1` 与远端同步；确认当前未提交的 `.trellis/spec/**` 改动属于 `09-19-spec-refresh-drift`，不混入本任务提交。
- [x] 起本地数据服务：`pnpm run dev:doctor` 检查后 `pnpm run dev:postgresql:up`。
- [x] 采集迁移基线并落盘到 `research/baseline.md`（已完成：governance 3 Node 契约 + 9 Python、contracts、web unit、API 四段；另采一次 `IMS_TEST_POSTGRES_ENABLED=false` 的 API 基线，跳过数 218 是迁移后要复现的数字）：
  - `pnpm --filter @imsweb/api run test 2>&1 | tee research/baseline-api.log`
  - `node scripts/testing/run-test-owner.mjs governance 2>&1 | tee research/baseline-governance.log`
  - `node scripts/testing/run-test-owner.mjs contracts 2>&1 | tee research/baseline-contracts.log`
  - `pnpm --filter @imsweb/web run test:unit 2>&1 | tee research/baseline-web.log`
  - 从日志提取每域的 file / test / skipped / duration 四项。
- [x] 冒烟验证 CJS interop 与 alias（已完成：`@/` 别名与真实源码导入通过；`tests/contracts/runtime-contracts.js` 与 `tests/postgres-test-lifecycle.js` 两个 CJS helper 的具名导出全部可用且函数体真的执行，因此 helper 不改名 `.mjs`，只 ESM 化测试文件自身）。
- [x] `@vitest/coverage-v8` 的归属已按实测结论定下：根 `package.json` 只能声明 `husky`，所以 `vitest` 与 `@vitest/coverage-v8` 声明在 `apps/api`，`@vitest/coverage-v8` 声明在 `apps/web`，两处同一版本范围（已安装并验证二进制可解析）。
- [x] 记录回滚点：本阶段提交不含任何测试内容改动。

## 1. 配置与报表骨架（对应子任务 3 第一部分）

- [x] 新增 `apps/api/vitest.config.mts`（environment `node`、`pool: 'forks'`、`isolate`、alias `@` → `src`、reporter 与 coverage 写在本文件）。
- [x] 改 `apps/web/vitest.config.ts`，补齐同形的 reporter 与 coverage 片段（不抽公共模块，理由见 design §1）。
- [x] 根域配置已按 §8 第 1 条的决定（选项 B）建于 `scripts/testing/vitest/vitest.repository.config.mts`：普通对象导出、由 `apps/api` 宿主执行，同提交内从 `scripts/check-workspace-boundaries.mjs` 的 retired Worker 清单里删除了 `vitest.config.mts` 条目。
- [x] 在 `apps/api` 声明 `vitest` 与 `@vitest/coverage-v8`，在 `apps/web` 声明 `@vitest/coverage-v8`（同一版本范围）；根不声明，见 design §1.1。
- [x] `.gitignore` 增加 `coverage/`、`reports/`（这两条模式匹配任意深度，覆盖根与两个 workspace）。
- [x] 验证：两个配置都能启动并跑出 0 test 或已有用例；`pnpm --filter @imsweb/web run typecheck` 仍通过（Web 的 `tsconfig` include 是 `**/*`，会检查配置文件）；`pnpm run check:rules`、`pnpm run check:boundaries` 通过。

## 2. API 执行域迁移（子任务 1）

按 suite 分批，每批：迁移前用基线命令跑一次 → 迁移后同命令跑一次 → 比对 file/test/skip → 跑 `pnpm --filter @imsweb/api run typecheck` → 提交。

- [x] 批次 A：生命周期与包装器
  - 改写 `tests/server/postgres-test-database.ts`、`tests/integration/postgres-harness.ts` 的 `postgresTest` 包装与两个连接工厂签名（去 `t`，改 `onTestFinished`）。
  - 迁移 `tests/postgres-test-lifecycle.test.js`（含 478 行核心自身的用例）到 Vitest，保留全部 contract row。
  - 验证：`vitest run tests/postgres-test-lifecycle.test.js`、PG 相关 39 文件的跳过与启用两种路径都跑一遍（含 `IMS_TEST_POSTGRES_ENABLED=false`）。
- [x] 批次 B：`tests/server`（102 文件）
- [x] 批次 C：`tests/wiki`（7 文件）
- [x] 批次 D：`tests/migration`（18 文件，删除硬编码清单）
- [x] 批次 E：`tests/assets`（2 文件）与顶层 5 文件（`hono-app-contract`、`node-listener-probe`、`node-security`、`operation-scripts`）
- [x] 批次 F：脚本与 typecheck 收口
  - 替换 `test:node` / `test:server` / `test:wiki` / `test:migration` / `test:assets`。
  - 新增 `tsconfig.tests.json`，把单一 `tsc` 挂进现有 `typecheck`，删除 per-suite tsconfig 的脚本用法。
  - 更新 `run-test-owner.mjs` 的 `apiPlan()` 与 `scripts/testing/tests/run-test-owner.test.mjs`。
  - 校正 `docs/development/testing.md` 中的 script 计数漂移。
- [x] 验证：`pnpm --filter @imsweb/api run test` 全绿；`grep -rn "node --test" apps/api/package.json scripts/testing/run-test-owner.mjs` 无 API 命中；`.js` 测试文件中无 `require('vitest')`。

## 3. 根契约与治理迁移（子任务 2）

- [x] 先改 `run-test-owner.mjs` 的 `governancePlan()` / `contractsPlan()` / `deliveryPlan()` Node 段为 vitest 调用，Python 段不动。
- [x] 迁移 `tests/development-environment.test.js`、`tests/ci-affected-workspaces.test.js`、`tests/exchange-map-assets.test.js`、`tests/tauri-build-configuration.test.js`、`tests/tauri-device-delivery.test.js`。
- [x] 迁移 `tests/contracts/non-json-boundaries.test.mjs`、`scripts/contracts/tests/compile-route-inventory.test.mjs`、`scripts/contracts/tests/compile-frontend-route-metadata.test.mjs`。
- [x] 迁移 `scripts/testing/tests/run-test-owner.test.mjs`，逐条重写 plan 断言（不删断言）。
- [x] 验证：`node scripts/testing/run-test-owner.mjs governance`、`... contracts`、`... delivery root|repository|app` 全绿；`pnpm run test:infra`、`pnpm run check:root` 通过；`grep -rn "node --test\|experimental-strip-types" scripts/testing scripts/contracts tests` 无命中（Python 与 docs 除外）。

## 4. 报表与覆盖率收口（子任务 3 剩余）

- [x] 阈值已从占位 0 改为实测下取整值：API lines 79 / branches 66 / functions 84 / statements 76（实测 79.74 / 66.15 / 84.03 / 76.66），Web 73 / 67 / 67 / 70（实测 73.43 / 67.85 / 67.32 / 70.5）；仓库契约与治理域最终不设覆盖率门禁（该 lane 三次调用共用一份 `scripts/**` 分母，最小口径只有 1.36%，而 CPU 密集的 contracts 要为精确 v8 块覆盖率多付约 40s），已同步 design §7、prd、不变量测试与 `docs/development/testing.md`。
- [x] 新增仓库级 reporting 不变量测试 `tests/vitest-reporting.test.mjs`（5 个用例：三域 JUnit 形状、三域覆盖率形状、`IMS_TEST_COVERAGE_ENABLED` 只在两个全域 CI 步骤上、仓库域无 coverage 段、仓库域保持普通对象导出），并登记到 `run-test-owner.mjs` 的 governance 显式清单（governance 因此变为 4 文件 / 64 用例）。
- [x] CI 三个 lane 增加 JUnit 与覆盖率 artifact 上传（每个 lane 一个 `if: always()` 步骤，名称 `<domain>-reports-<run_id>-<run_attempt>`，retention 7 天，`if-no-files-found: ignore`），`tests/test_github_deployment.py` 从 2 处 upload-artifact 改为 5 处并逐行断言三个步骤。
- [x] JUnit artifact 可读性已逐份解析（不是只看文件存在）：`apps/api/reports/junit-api.xml` 884 个 `testcase`、classname 为测试文件路径、0 failure / 0 skipped；`apps/web/reports/junit-web.xml` 1532 个；`reports/junit-repository.xml` 5 个且用例名完整。不接 GitHub 注解（按用户决定只上传 artifact）。
- [x] 验证：pass 方向与 fail 方向都做过——CI 模式下 API 76.66 / 66.15 / 84.03 / 79.74 与 Web 70.5 / 67.85 / 67.32 / 73.43 均高于阈值并 exit 0；单文件运行（`vitest run --coverage tests/wiki`）打印四条 `ERROR: Coverage for <metric>` 并 exit 1。另外修正了一个会误报的开关：原 `enabled: Boolean(process.env.CI)` 会让 App lane 的单文件 Web 运行（21 例、0.04%）与 integration lane 的 `test:assets` 撞上全域阈值，现改为域级运行的 `IMS_TEST_COVERAGE_ENABLED` 旗标，只有两个全域 CI 步骤设置它。

## 5. 父任务集成验收

- [x] `pnpm run check`：exit 0，208s（含 Web lint / typecheck / 1534 用例 / build 与 API architecture 381 模块）。
- [x] `pnpm run test`：exit 0，364s（check:root、governance 4/64 + Python 123、contracts 3/29、delivery root 3/27 + Python 2、delivery integration `test:assets` 2/10、API 134/884、Web 220/1534）。
- [x] `pnpm run check:pre-commit`：exit 0，166s（此前只验证过组成部分）。
- [x] `pnpm run test:web-routing`：与根链里的 `delivery integration` profile 是同一条命令，已在根链中通过。
- [x] 全仓确认 `node --test` 从 package scripts 与 owner plan 消失：`grep -rn -- "--test" package.json apps/*/package.json scripts/testing/run-test-owner.mjs` 无命中；`node:test` 在 `apps/api/tests`、`tests`、`scripts` 下也无活代码命中（只剩已清理的注释措辞）。
- [x] 三域 file/test/skip 与基线比对表落入 `verification.md`，差异均带解释（唯一减少是 `node-email-delivery-runner.test.ts` 的 counted subtest 容器，−1）。
- [x] 更新 spec：`.trellis/spec/api/backend/testing.md`（Test ownership / Signatures / Contracts / Commands / 报告与覆盖率）、`.trellis/spec/web/frontend/testing.md`（域报表与并发约束）、`.trellis/spec/repository/ci.md` §6、`docs/development/testing.md`。

## 回滚点

| 提交 | 回滚方式 |
| --- | --- |
| 依赖与配置骨架 | revert 该提交即回到零报表的现状 |
| API 批次 A | revert 后生命周期包装恢复 node:test，其余批次不受影响 |
| API 批次 B–E | 按目录 revert，同一时间未迁移目录仍是 node:test |
| 脚本与 typecheck 收口 | revert 后需同时确认 owner plan 断言回到旧形状 |
| 根契约迁移 | 与 API 迁移独立，互不阻塞回滚 |
| 覆盖率阈值 | 阈值单独提交，回滚只降门禁不改测试 |

## 收尾文档与合并清单

- [x] `.trellis/spec/api/backend/testing.md` 四节同步（Vitest 域、单一 `tsconfig.tests.json` 门禁、`tsx/cjs` 钩子、PostgreSQL allocator 归属），提交 `323e56f1`。
- [x] `.trellis/spec/repository/ci.md` §6 与 `.trellis/spec/web/frontend/tauri-mobile-integration.md` §5 改为新命令，提交 `00dfc10c`。
- [x] `docs/development/testing.md`：script 计数改为 57/43/21、API 阶段改为“build + syntax + architecture + 一次 Vitest 全量”、测试位置表区分 Vitest 与 Python 并新增“仓库契约与治理”行。
- [x] `docs/development/testing.md`：耗时数字已按 2026-09-19 重测更新（governance owner 144s、pre-commit 三个守护 11s + 4s + 1s、`check:pre-commit` 166s），并已新增“报告与覆盖率”小节（三域 JUnit 路径、`exec vitest run --coverage` 用法与 `pnpm run <script> -- --coverage` 的 `--` 陷阱、CI artifact 名称 `<domain>-reports-<run_id>-<run_attempt>`、阈值只能上调、根契约与治理域只产 JUnit、覆盖率由域级运行旗标 `IMS_TEST_COVERAGE_ENABLED` 打开、同一域不可并发跑两次 Vitest）；重复的 --config 说明也已改正。剩 `.trellis/spec/api/backend/testing.md` 补一句报告与覆盖率入口。
- [ ] 合并前删除主检出的四个 `.trellis/tasks/09-19-vitest-*` 相对符号链接（否则会挡住主树 checkout）。
- [ ] 合并后归档四个子任务（`task.py archive`，会把 status 置为 completed；`archive` 需要工作树干净，因此放在提交之后）。

## Rebase 记录（2026-09-19）

分支已 `git rebase --onto release/v1.1 bedb2b7d`：`bedb2b7d`（spec 对齐）与 release 的 `879a8203` 内容重复，被丢弃；其余 10 个提交重放到 `release/v1.1` 的 `a3a12c79` 之上。唯一冲突是 `docs/development/testing.md` 的 script 计数段落，取 release 的措辞（点名 `tests/test_workspace_boundaries.py` 为权威）。

因此所有任务记录里引用的提交哈希都变了，对应关系：

| 迁移前 | rebase 后 | 内容 |
| --- | --- | --- |
| `bedb2b7d` | 丢弃 | 与 release 的 `879a8203` 重复的 spec 对齐 |
| `88934a1d` | `b11163cf` | 三份域配置与报表骨架 |
| `841830bd` | `dc197fe5` | tests/wiki |
| `af81a955` | `39535635` | tests/server |
| `9ad5a5b3` | `7615e81c` | tests/migration |
| `e232e68f` | `2bd2a86e` | tests/assets 与顶层套件 |
| `e68e25b6` | `ff43d379` | API 收口（plan 合并、tsconfig.tests.json、适配器上移） |
| `00dfc10c` | `9955db91` | 仓库域九个 Node 文件 |
| `323e56f1` | `fb963ae7` | API spec 与 `tests/tsconfig.json` |
| `19cd8b5e` | `0104741c` | 报表与覆盖率门禁 |
| `19f96b93` | `9653a250` | 两处陈旧 runner 注释 |
