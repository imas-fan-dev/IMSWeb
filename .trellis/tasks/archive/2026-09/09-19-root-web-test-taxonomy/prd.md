# 根域 / Web / E2E 测试归类

## Goal

把父任务规则（顶层 `describe` = 被测主体，二级 = 行为类别，用例名逐字保留，最多两层）套用到 API 之外的三个执行域：根契约与治理（10 个文件，全平铺）、Playwright e2e（42 个 spec，38 个全平铺）、Web unit（只处理「单个 describe 塞了 ≥10 个 it」的文件）。同样只动结构，用例数与全名集合必须逐字不变。

## Background

- 普查（2026-09-19）：根域 `tests/` 7 文件 / 67 用例 + `scripts/**/tests` 3 文件 / 32 用例，0 个 describe；e2e 42 spec / 115 `test`，仅 4 个有 `test.describe`；Web unit 220 文件 / 1186 `it`，**已全部 describe 化**（202 个单 describe、18 个多 describe），其中「单 describe 内 ≥10 个 it」的文件是唯一值得二次分组的对象（如 `origin.test.ts` 27、`api.test.ts` 25、`api-dispatcher.test.ts` 22）。
- 根域跑在 Vitest 里，且 `test.describe` 免改 import（`import { test } from 'vitest'` 即可）；Playwright 有原生 `test.describe`；Web unit 现有写法是具名 `describe`/`it`，沿用不动。
- 根域迁移时保留了 `node:test` 的 `t.test` 形态：某些文件是「一个计数用的 wrapper 用例 + 每个 case 一个用例」，case 体因此执行两次。这是已知的历史包袱，本次**只归类、不去重**（去重是独立决策，超出本任务范围），wrapper 与原用例一起放进对应 `describe`。
- 迁移后 Web unit 的用例数基线是 1534（含 Web 侧新增用例），`it` 数 1186 是 `tests/unit` 子集，按执行时点重算。

## Requirements

- **R1 根域**：`tests/` 与 `scripts/**/tests` 的全部平铺文件按父任务规则归类（顶层主体 = 被治理的脚本/契约主题）。
- **R2 E2E**：e2e spec 补顶层 `test.describe`，主体 = 页面或流程（文件名通常已表达，如 `admin-accounts`）；一个 spec 覆盖多个流程时拆成 1–3 个顶层 describe。**不**引入 `describe.configure({ mode: 'serial' })`，不改任何 fixture 与 trace 配置。
- **R3 Web unit**：只对「单 describe 内 ≥10 个 it」的文件补二级 describe，类别名从既有 `it` 标题的公共前缀/主题提取；其余 200 余个文件不动。
- **R4 名字不变**：每域每批的「全名集合」与归类前逐字一致，用例数不减。
- **R5 分批交付**：根域两批（`tests/`、`scripts/**/tests`）、e2e 按页面前缀分 2–3 批、Web unit 一批；每批一个提交。

## Constraints

- 不改 `apps/web/tests/unit` 的断言风格（`expect`）与 Vitest 配置、覆盖率阈值。
- 不改 Playwright 的 project/worker/retry 配置；e2e 验证尽量用 `--list` 取证，需要实跑时按仓库既有做法 `CI=1 --workers=1 --retries=0`。
- 不新增 package.json 脚本；采集工具沿用父任务目录下的工具。
- 不碰 Python unittest 与文件路径/文件名（JUnit `classname` 稳定性）。

## Acceptance Criteria

- [x] **AC1** 根域 10 个文件不再有「0 个 describe 且 ≥5 用例」；治理段用例数不变（治理 owner 归类前后均为 5 文件 / 71 用例 + Python Ran 123 OK，见 verification.md §2）。
- [x] **AC2** e2e `--list` 输出的用例集合与归类前逐字一致（42 spec / 115 用例）。
- [x] **AC3** Web unit 用例数不变（220 文件 / 1534 用例），被处理的 5 个文件不再存在「单 describe ≥10 用例且有可用片段」的情形；无可用片段的 19 个文件按已确认阈值保持一级（判据细化见 verification.md §8）。
- [x] **AC4** `node scripts/testing/run-test-owner.mjs governance|contracts|delivery` 三条全绿；`pnpm --filter @imsweb/web run test:unit` 全绿。
- [x] **AC5** 触碰到的 e2e spec 实跑通过（`CI=1 playwright test --workers=1 --retries=0 <spec>`）。
- [x] **AC6** 名字集合 diff 为空，证据留档在 `verification.md`。

## Out of Scope

- 根域 wrapper/用例重复执行的去重（历史包袱，另立任务）。
- API 归类（兄弟任务 `09-19-api-test-taxonomy`）。
- e2e 的并行化、fixture 重构、断言重写。
- Python unittest 与 `apps/web/tests/e2e` 之外的 Web 测试形态改造。

## Confirmed Decisions

1. Web unit 只处理「单 describe ≥10 it」的文件，不做全量 churn。
2. e2e 只补顶层 describe（不加深层），保留 Playwright 既有配置。
3. 根域沿用 `test.describe`（免改 import）。
4. 根域 wrapper 结构保留，不在本任务里去重。
