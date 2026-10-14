# 验收：API 测试归类与同族合并（09-19-api-test-taxonomy）

分支 `chore/vitest-ui-and-test-taxonomy`（worktree `.worktrees/vitest-ui-and-test-taxonomy`）。
逐批证据见 `evidence/`：`verification-a1.md`、`a2-verification.md`、`a3-verification.md`、`a4-verification.md`、`bcd-verification.md`、`verification-merge.md`、`a1-rescan.md`。

## 提交序列

| 提交 | 内容 | 文件数 |
| --- | --- | --- |
| `1c446a60` | A1：server 第一批归类 | 24 |
| `f5a23cdf` | A2：server 第二批归类 | 26 |
| `2e7d919d` | A3：server 第三批归类 | 25 |
| `27828b24` | B/C/D：wiki、migration、assets+顶层归类 | 27 |
| `d65a0c25` | A4：server 第四批归类 | 27 |
| `17d4172f` | 同族合并（20 个目标，134 → 72 文件） | 104 |
| `1ddcee10` | A1 判据回扫（补两段二级分组） | 2 |
| `51d9d41e` | 修既有顺序依赖（chronicle 夹具目录） | 1 |

## 计数

| 项目 | 基线 | 结果 |
| --- | --- | --- |
| `apps/api/tests` 文件数 | 134 | **72** |
| 用例数 | 884 | 884 |
| server / wiki / migration / assets / 顶层 | 626 / 60 / 114 / 10 / 74 | 626 / 60 / 114 / 10 / 74（合并后按目录归属不变） |
| PG 关闭（整域） | 666 passed / 218 skipped | 666 / 218 |
| PG 开启（整域） | 884 passed | 884 passed |
| 整域墙钟 | 32.10s | 28.06s |

## 名字无损

- 归类批次：每批 `tools/check-batch-shape.py` 报告断言行多重集 0 变化、用例数不变、旧标题是唯一新标题的字面尾段（增广路匹配），无损失败 0。整名字面不变的条数按批统计（A1 58/119、A3 61/203 等）。
- 合并批次：20 个合并目标的用例全名多重集与各成员之和**逐字节相同**（块级作用域机制，成员内容除缩进外一字未改）。
- 回扫批次：2 文件、11 → 11（静态标题）、无损映射失败 0。

## 判据与治理

- 二级分组判据全库统一为「连续 ≥2 条共享同一 ≥3 词字面前缀」，由 `tools/scan-second-level.mjs` 全库扫描验证；7 段候选中 5 段带理由拒绝、2 段应用（`evidence/a1-rescan.md`）。
- `scripts/contracts/non-json-boundaries.manifest.json`：16 条 `test.file` 随合并重指向；1 条 `test.symbol` 随归类吸收前缀（`CONTENT-CHRONICLE-APPROVED-MEDIA-01`、`DELIVERY-MEDIA-02`）。
- `scripts/contracts/non-json-boundary-analysis.mjs` 的用例声明词表加入 `postgresTest`（合并后包装器用例写作真实导出名的形态），与 `apply-nested-taxonomy.mjs` 同口径。
- 脚本数：api 43 / 根 58 / web 21 未变，`pnpm run check:boundaries` 与 `tests.test_workspace_boundaries` 绿。

## 命令证据

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @imsweb/api exec vitest run`（PG 开） | 72 文件 / 884 通过 |
| `IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run` | 72 / 666 passed / 218 skipped |
| `pnpm exec vitest run --sequence.shuffle --sequence.seed=<n>` | 种子 20260919 / 7919 / 424242 / 20260920 均 884 通过 |
| `tsc -p apps/api/tsconfig.tests.json --noEmit` | exit 0 |
| `node scripts/contracts/check-non-json-boundaries.mjs` | 31 entries / 30 handlers，exit 0 |
| `node scripts/testing/run-test-owner.mjs api` | 70 文件 / 874 通过（CI 车道等价，排除 `tests/assets/**`） |
| `IMS_TEST_COVERAGE_ENABLED=true pnpm exec vitest run --exclude 'tests/assets/**'` | 70 文件 / 874，覆盖率四项过阈，exit 0 |
| pre-commit 全链（每次提交） | 绿 |

## 未决 / 不在本任务内

- 本任务只覆盖 API 域；根域、e2e、Web 单测的归类与收敛在兄弟任务 `09-19-root-web-test-taxonomy`。
- 分支尚未推送、未合并（`chore/vitest-ui-and-test-taxonomy` 基于 `release/v1.1`），CI 侧的验证留待推送后进行。
