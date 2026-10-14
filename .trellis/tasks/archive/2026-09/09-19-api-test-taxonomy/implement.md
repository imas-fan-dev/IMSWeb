# 实施计划：API 测试归类

## 0. 启动前

- [x] 0.1 确认在 worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`（分支 `chore/vitest-ui-and-test-taxonomy`，HEAD `874d4e6f`）内施工，主检出不动
- [x] 0.2 确认前置：`09-19-root-vitest-ui` 已落地（根 UI 面板可用于人工核对层级）
- [x] 0.3 采集基线到 `evidence/baseline.md`：各目录文件数与用例数（server 102/626、wiki 7/60、migration 18/114、assets 2/10、顶层 5/74），以及 `IMS_TEST_POSTGRES_ENABLED=false` 的 666 passed / 218 skipped（含逐目录分布）
- [x] 0.4 **先验证 JSON reporter 字段**：对 `tests/wiki`（7 文件 / 60 用例）跑 `pnpm exec vitest run tests/wiki --reporter=json --outputFile=…`，确认 `testResults[].assertionResults[]` 带 `ancestorTitles` / `fullName` / `title` / `status`，且 **`fullName` 含 describe 前缀**（`ancestorTitles + title` 以单空格拼接）。字段事实见 `evidence/baseline.md` §3
- [x] 0.5 采集脚本落到 `.trellis/tasks/09-19-api-test-taxonomy/tools/`（`collect-test-names.mjs` 等 6 个工具 + `a1-plan.json`），并产出 `evidence/names-*-before.txt` / `-after.txt`

## 1. 批次 A：tests/server（102 文件 / 626 用例）

**A1 切片（确定性顺序）**：`tests/server` 下 25 个最小 basename（字节序），即
`about-page-content` … `fudaba-card-placement-routes`（含 `client-address`，该文件已合目标形状、本轮零改动）。
完整清单与逐文件计数见 `evidence/verification-a1.md` §1、§3。A1 = 25 文件 / 119 用例。

- [x] 1.1 A1：25 文件归类（24 文件实改）→ 单跑 + 目录跑 + 名字 diff → 证据留档，**未提交**（等评审）
- [x] 1.2 A2：第 2/4 文件，同上
- [x] 1.3 A3：第 3/4 文件，同上
- [x] 1.4 A4：剩余文件，同上
- [x] 1.5 批次收口：`tests/server` 102 文件 / 626 用例，名字集合与 before 一致，禁用 PG 路径跳过数一致

### A1 记录（评审材料）

- 验收：`test:server` 102/626 全绿；`IMS_TEST_POSTGRES_ENABLED=false` 459 passed / 167 skipped；`tsc -p tsconfig.tests.json` 干净。三条命令均 exit 0。
- 名字：`tests/server` 文件数、用例数不变；**无损 100%**（每条新用例名都是旧整名的字面尾段，无改写/丢词/换序）；整名字面相等 565/626（A1 内 58/119），其余 61 条（A1 内 61/119）只多了 describe 路径，逐条前后对照见 `evidence/names-diff-server.md`。
- 内容形状：`tools/diff-content-shape.mjs` 证明 diff 只含 48 行 wrapper、14 行 vitest import、54 行改名，`unexpected: 0`。
- 二层的可检性结论：A1 内 **没有**可用的连续行为类别（≥5 用例的文件里候选类别都不连续，成组需要换序或产生同名兄弟 suite），故 A1 只做了对象层。详见 `evidence/verification-a1.md` §5。
- 偏离 design 的两点（需评审裁决）：① `postgresTest` 是普通函数而非 Vitest `TestAPI`，7 个 `postgresTest as test` 文件里不存在 `test.describe`，改用具名 `describe` 并在既有 `vitest` import 里加一个词；② 多行模板字面量的内部行不重排缩进，以免改动字符串值。
- **待裁决**：R3「拼接名集合逐字节不变」与「保留原名放在对象级 describe 下」互斥（design 自己的示例 `polls`→`polling` 同样改变了拼接名）。A1 采用「无损 100% + 逐条列出加前缀的用例」，严格读法的备选与代价见 `evidence/verification-a1.md` §4。

## 2. 批次 B：tests/wiki（7 / 60）

- [x] 2.1 5 个 contract 文件已有 describe——只做增量补齐，不推倒重写
- [x] 2.2 验收 + 提交

## 3. 批次 C：tests/migration（18 / 114）

- [x] 3.1 归类（注意这 18 个文件带 `import 'tsx/cjs';` 钩子与 CJS 脚本加载，只动层级）
- [x] 3.2 验收 + 提交

## 4. 批次 D：tests/assets（2 / 10）+ 顶层 tests/*.test.ts（5 / 74）

- [x] 4.1 归类；assets 的 `[AST-01]` 前缀作为类别名保留原样（它是用例编号语义）
- [x] 4.2 验收 + 提交

## 5. 收口

- [x] 5.1 `pnpm --filter @imsweb/api run test`：134 文件 / 884 用例全绿
- [x] 5.2 `IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run`：666 passed / 218 skipped
- [x] 5.3 全量名字集合 diff 为空（`evidence/names-all-before.txt` vs `-after.txt`）
- [x] 5.4 `python3 -m unittest tests.test_workspace_boundaries`、`pnpm run check:boundaries` 绿
- [x] 5.5 AC1 扫描：无「0 describe 且 ≥5 用例」的文件
- [x] 5.6 写 `verification.md`（计数表、名字 diff、补词清单、门禁输出）
- [ ] 5.7 更新 `.trellis/spec/api/backend/testing.md` 的归类约定；归档子任务

## 验收命令

```
pnpm --filter @imsweb/api exec vitest run tests/server
pnpm --filter @imsweb/api exec vitest run tests/server --reporter=json --outputFile=/tmp/names-after.json
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run
pnpm --filter @imsweb/api run test
python3 -m unittest tests.test_workspace_boundaries
pnpm run check:boundaries
```

（额外 flag 一律走 `pnpm exec vitest run`，不要写 `pnpm run <script> -- --flag`。）

## 回滚点

| 提交 | 回滚 | 影响 |
| --- | --- | --- |
| A1–A4 | 按块 revert | 只影响该块文件的层级 |
| B / C / D | 按批 revert | 同上，各批互不依赖 |

## Batch C：收敛合并（2026-09-19 追加，用户选择 C）

执行依据：`tools/merge-plan-c.json`（族 → 成员 → 目标文件 → 用例数/时长/风险）。

- [x] **C0 前置**：分类批次 A1–A4/B/C/D 全部落地并提交（合并必须建立在已完成 describe 的文件上）；确认工作区干净。
- [x] **C1 server 域**：按 plan 合并 20 个目标中的 `server/*`（含 `platform-email` 98 用例、`fudaba` 86 用例两个最大目标，建议拆成两个子批次）。每个目标：拼接 describe 块 → 合并 import（同模块并具名绑定，重复 `import 'tsx/cjs'` 只留一次）→ `vi.mock` 冲突检测 → 删除被吸收的原文件（`git rm`）。
- [x] **C2 顶层与其余目录**：`apps/api/tests/*.test.*` 合成 `node.test.js`，并更新 `apiNodeTests` 与冻结断言；`tests/migration`、`tests/wiki`、`tests/assets` 按 plan 合并（migration 保留 `import 'tsx/cjs';` 于首条）。
- [x] **C3 契约与文档治理**：更新 16 条 `test.file`、两份 testing 文档的路径引用；`node scripts/contracts/check-non-json-boundaries.mjs` 与 `pnpm run check:rules` exit 0。
- [x] **C4 隔离验证**：每个合并目标 `--sequence.shuffle` 复跑（失败则回退该族并记录），逐族留证到 `evidence/c-shuffle-*.txt`。
- [x] **C5 全量验收**：`pnpm --filter @imsweb/api exec vitest run`（PG 开）、`IMS_TEST_POSTGRES_ENABLED=false` 版本、`CI=1 IMS_TEST_COVERAGE_ENABLED=true pnpm --filter @imsweb/api run test`（覆盖率四项 ≥ 76/66/84/79 且墙钟 ≤ 基线）、`tsc -p tsconfig.tests.json --noEmit`、`node scripts/testing/run-test-owner.mjs governance`。
- [x] **C6 收口**：全名集合逐字节比对证据、前后文件数对照、CI 墙钟对照写入 `evidence/verification-c.md`；父任务 prd 的 R7 验收勾选。

回滚：按族回退（`git checkout -- <该族成员>` + `git rm <合并文件>`），不牵动其它族；C1/C2/C3 各成一个提交，便于单点回退。
