# API 测试套件迁移到 Vitest

> 父任务：`.trellis/tasks/09-19-vitest-test-unification`。共享技术决策见父任务 `design.md`，本文件只记本子任务的需求与验收。

## Goal

把 `apps/api/tests/` 下的全部用例与 PostgreSQL 测试生命周期从 `node --test` 迁移到 Vitest，使 API 执行域内 `node --test` 完全消失，同时保持断言强度、运行时保真与治理约束。

## Background

- 规模：109 个 `.test.ts` + 25 个 `.test.js`（含顶层 5 个、`tests/assets` 2 个），830 个顶层用例；122 个文件 `import node:test`。
- 耦合面：`t.after` 87 处、`t.mock` 8 处、`mock.timers` 3 处、`t.diagnostic` 2 处、`t.test` 子测试 1 处、回调参数 `(t)` 226 处。
- PostgreSQL：39 个测试文件使用 PG 辅助；两个包装器 `tests/server/postgres-test-database.ts`（TestContext 适配器）与 `tests/integration/postgres-harness.ts`（显式 close 适配器）；核心 `tests/postgres-test-lifecycle.js`（478 行 CJS）与其 `.d.ts`。
- 包是 `"type": "commonjs"`；探针已确认 `require('vitest')` 抛错、`.js` 文件内 ESM 语法可用，所以 25 个 JS 测试文件 ESM 化，包类型不动。
- 类型门禁现在是两套 per-suite `tsc --noEmit`（`tests/server/tsconfig.json`、`tests/wiki/tsconfig.json`，都 include `src/**`）。
- 脚本现状：`test:node`（owner 计划里的 5 文件 `node --test`）、`test:server`、`test:wiki`、`test:migration`（18 文件硬编码清单）、`test:assets`。
- 依赖前置：需要父任务阶段 1 的 `apps/api/vitest.config.mts` 已存在，且 `scripts/check-workspace-boundaries.mjs` 的 retired Worker 清单已放行该路径（详见本子任务 design 的说明），`vitest` 与 `@vitest/coverage-v8` 已在 `apps/api` 声明并安装。

## Requirements

- R1：全部 API 用例由 Vitest 执行；`apps/api/package.json` 与 `run-test-owner.mjs` 的 API 计划中不再出现 `node --test`、`tsx` 加载器与 `--experimental-strip-types`。
- R2：PostgreSQL 生命周期契约按父任务 design §2.3 的映射改写，spec 的 Signatures 与 Contracts 两节同步更新，contract row 覆盖不回退。
- R3：测试文件 ESM 化；不得出现 `require('vitest')`。
- R4：类型门禁等价：单一 `tsconfig.tests.json` 覆盖 `src` 与 `tests/**/*.ts`，挂在现有 `typecheck` 脚本上。
- R5：脚本用同名替换，`apps/api` script 数量仍为 43；`test:migration` 不再维护 18 文件清单。
- R6：`scripts/testing/tests/run-test-owner.test.mjs` 中断言 API plan 形状的用例同步更新，不删断言。
- R7：并发上限以实测为准，不为跑快而放宽隔离。

## Acceptance Criteria

- [ ] AC1：`pnpm --filter @imsweb/api run test` 全绿，file/test/skip 与 `research/baseline-api.log` 可比对，差异有解释。
- [ ] AC2：`grep -rn "node --test\|experimental-strip-types\|--import tsx" apps/api/package.json scripts/testing/run-test-owner.mjs` 无 API 相关命中。
- [ ] AC3：`IMS_TEST_POSTGRES_ENABLED=false` 时 PG 用例全部按共享 reason 跳过；启用时 39 个 PG 文件全部通过；生命周期自身的契约用例全绿。
- [ ] AC4：`pnpm --filter @imsweb/api run typecheck` 通过，且 tests 下 TS 文件仍在覆盖范围内。
- [ ] AC5：`grep -rn "require('vitest')" apps/api/tests` 无命中；25 个 JS 测试文件在 Vitest 下通过。
- [ ] AC6：`scripts/testing/tests/run-test-owner.test.mjs` 通过，且断言强度未降低（仍校验命令、参数、cwd、冻结性）。
- [ ] AC7：`pnpm --filter @imsweb/api run check:architecture` 与 `pnpm run check:boundaries` 通过。
- [ ] AC8：`pnpm run test:web-routing`（delivery integration）通过，证明打包产物行为未变。

## Out of Scope

- 新增测试覆盖、断言升级、用例合并或拆分。
- PostgreSQL 生命周期核心的行为改动（只改清理注册方式）。
- 生产代码、wire contracts、迁移脚本行为变更。
- Web 与根契约域的迁移（各自子任务）。

## Dependency

本子任务的批次 A 依赖父任务阶段 1 的配置与依赖安装完成；批次 F 与根契约子任务无顺序依赖。
