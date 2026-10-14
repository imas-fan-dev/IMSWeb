# 覆盖率基线：API / Web / 根契约与治理

采集时间：2026-09-19
分支：`chore/vitest-test-unification`（worktree `.worktrees/vitest-test-unification`）
基点提交：`323e56f1`（本段改动尚未提交）
运行时：Node `v24.18.0`、pnpm `11.10.0`、vitest 与 `@vitest/coverage-v8` 均为 4.1.11
环境：PostgreSQL 可达 `127.0.0.1:5432`（生命周期默认回环 URL，未设 `IMS_TEST_POSTGRES_ENABLED`，即启用）；采集走命令行 `--coverage`，不设 `CI`，跑的是与 CI 相同的测试集
原始日志：`/tmp/api-ab-cov.log`、`/tmp/web-cov-final.log`、`/tmp/repo-{gov,con,del,all}-cov.log`（不入库）

## 口径

`coverage.include` 是唯一的分母来源。Vitest 4 的 v8 provider 默认只统计被测试加载过的文件，写定 `include` 才能把未被任何用例加载的源文件计入分母；Vitest 3 的 `all` 开关在 4 里已不存在。

| 执行域 | `coverage.include` | `coverage.exclude` | 分母（statements / branches / functions / lines） |
| --- | --- | --- | --- |
| API | `src/**` | `**/*.d.ts` | 15057 / 11012 / 2981 / 13703 |
| Web | `app/**` | `**/*.d.ts` | 13506 / 10928 / 4260 / 12081 |
| 根契约与治理 | `scripts/**` | `**/*.d.ts`、`**/*.json`、`**/*.sh` | 3884 / 3408 / 526 / 3292 |

`.json`（契约产物与清单）与 `.sh`（部署脚本）不是该域能用 v8 计覆盖的源码，写进 `exclude` 后既不再污染日志，也不再占用分母。测试文件不需要显式排除：它们匹配 `test.include`，而 Vitest 会把 `test.include` 追加进 `coverage.exclude`。

## 采集命令

```sh
# API（cwd apps/api）
pnpm exec vitest run --coverage

# Web
VITE_IMS_APP_TARGET=web pnpm --filter @imsweb/web exec vitest run --coverage

# 根契约与治理：仓库域由 apps/api 承载，--root 指向仓库根
pnpm --filter @imsweb/api exec vitest run --root ../.. \
  --config scripts/testing/vitest/vitest.repository.config.mts --coverage <files>
```

`pnpm run <script> -- --coverage` 不适用：透传的 `--` 会把 `--coverage` 变成位置过滤参数。

## 结果

### API 域

134 文件 / 884 用例，全部通过（PostgreSQL 启用，无跳过）。

| 指标 | 数值 | covered / total |
| --- | --- | --- |
| Statements | 76.66% | 11544 / 15057 |
| Branches | 66.15% | 7285 / 11012 |
| Functions | 84.03% | 2505 / 2981 |
| Lines | 79.74% | 10927 / 13703 |

墙钟（本地，连续两次紧邻运行，maxWorkers 4）：不带覆盖 32s，带覆盖 34s（+2s，约 +6%）。带 `CI=1`（maxWorkers 2）的完整运行 61s。

### Web 域

220 文件 / 1532 用例，全部通过。

| 指标 | 数值 | covered / total |
| --- | --- | --- |
| Statements | 70.5% | 9523 / 13506 |
| Branches | 67.85% | 7415 / 10928 |
| Functions | 67.32% | 2868 / 4260 |
| Lines | 73.43% | 8872 / 12081 |

墙钟（本地，maxWorkers 4）：不带覆盖 44s，带覆盖 53s（+9s，约 +20%）。四项数值与迁移前（骨架段采集）完全一致：Web 不在本次迁移范围内。

### 根契约与治理域：域级（合并运行）

`governance + contracts + delivery repository` 的 8 个文件 / 97 个用例一次跑完（这是 design 说的「该域」口径）。全部通过。

| 指标 | 数值 | covered / total |
| --- | --- | --- |
| Statements | 39.49% | 1534 / 3884 |
| Branches | 42.07% | 1434 / 3408 |
| Functions | 46.95% | 247 / 526 |
| Lines | 39.73% | 1308 / 3292 |

墙钟：不带覆盖 11s，带覆盖 53s。

### 根契约与治理域：CI lane 的三次调用（阈值实际作用的口径）

CI 的 repository lane 是三次独立的 `run-test-owner` 调用，各自一个 vitest 进程；`coverage.thresholds` 在每个进程结束时分别判定。同一份 `include` 让三次调用的分母完全相同，差别只在分子：

| CI 步骤 | 文件 / 用例 | Statements | Branches | Functions | Lines | 墙钟（无覆盖 → 有覆盖） |
| --- | --- | --- | --- | --- | --- | --- |
| `governance` | 4 / 62（当时的口径） | 11.92% (463/3884) | 12.99% (443/3408) | 11.40% (60/526) | 13.39% (441/3292) | 1s → 1s |
| `contracts` | 3 / 29 | 26.23% (1019/3884) | 28.31% (965/3408) | 35.17% (185/526) | 24.96% (822/3292) | 12s → 52s |
| `delivery repository` | 1 / 6 | 1.33% (52/3884) | 0.76% (26/3408) | 0.38% (2/526) | 1.36% (45/3292) | 1s → 1s |

**域级数值 39.73% lines 无法用作阈值**：`delivery repository` 只覆盖 45 行 `scripts/**`，却要面对同一个 3292 行的分母，任何大于 1 的门禁都会让 CI 红。因此该配置的阈值取三次调用的逐指标最小值下取整，见下节。（后续决定推翻了这个折中：该域不设覆盖率门禁、只产 JUnit，理由与代价见 `design.md` §7.3。）

## 阈值

起点一律取实测值下取整，只允许单调上调。

| 执行域 | Statistics | Branches | Functions | Lines | 判定口径 |
| --- | --- | --- | --- | --- | --- |
| API | 76 | 66 | 84 | 79 | 单次运行，域级即运行级 |
| Web | 70 | 67 | 67 | 73 | 单次运行，域级即运行级 |
| 根契约与治理 | 1 | 0 | 0 | 1 | 三次调用的最小值（`delivery repository` 绑定） |

## 覆盖率开销（AC6）

| 命令 | 不带覆盖 | 带覆盖 | 差值 |
| --- | --- | --- | --- |
| `pnpm exec vitest run`（API，884 例） | 32s | 34s | +2s（+6%） |
| Web unit（1532 例） | 44s | 53s | +9s（+20%） |
| 仓库域 8 文件（97 例） | 11s | 53s | +42s（约 5x） |
| 仓库域 `contracts`（3 文件，29 例） | 12s | 52s | +40s（约 4.3x） |

API 偏 IO（数据库），Web 偏 DOM，覆盖开销可忽略；仓库域的 `contracts` 是 CPU 密集（TypeScript 解析）且用满了 V8 精确块覆盖的代价，纯 CPU 探针实测约 7.6x（5e7 次循环 33ms → 252ms）。这一项直接决定根契约与治理域的 `testTimeout: 60_000`，理由见 design §7.4。

## 未采信的口径

Web 骨架段记录过一次「带覆盖 49.4s、不带覆盖 82.0s」的对比，那是 Vite 转换缓存冷热造成的，不是覆盖率开销；本表所有 A/B 都在同一缓存热态下紧邻执行。
