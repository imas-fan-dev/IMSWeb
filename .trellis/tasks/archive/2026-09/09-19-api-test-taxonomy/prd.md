# API 测试归类（test.describe 两层分组）

## Goal

把 `apps/api/tests` 的 134 个文件（125 个完全平铺、829 个顶层 `test`）按「顶层 `describe` = 被测主体，二级 `describe` = 行为类别」两层归类，使 Vitest UI 面板与 JUnit 报表能反映真实层级。归类**只动结构**：用例名去掉已提取的前缀后逐字保留，且每条旧全名必须原样出现在新全名的末尾（无损：或整名逐字不变，或仅前面多出 describe 路径），用例数不减少。

## Background

- 普查（2026-09-19）：api 134 文件 / 829 顶层 `test`，仅 9 个文件已有 `describe`（`client-address`、`node-email-delivery-runner`、`platform-profile-wire-contract-conformance`、wiki 的 5 个 contract 文件）。
- 目录分布与基线计数：`tests/server` 102 文件 / 626 用例、`tests/wiki` 7 / 60、`tests/migration` 18 / 114、`tests/assets` 2 / 10、顶层 `tests/*.test.ts` 5 / 74，合计 134 / 884。
- API 现在用「重复主语前缀」表达层级，例如 `test('email delivery runner polls immediately and enforces bounded concurrency')`、`test('email delivery runner serializes lease renewals')`——同一个文件里主语被抄了十几遍。这正是 `describe` 要吸收的部分。
- `test.describe` 在 Vitest 4.1.11 实测可用（两层嵌套、`for` 循环内动态注册均通过）；用 `import { test } from 'vitest'` 的文件免改 import，但 `postgresTest as test` 这类文件里的 `postgresTest` 是包装函数而非 Vitest 的 `TestAPI`，没有 `.describe` 方法，只能加具名 `describe`（见 Confirmed Decisions 3）。
- Vitest 的 `fullName` 恒等于 `[...ancestorTitles, title].join(' ')`（`tests/wiki` 实测），所以**只要 describe 的主体不是该用例名的字面前缀，全名必然会变长**——「全名集合逐字不变」与「用 describe 归类且不新造语义」在数学上互斥，必须改用无损判据（见 R3）。
- 断言风格是 `node:assert/strict`，`for (const entry of entries) { test(entry.name, ...) }` 这类动态注册大量存在（迁移前统计 217 处 `for (const` 循环），归类必须支持它们。
- 迁移期约束已消失：同域现在都跑 Vitest，所以**按文件分批是安全的**，不必像迁移时那样按目录原子切换。

## Requirements

- **R1 两层结构**：每个文件至少有一个顶层 `describe` 承载被测主体（主体名取自然说法，不为凑字面前缀而退化命名）；文件内用例数 ≥5 时须判断是否补二级 `describe`，且仅当某行为类别的用例在文件里**连续出现 2 条以上**时才包二级：不重排用例、不产生同名兄弟 suite，单条用例留在主体层；结论（含「无连续同类，故不分二级」）写进该批证据。
- **R2 前缀提取**：主体名与类别名从现有用例名的公共前缀里取，**不新造语义**；用例名以主体/类别名开头时吸收该前缀，其余用例名**整名逐字保留**（含标点、大小写、专有名词）——不为对齐而改名。
- **R3 名字无损**：每个文件归类后，旧全名集合与新全名集合**一一对应**，且每条旧全名都是对应新全名的字面尾段（相等，或仅前面多出 describe 路径）；用例数不减、无重复、无丢词换序。「整名逐字不变」是首选结果而非硬约束，达成条数按批统计留档。
- **R4 归类只动结构**：不改断言、不动 fixture 与 `beforeAll/afterAll/onTestFinished` 的注册位置与顺序；唯一允许的 import 变化是把 `describe` 加进已有的 `vitest` 具名导入（仅限没有 `test.describe` 可用的文件）；多行模板字面量（SQL 正文等）内部不重排缩进，因为前导空白属于字符串内容；不引入 `describe.concurrent`、`describe.skip`、`.only`。
- **R5 分批交付**：按目录分批（见 implement.md），每批一个提交，批内不得留半迁移状态。
- **R6 机检证据**：采集以 runner 的 JSON reporter 为真值（`testResults[].assertionResults[].fullName`，采集器同时断言 `fullName === [...ancestorTitles, title].join(' ')`），输出「文件 → 全名集合」，归类前后按无损判据逐文件比对（整名逐字不变 / 加 describe 前缀 / 失败三类计数 + 逐条前后对照）；证据留在任务目录 `evidence/` 与 `verification.md`。TypeScript 7.0.2 没有 JS API（`ts.createSourceFile === undefined`），design 里的 AST 兜底路线不可用，JSON 已足够。

## Constraints

- 不把 `node:assert/strict` 改成 `expect`。
- 不改文件名/路径（JUnit `classname` 随路径，保持稳定）。
- 已有 `describe` 的 9 个文件只做「补齐主体/类别」的增量整理，不推倒重写。
- 不新增 package.json 脚本（根 58 / api 43 / web 21 的上限由 `tests/test_workspace_boundaries.py` 钉住）——采集工具是任务产物，放在任务目录下。
- PostgreSQL 相关用例的跳过路径（`IMS_TEST_POSTGRES_ENABLED=false`）跳过数必须不变。

## Acceptance Criteria

- [x] **AC1** `apps/api/tests` 下每个文件都有顶层 `describe`；用例数 ≥5 的文件在证据里都有「二级分组结论」（加了 / 因无连续同类而未加）。
- [x] **AC2** 各目录用例数与基线一致：server 626、wiki 60、migration 114、assets 10、顶层 74，合计 884。
- [x] **AC3** 每个文件的旧全名与新全名一一对应且为字面尾段（无损）；「整名逐字不变」的条数按批统计留档，无损失败必须为 0。
- [x] **AC4** `pnpm --filter @imsweb/api run test` 全绿（134 文件 / 884 用例）；`IMS_TEST_POSTGRES_ENABLED=false` 路径仍为 666 passed / 218 skipped。
- [x] **AC5** `python3 -m unittest tests.test_workspace_boundaries` 与 `pnpm run check:boundaries` 仍绿（证明没顺带加脚本或改依赖）。
- [x] **AC6** 提交按批次可读（每批只含该目录文件 + 必要注释），回滚单批不影响其它批次。

## Out of Scope

- 用例语义重写（人工起更有信息量的类别名）。
- 把 `describe` 用到三层（例外需在提交说明写明理由）。
- Vitest 配置、覆盖率阈值、JUnit 路径的改动。
- Web / e2e / 根域的归类（兄弟任务 `09-19-root-web-test-taxonomy`）。
- 测试并行化、`describe.concurrent`、fixture 重构。

## Confirmed Decisions

1. 采用「前缀提取」式机械归类，类别名不新造语义。
2. 最多两层；只对「用例数 ≥5 且存在连续 2 条以上同类」的文件补二级分组，避免无意义 churn；不为分组重排用例、不产生同名兄弟 suite。
3. 优先用 `test.describe`；仅当该文件的测试函数是 `postgresTest` 这类包装函数（没有 `.describe`）时，把 `describe` 加进已有的 `vitest` 具名导入（与仓库既有 `client-address.test.ts` 写法一致）。
4. 分批按目录：server → wiki → migration → assets+顶层。
5. 机检工具放任务目录，不进 package.json scripts。
6. R3 采用**无损判据**（旧名是新名的字面尾段 + 一一对应），而非「全名逐字不变」——后者与「用 describe 归类且不新造语义」数学上互斥（Vitest `fullName` 含 describe 路径）。「整名逐字不变」作为首选结果按批统计。
7. 主体名取自然说法（如 `about page` 而非 `about`），不为保住字面相等而退化命名。
8. 多行模板字面量（SQL 正文）内部不重排缩进。

## R7 收敛：合并同主题族的测试文件（2026-09-19 追加，用户选择 C 激进合并）

- **R7.1** api 域 134 个测试文件按「同目录 + 同扩展名 + basename 首个 kebab 段成族」合并；单个目标文件上限为 **120 条用例且单线程 20s**，超限时按二级前缀再切（`platform` 因此切成 `platform-email` / `platform-account` / `platform-oauth` / `platform-profile`）。单成员族保持原文件名，不新建「杂项」文件，不跨目录搬文件（否则 `test:wiki` / `test:migration` 的目录脚本失效）。
- **R7.2** 合并只改变「用例住在哪个文件」，不改变任何用例名：合并后所有 full name 与合并前**逐字节相同**（每个旧文件在族内保留自己的 describe 块）。因此契约登记的 `test.symbol` 不变，只有被搬家用例的 `test.file` 变（实测 16 条）。
- **R7.3** 合并必须带隔离验证：每个合并目标用 `--sequence.shuffle` 复跑；若某族合并后出现顺序相关失败，该族**回退为不合并**并在证据里记录，不静默放宽。
- **R7.4** 顶层 `apps/api/tests/*.test.*` 的 5 个文件同样适用（`node-*` 合成 `node.test.js`），随之更新 `scripts/testing/run-test-owner.mjs` 的 `apiNodeTests` 清单与 `scripts/testing/tests/run-test-owner.test.mjs` 的冻结断言。
- **R7.5** 合并后实测 API 域在 CI 条件下的墙钟（普通运行与开启覆盖各一次），不得慢于合并前基线；覆盖率阈值 76/66/84/79 不得下调。

追加验收：

- [x] api 域文件数 134 → **72**（20 个合并目标 + 52 个单成员文件），用例数 884 不变
- [x] 合并前后 full name 集合逐字节相同；契约校验器 exit 0，16 条 `test.file` 已更新
- [x] 每个合并目标的 shuffle 复跑通过（或该族回退且有记录）
- [x] 合并后 CI 条件墙钟 ≤ 合并前；覆盖率四项阈值不下调
- [x] `apiNodeTests` 清单与冻结断言同步更新且 governance owner 通过

执行计划见 `tools/merge-plan-c.json`（每族的成员、用例数、单线程时长、风险标记）。
