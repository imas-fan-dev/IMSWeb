# 验收记录：09-19-vitest-test-unification

汇总主会话与三个子任务的验收证据。基线与命令见 `research/baseline.md`，分支与提交见 `implement.md` 的「Rebase 记录」。

## 1. 用例数比对（迁移前 → 迁移后）

| 域 / 段 | 迁移前 | 迁移后 | 差异 |
| --- | --- | --- | --- |
| governance：3 个 Node 契约测试 | node:test，3 文件 / 58（基线表口径） | Vitest，**4 文件 / 64**（59 + 5 个不变量用例） | +5 新增测试，见下方注 1 |
| governance：9 个 Python unittest 文件 | unittest，123 | 不变 | 0 |
| contracts：non-json-boundaries + 2 个编译产物流水线 | node:test，3 文件 / 29 | Vitest，3 文件 / 29 | 0 |
| delivery（root profile） | node:test，3 文件 / 未采集 | Vitest，3 文件 / 27 | 基线未采集，见注 2 |
| delivery（repository profile） | node:test，6 | Vitest，6 | 0 |
| delivery（app profile） | node:test，21 | Vitest，21 | 0 |
| api：顶层契约测试 | node:test，5 文件 / 74 | Vitest，5 文件 / 74 | 0 |
| api：tests/server | node:test，102 文件 / 627 | Vitest，102 文件 / **626** | **−1**，见注 3 |
| api：tests/wiki | node:test，7 文件 / 60 | Vitest，7 文件 / 60 | 0 |
| api：tests/migration | node:test，18 文件 / 114 | Vitest，18 文件 / 114 | 0 |
| api：tests/assets | 独立脚本，2 文件 / 10 | 并入全量 Vitest 运行 | +10 进入 API 域总数 |
| api 域合计（`test` 全量） | node:test，875 | Vitest，**134 文件 / 884** | +9 = +10（assets）−1（注 3） |
| web：tests/unit | Vitest，220 文件 / 1532 | Vitest，220 文件 / 1534 | +2 来自 release 的新测试 |
| Python 合计 | unittest，125（123 + 2） | 不变 | 0 |

注 1：`research/baseline.md` 把 governance 的 3 个 Node 文件记为 58，但迁移后同一组文件是 59，而 `tests/ci-affected-workspaces.test.js` 的用例表在迁移前后逐字相同（用例标题表达式一致、迁移 diff 只改了 import 与调用点）。因此 58 是基线采集时的计数错误，真实值 59；迁移后 64 = 59 + 5 个不变量用例，符合"用例数不减少"。
注 2：delivery root profile 的基线当时未采集，迁移后实测 27；它在迁移前后的用例表未变。
注 3：`apps/api/tests/server/node-email-delivery-runner.test.ts` 用 node:test 的 counted subtest 容器（父测试 + N 个子测试）表达一组场景，Vitest 没有对应的计数节点，改写为 `describe` + 独立测试后少 1 个容器用例，是“用例数不减少”规则里唯一被接受的例外（迁移时已在提交里记录）。该文件实际执行的断言数不变。

## 2. 跳过数与 PostgreSQL 关闭路径

| 口径 | 迁移前 | 迁移后 |
| --- | --- | --- |
| API，PostgreSQL 启用 | 875 例 / 0 跳过 | 134 文件 / 884 例 / 0 跳过 |
| API，`IMS_TEST_POSTGRES_ENABLED=false` | 875 例 / 597 通过 / **218 跳过** | 134 文件 / 666 通过 / **218 跳过** |

跳过数一致是"测试没被静默丢掉"的主要证据；跳过文案不比对，因为 node:test 的 spec reporter 只打印 `# SKIP` 而不打印原因，Vitest 的 `ctx.skip(reason)` 会把原因写进摘要。

## 3. 集成验收（2026-09-19，rebase 后）

| 命令 | 结果 |
| --- | --- |
| `pnpm run test`（根链：check:root、governance、contracts、delivery root + integration、完整 API、Web unit） | exit 0，**364s**；governance 4 文件 / 64 + Python `Ran 123`，contracts 3 / 29，delivery root 3 / 27 + Python `Ran 2`，delivery integration `test:assets` 2 / 10，API 134 / 884，Web 220 / 1534 |
| `pnpm run check:pre-commit` | exit 0，166s（此前只验证过它的组成部分，未作为单条命令跑过） |
| 三个 pre-commit 守护单独计时 | contracts 11s、API migration 4s、Web routes 1s，合计约 16s |
| `grep -rn -- "--test" package.json apps/*/package.json scripts/testing/run-test-owner.mjs` | 无命中 |
| `grep -rn "node:test" apps/api/tests tests scripts`（活代码） | 无命中，仅剩注释措辞已清理 |

`pnpm run test:web-routing` 与根链里的 `delivery integration` profile 是同一条命令，后者已在根链中通过。

## 4. 报表与覆盖率证据

见子任务 `09-19-vitest-reporting-coverage/verification.md`：API 通过方向 76.66 / 66.15 / 84.03 / 79.74 对阈值 79 / 66 / 84 / 76，Web 70.5 / 67.85 / 67.32 / 73.43 对 73 / 67 / 67 / 70，失败方向用单文件运行触发四条阈值报错并 exit 1，仓库域只产 JUnit。
