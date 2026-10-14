# 根契约与治理套件迁移到 Vitest

> 父任务：`.trellis/tasks/09-19-vitest-test-unification`。共享决策见父任务 `design.md` §1 与 §3。

## Goal

把仓库根 `tests/` 与 `scripts/**/tests/` 下由 Node test runner 承载的用例迁移到 Vitest，使根执行域内 `node --test` 与 `--experimental-strip-types` 消失，并保持 Python `unittest`、Playwright、owner 分派与治理断言不变。

## Background

待迁移文件（9 个测试文件，两段计划）：

- governance 计划：`tests/development-environment.test.js`、`tests/ci-affected-workspaces.test.js`、`scripts/testing/tests/run-test-owner.test.mjs`。
- contracts 计划：`tests/contracts/non-json-boundaries.test.mjs`、`scripts/contracts/tests/compile-route-inventory.test.mjs`、`scripts/contracts/tests/compile-frontend-route-metadata.test.mjs`。
- delivery 计划：`tests/exchange-map-assets.test.js`、`tests/tauri-build-configuration.test.js`、`tests/tauri-device-delivery.test.js`。
- 不迁移：`tests/test_*.py`（Python unittest，9 个文件）、Playwright。

耦合点：

- `run-test-owner.mjs` 的三个计划函数直接拼 `node [--experimental-strip-types] --test <files…>`。
- `scripts/testing/tests/run-test-owner.test.mjs` 断言这些计划的命令、args、cwd、冻结性与错误信息，是「测试自身调度的测试」，迁移顺序错了会红两边。
- `tests/test_operations_docs.py:120-122` 断言 `test:infra` 包含 `node scripts/testing/run-test-owner.mjs governance`。
- `tests/test_workspace_boundaries.py:222-237` 强制 script 计数（root 57 / api 43 / web 21）并拒绝 `test:all`、`test:fast` 等别名。

## Requirements

- R1：上述 9 个文件由 Vitest 执行；`node --test` 与 `--experimental-strip-types` 从 `run-test-owner.mjs` 与 package scripts 消失。
- R2：Python 段保持原命令与顺序；`governance` owner 语义仍是「规则与契约检查」，只是 Node 段换 runner。
- R3：`run-test-owner.test.mjs` 的断言逐条重写，断言强度不降（仍校验命令、参数、cwd、plan 冻结、失败传播）。
- R4：package script 数量不变；root 不新增别名。
- R5：delivery 三个 profile（root / repository / app / web / integration）的边界与调用方（CI lane）不变。
- R6：`tests/test_operations_docs.py`、`tests/test_workspace_boundaries.py` 中与本次改动相关的断言同步更新，其余不动。

## Acceptance Criteria

- [ ] AC1：`node scripts/testing/run-test-owner.mjs governance | contracts | delivery root | delivery repository | delivery app` 全部通过。
- [ ] AC2：`grep -rn "node --test\|experimental-strip-types" scripts/testing scripts/contracts tests` 只命中 Python 或文档，不命中任何计划函数。
- [ ] AC3：`scripts/testing/tests/run-test-owner.test.mjs` 在 Vitest 下通过，断言数量与覆盖面不低于迁移前。
- [ ] AC4：`pnpm run test:infra`、`pnpm run check:root`、`pnpm run check:boundaries` 通过。
- [ ] AC5：`python3 -m unittest tests.test_workspace_boundaries tests.test_operations_docs` 通过（计数与字符串断言已同步）。
- [ ] AC6：root / api / web 的 script 数量仍为 57 / 43 / 21。

## Out of Scope

- Python unittest 迁移。
- CI lane 的切换条件、affected-workspace 检测逻辑重构。
- delivery integration 的构建顺序调整。

## Dependency

依赖父任务阶段 1 的根 `vitest.config.mts`。与 API 子任务无顺序依赖，但两者都修改 `run-test-owner.mjs`，同一时间只应有一个在改该文件，顺序写入父任务 `implement.md`。
