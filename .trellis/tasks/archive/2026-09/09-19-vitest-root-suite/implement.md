# 根契约与治理迁移：实施计划

> 前置：父任务阶段 1 已完成（`apps/api/vitest.config.mts`、`apps/web/vitest.config.ts` 与根域 `scripts/testing/vitest/vitest.repository.config.mts` 已就位，见 design 的 runner 归属与边界规则）。与 API 子任务共享 `run-test-owner.mjs`，同一时间只允许一个子任务改它。

## 0. 前置

- [x] 确认根配置可用：`pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts --passWithNoTests zzz-no-such-file`（已实测退出码 0；CI=1 下写出 `reports/junit-repository.xml`）。
- [x] 记录基线：`node scripts/testing/run-test-owner.mjs governance`、`... contracts`、`... delivery root` 三段输出与 file/test 计数，落盘 `research/baseline-root.log`。

## 1. 计划函数替换（先做，不加迁移）

- [x] 改 `governancePlan()`：`--experimental-strip-types --test <files…>` → `pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts <files…>`，cwd 从仓库根改为 `apiRoot`。Python 段不动。
- [x] 改 `contractsPlan()`：同上。
- [x] 改 `deliveryPlan()` 的 root / repository / app 三个 profile：Node 段同上；web profile 的 Python 段不动；integration profile 的构建顺序与 `test:assets` 调用不动。
- [x] 用现状 runner 跑 `scripts/testing/tests/run-test-owner.test.mjs`，记录预期失败点（应恰好是断言 plan 形状的那几处）。

## 2. owner 测试自身迁移

- [x] 迁移 `scripts/testing/tests/run-test-owner.test.mjs` 到 Vitest：`node:assert/strict` 保留，`node:test` 的结构（`describe`/`test`/`before`/`after`）映射到 Vitest。
- [x] 就地重写 plan 断言：校验命令名、参数数组、cwd、plan 冻结、失败传播（退出码与 stderr 匹配）。断言数量不得减少。
- [x] 验证：`pnpm --filter @imsweb/api exec vitest run --root ../.. --config <仓库根>/scripts/testing/vitest/vitest.repository.config.mts scripts/testing/tests/run-test-owner.test.mjs`（文件过滤参数相对 `--root`，即仓库根）。
- [x] 提交（计划替换与自身迁移同一提交，避免中间态长期存在）。

## 3. governance 域迁移

- [x] 迁移 `tests/development-environment.test.js`、`tests/ci-affected-workspaces.test.js`。
- [x] 验证：`node scripts/testing/run-test-owner.mjs governance`（含 Python 段）；计数比对。
- [x] 提交。

## 4. contracts 域迁移

- [x] 迁移 `tests/contracts/non-json-boundaries.test.mjs`、`scripts/contracts/tests/compile-route-inventory.test.mjs`、`scripts/contracts/tests/compile-frontend-route-metadata.test.mjs`。
- [x] 验证：`node scripts/testing/run-test-owner.mjs contracts`；计数比对。
- [x] 提交。

## 5. delivery 域迁移

- [x] 迁移 `tests/exchange-map-assets.test.js`、`tests/tauri-build-configuration.test.js`、`tests/tauri-device-delivery.test.js`。
- [x] 验证：`node scripts/testing/run-test-owner.mjs delivery root`、`delivery repository`、`delivery app`、`delivery web`；计数比对。
- [x] 提交。

## 6. 收口

- [x] `grep -rn "node --test\|experimental-strip-types" scripts/testing scripts/contracts tests`，确认只剩 Python 与文档。（已验证为空）
- [ ] `pnpm run test:infra`、`pnpm run check:root`、`pnpm run check:boundaries`。
- [x] `python3 -m unittest tests.test_workspace_boundaries tests.test_operations_docs`，确认零改动通过（Ran 37 tests OK，两个 Python 断言文件零改动）。
- [x] 填写 `verification.md`；`.trellis/spec/repository/ci.md` §6 与 `.trellis/spec/web/frontend/tauri-mobile-integration.md` §5 已改为新命令。
