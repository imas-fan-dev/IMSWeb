# API 测试套件迁移：实施计划

> 前置：父任务阶段 1 已完成（`apps/api/vitest.config.mts` 存在且边界规则已放行，`vitest` 与 `@vitest/coverage-v8` 已装）。每批一个提交。

## 0. 批次前置

- [ ] 确认 `apps/api/vitest.config.mts` 可用：`pnpm --filter @imsweb/api exec vitest run --passWithNoTests`。
- [ ] 记录基线：`pnpm --filter @imsweb/api run test 2>&1 | tee research/baseline-api.log`，提取 file/test/skip/duration。
- [ ] CJS interop 冒烟：写一个临时 ESM 测试 import `../contracts/runtime-contracts.js` 与 `../postgres-test-lifecycle.js` 的具名导出，跑通后删除；失败则启动 helper 改名 `.mjs` 分支并记录到 `research/batch0-smoke.md`。

## 1. 批次 A：`tests/server`（含生命周期包装器）—— 已完成 `af81a955`

**划分依据（实测，2026-09-19）**：`test:server` 是 `node --test tests/server/*.test.ts` 一个 glob，同目录不能混跑两个 runner；同时 `postgresTest` 与两个连接工厂的调用点要等所有consumer 都迁到 Vitest 后才能改写。所以“只改包装器”不是一个可独立提交的状态，包装器改写与整目录迁移必须是同一个提交（102 个文件，含 34 个 PG 文件）。

- [ ] 拆分 `tests/integration/postgres-harness.ts`：只留 runner 中立的 `createPostgresTestHarness`、`PostgresTestHarness` 与 `postgresIntegrationEnabled`；删除 `node:test` 导入、`postgresTest` 导出与模块级 `after(closeSharedPostgresTestAllocator)`。它仍被 4 个 `tests/migration` 文件（本批仍跑 node:test）导入，因此**不得**在这个模块里静态 import `vitest`。
- [ ] `tests/server/postgres-test-database.ts` 变成唯一的 Vitest 适配器：`postgresTest(name, body)` 包装、`createPostgresTestDatabase(label)`、`connectPostgresTestDatabase(connection)`、`afterAll(closeSharedPostgresTestAllocator)`，清理用 `onTestFinished`。
- [ ] 17 个原先从 harness 取 `postgresTest` 的 server 文件改从该适配器导入；17 个使用 `createPostgresTestDatabase(t, label)` 的文件去掉 `t` 与 body 参数。
- [ ] 4 个 `tests/migration` 文件（`cms-article-title-backfill`、`fudaba-metadata-import`、`namecard-unification-reconcile`、`postgres-migrations`）各自用 node:test 的 `after(closeSharedPostgresTestAllocator)` 注册进程收尾，补回原本由 harness 模块级钩子承担的语义（已确认这 4 个文件不用 `postgresTest`）。
- [ ] 迁移 `tests/server` 的 102 个文件：`node:test` → `vitest`，`nodeTest` 别名替换，`t.after` → `onTestFinished`，`t.mock` → `vi.*`，`t.diagnostic` → `ctx.task.meta`，`t.test` → 嵌套 `test`；25 个 CJS `.js` 测试文件 ESM 化（`require` → `import`），helper 保持 CJS。
- [ ] 切换 `test:server` 为 `vitest run tests/server`（保留前面的 `tsc -p tests/server/tsconfig.json --noEmit`，到批次 E 再并入 `tsconfig.tests.json`）。
- [ ] 验证：迁移前后各跑一次 `pnpm --filter @imsweb/api run test:server`（627 用例基线）、`IMS_TEST_POSTGRES_ENABLED=false` 再跑一次（167 skipped 基线）、`pnpm --filter @imsweb/api run test:migration`（4 个文件仍 node:test）、`pnpm --filter @imsweb/api run typecheck`。
- [ ] 记录本批 file/test/skip 到 `verification.md`，提交。

## 2. 批次 B：`tests/wiki` —— 已完成 `841830bd`

- [ ] 迁移 7 个文件；保留 wire conformance 与 `schema.parse` 断言原样。
- [ ] `test:wiki` 改为 `vitest run tests/wiki`（保留前面的 `tsc -p tests/wiki/tsconfig.json --noEmit`）。
- [ ] 验证：`pnpm --filter @imsweb/api run test:wiki`（60 用例基线）；计数比对；提交。

## 3. 批次 C：`tests/migration` —— 已完成 `9ad5a5b3`

- [ ] 迁移 18 个文件；4 个 harness 文件把本批在批次 A 加的 node:test `after(...)` 换成 Vitest 的 `afterAll(...)`（runner 中立的 harness 模块不为它们注册收尾钩子）。
- [ ] `test:migration` 改为 `vitest run tests/migration`，删除硬编码清单。
- [ ] 验证：`pnpm --filter @imsweb/api run test:migration`（114 用例基线）；PG 启用与 `IMS_TEST_POSTGRES_ENABLED=false` 两条路径；`pnpm run check:pre-commit` 的 migration 快检仍通过；提交。

## 4. 批次 D：`tests/assets`、顶层 5 文件与 owner plan —— 已完成 `e232e68f`

- [ ] 迁移 `tests/assets/*.test.js`（2）与顶层 5 个文件（`hono-app-contract`、`node-listener-probe`、`node-security`、`operation-scripts`、`postgres-test-lifecycle`）。这 7 个都是 CJS `.js`，需要 `require` → `import`。
- [ ] 若某个顶层测试加载的 CJS 脚本在 `require` `.ts` 源码（`operation-scripts`、`node-listener-probe` 最可能），按批次 C 的定案在文件顶部 `import 'tsx/cjs';` 并注明理由；不要改 config，也不要引入全局 setup。
- [ ] 注意 `tests/node-security/fixture.js` 是 CJS helper，按批次 0 已验的 interop 结论保持 CJS。
- [ ] 与迁移同批改 `run-test-owner.mjs` 的 `apiPlan()` Node 段（`node --test <apiNodeTests>` → vitest 调用）并同步 `scripts/testing/tests/run-test-owner.test.mjs` 的 API 断言（该文件的自举顺序见父任务 design §3）。
- [ ] `test:assets` 改为 `vitest run tests/assets`。
- [ ] 验证：`vitest run tests/assets tests/*.test.js`；`node scripts/testing/run-test-owner.mjs api node`；计数比对；提交。

## 5. 批次 E：脚本、typecheck、适配器归属与 plan 收口 —— 已完成 `e68e25b6`

批次 A–D 完成后，本批只剩 `test:node` 一个脚本名未换（`test:server` / `test:wiki` / `test:migration` / `test:assets` 已在各自批次同名替换，脚本总数仍 43）。

- [ ] 迁移 `tests/server/postgres-test-database.ts` 到 `apps/api/tests/postgres-test-database.ts`（与同样被多套件共享的 `tests/postgres-test-lifecycle.js` 并列），同步 16 个 `tests/server` 文件与 `tests/node-security.test.js` 的导入路径。理由：批次 D 让顶层套件也用它，而它是共享测试基础设施，不属于“Hono 行为与服务边界”的 `tests/server`；文件名保持不变，使改动退化为路径替换。

- [ ] 替换 `apps/api/package.json` 的 `test:node` / `test:server` / `test:wiki` / `test:migration` / `test:assets`（同名替换，数量仍 43）。
- [ ] 新增 `apps/api/tsconfig.tests.json`（extends `tsconfig.server.json`，`rootDir: "."`，include `src/**/*.{ts,tsx}` + `tests/**/*.ts`），挂进现有 `typecheck`。
- [ ] 删除 `tests/server/tsconfig.json`、`tests/wiki/tsconfig.json` 的脚本用法（文件本身可留作 IDE 用途，但不再被脚本调用；若保留，需在 spec 中说明为何保留）。
- [ ] 更新 `run-test-owner.mjs` 的 `apiPlan()`：去掉 `--test` 与 api 文件清单，改为一次 vitest 调用；保持 build 先于测试的顺序。
- [ ] 更新 `scripts/testing/tests/run-test-owner.test.mjs` 的 API plan 断言（命令、args、cwd、冻结性、错误信息）。
- [ ] 校正 `docs/development/testing.md` 的 script 计数与 runner 描述。**待统一文档批次**：该文件同时描述根/契约/交付与 Web 域，等根套件子任务与 reporting 子任务落地后一次改完，避免三个子任务各改一遍。
- [x] `.trellis/spec/api/backend/testing.md` 四节已同步（Test ownership、Signatures、Contracts、Tests Required）。
- [ ] 验证：
  - [ ] `pnpm --filter @imsweb/api run test`
  - [ ] `node scripts/testing/run-test-owner.mjs api node`
  - [ ] `pnpm run check:pre-commit`
  - [ ] `grep -rn "node --test\|experimental-strip-types\|--import tsx" apps/api/package.json scripts/testing/run-test-owner.mjs`
- [ ] 提交。

## 7. 收口

- [ ] `pnpm run test:web-routing`（delivery integration）。
- [ ] 填写 `verification.md`：每批 file/test/skip 前后对照表、类型门禁证据、PG 启用与禁用两条路径证据、`node --test` 消失的 grep 证据。
- [ ] 更新 `.trellis/spec/api/backend/testing.md` 的 Test ownership、Signatures、Contracts、Tests Required 四节。
