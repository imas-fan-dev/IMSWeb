# 统一测试执行到 Vitest 并接入报表与覆盖率

## Goal

把仓库里所有由 Node 内置 test runner 承载的用例迁移到 Vitest，让 `node --test` 从执行域完全退出，并让 API、根契约与治理、Web 三个执行域共用一套 runner 形态、统一产出 JUnit XML 与 v8 覆盖率报告，接入 CI artifact 与阈值门禁。

用户价值：一套 runner 降低认知与维护成本；报表与覆盖率从零到可用，回归可以被门禁拦住而不只靠人看。

## Background

### 执行域现状

| 执行域 | 位置 | Runner | 规模 |
| --- | --- | --- | --- |
| API | `apps/api/tests/` | `node --test` + `tsx` | 109 个 `.test.ts` + 25 个 `.test.js`，830 个顶层用例 |
| 根契约与治理 | `tests/`、`scripts/**/tests/` | `node --test`（部分 `--experimental-strip-types`） | 5 个 `.test.js` + 3 个 `.test.mjs` + 1 个 `scripts/testing/tests` |
| Web | `apps/web/tests/unit/` | Vitest 4.1.11 | 1184 个顶层用例 |
| 治理规则 | `tests/test_*.py` | Python `unittest` | 9 个文件，本次不动 |
| Web 浏览器 | `apps/web/tests/e2e/` | Playwright | 本次不动 |

### 已测定的迁移约束

- 122 个 API 测试文件 `import node:test`；39 个使用 PostgreSQL 测试辅助；另有 4 个非测试 helper 耦合 `node:test`：`tests/node-security/fixture.js`、`tests/integration/postgres-harness.ts`、`tests/integration/migration-catalog.ts`、`tests/server/postgres-test-database.ts`。
- 断言语汇以 `node:assert/strict` 为主（6145 处），清理依赖 `t.after`（123 处），mock 依赖 `t.mock`（11 处）与 `mock.timers`（3 处），`t.diagnostic`（2 处）。
- `apps/api/package.json` 是 `"type": "commonjs"`。本地探针（Vitest 4.1.11）确认：`.test.cjs` 里 `require('vitest')` 直接抛 `Vitest cannot be imported in a CommonJS module using require()`；同一 commonjs 包内的 `.test.js` 使用 `import` 语法可以正常执行并通过。因此 25 个 JS 测试文件必须 ESM 化，包本身的 `type` 可以不动。
- 同一探针确认 `onTestFinished` 在测试体内的包装函数里注册即可生效，清理按注册逆序在下一个用例前执行；`ctx.skip('<reason>')` 保留跳过原因并计入 skipped。这两点是 PostgreSQL 生命周期核心改写的前提。
- 报表与覆盖率现状为零：`.github/workflows/ci.yml` 只有 Playwright 失败证据的 artifact 上传（`:133`、`:179`），没有 coverage 或 JUnit 接线。`@vitest/coverage-v8` 未安装。
- `test.projects` 在 Vitest 4.1.11 可用（`TestProjectConfiguration[]`），但本任务不依赖它跨 workspace 聚合，理由见 design。
- 治理上限由 `tests/test_workspace_boundaries.py:222-237` 强制：root 57、api 43、web 21，禁止新增 `test:all`、`test:fast` 等别名；`docs/development/testing.md:24` 仍写 55/41/20，属既有漂移。
- 根 `package.json` 只允许声明 `husky` 作为 devDependency（`scripts/check-workspace-boundaries.mjs:22` 的 `allowedRootDevDependencies`，在 `:357-375` 强制）。实测确认安装后根 `node_modules/` 下没有 vitest，`node_modules/.bin` 里也没有它的二进制。因此根契约与治理域（子任务 2）的 runner 归属需要在实施前显式决定，方案与取舍见 design §1.1 与 §8 第 1 条；`@vitest/coverage-v8` 则只能声明在启用覆盖率的 workspace 内。
- 另有字符串级断言需要同步：`tests/test_operations_docs.py:120-122` 断言 `test:infra` 含 `node scripts/testing/run-test-owner.mjs governance`；`scripts/testing/tests/run-test-owner.test.mjs` 断言 owner plan 的 `--test` 参数与 cwd。
- 运行时保真不是可选项：API 测试跑真实 Node 与真实 PostgreSQL，delivery integration 刻意验证打包后的 `dist/server/main.js`。

### 子任务映射

| 子任务 | 目录 | 交付物 | 顺序 |
| --- | --- | --- | --- |
| API 测试套件迁移 | `09-19-vitest-api-suite` | API 134 个用例文件与 PostgreSQL 生命周期契约迁移 | 依赖报表配置骨架 |
| 根契约与治理套件迁移 | `09-19-vitest-root-suite` | 根 `tests/` 与 `scripts/**/tests/` 的 node:test 用例迁移 | 可与子任务 1 并行 |
| JUnit 报表与 v8 覆盖率接线 | `09-19-vitest-reporting-coverage` | 三域 reporter 与覆盖率统一、CI artifact、阈值门禁 | 配置骨架先行，阈值收口最后 |

## Requirements

### R1 API 执行域迁移

- `apps/api/tests/` 下的全部用例由 Vitest 执行，`apps/api/package.json` 与 owner plan 中不再出现 `node --test`。
- PostgreSQL 测试的启用判定、URL 优先级与回环校验、隔离命名、创建与迁移失败处理、幂等关闭、drain 观察、`AggregateError` 聚合在迁移后保持同等语义。
- API 侧的 TypeScript 类型门禁不得退化：现在由 `tests/server/tsconfig.json` 与 `tests/wiki/tsconfig.json` 各跑一次 `tsc --noEmit`，迁移后必须有等价覆盖。
- 25 个 CJS 测试文件完成 ESM 化；不得通过关闭隔离或外置依赖来绕过解析问题。

### R2 根契约与治理执行域迁移

- `tests/` 与 `scripts/**/tests/` 下所有 node:test 用例迁移到 Vitest。
- Python `unittest` 保持原样，`governance` owner 变为「Vitest + Python」两段，语义不变。
- `scripts/testing/tests/run-test-owner.test.mjs` 自身也在迁移范围内，自举顺序必须在 implement 中明确。

### R3 报表与覆盖率统一

- API、根契约、Web 三域产出 JUnit XML 与 v8 覆盖率报告，输出路径与命名一致。
- CI 上传报告 artifact 并在覆盖率低于阈值时失败；阈值以实测基线起步，只允许单调上调。
- Web 现有 Vitest 配置补齐同形 reporter 与 coverage 片段，避免三套写法。

### R4 运行时保真与断言等价

- 断言强度不得下降：`node:assert/strict` 与 `expect` 的差异逐处判定，语义更弱时保留原断言或改用等强度 matcher。
- 不合并、不拆分、不跳过既有用例来换取通过；用例数、跳过数的任何变化都必须在证据中解释。
- 迁移后必须重跑 delivery integration，证明打包产物行为未变。

### R5 治理约束保持

- package script 数量不新增：优先用同名替换。确需新增时同步 `tests/test_workspace_boundaries.py` 的计数并在提交说明中写明用途。
- owner 分派边界不变：`run-test-owner.mjs` 仍是调度层，CI lane 仍调用相同 owner 命令。
- pre-commit 快检保持「快」：迁移不得把全量 Vitest 放进 pre-commit。

### R6 文档与 spec 同步

- `docs/development/testing.md`、`.trellis/spec/api/backend/testing.md`（Signatures/Contracts 两节）、`.trellis/spec/web/frontend/testing.md`、`.trellis/spec/repository/ci.md` 在对应子任务内更新，不留给最后补。

## Constraints

- 不改变生产代码行为、HTTP wire contracts 与页面 UX。
- 不迁移 Python `unittest`，不迁移 Playwright，不引入 Vitest browser mode。
- `node --test` 必须最终消失，不接受长期双 runner 并存。
- 每批迁移必须可独立回滚：一个批次一个提交，配置与依赖提交独立。
- 数据库凭据、bucket 名与任何生产数据不得进入仓库。

## Acceptance Criteria

- [ ] AC1：API 执行域全部用例由 Vitest 运行，`node --test` 不再出现在 API 脚本与 owner plan 中，文件数、用例数与跳过数与迁移基线一致。
- [ ] AC2：PostgreSQL 测试生命周期在 Vitest 下保留全部 spec 契约，生命周期自身测试覆盖不回退。
- [ ] AC3：根契约与治理的 node:test 用例全部迁移；Python unittest 与 Playwright 未受影响。
- [ ] AC4：三域产出 JUnit XML 与 v8 覆盖率报告，CI 上传 artifact，覆盖率阈值能阻止回退。
- [ ] AC5：治理约束不回退：script 上限测试、owner plan 断言、operations docs 断言、affected-workspace 路由测试全部通过。
- [ ] AC6：`pnpm run check`、`pnpm run test`、pre-commit 快检在迁移后通过。
- [ ] AC7：相关 docs 与 spec 与实现一致，`pnpm run check:rules` 通过。
- [ ] AC8：delivery integration（打包产物路由契约）通过。

## Out of Scope

- Python `unittest` 迁移或重写。
- Playwright、browser mode、CI 分片矩阵的重构。
- 测试内容的功能性重写：新增覆盖、断言升级、用例合并或拆分。
- 覆盖率目标值的业务谈判；首期只做基线门禁。
- Api/Web 生产代码、wire contracts、数据库 schema 变更。

## Confirmed Decisions

- 2026-09-19 用户决定全量迁移，理由为统一与报表接入便利。此前评估结论（单纯为统一工具链迁移收益中等、风险偏高）保留为背景，不作为反对依据。
- 报表能力按 Vitest 统一实现，即使其中一部分 Node test runner 同样可提供。
- 采用父任务加三个子任务的树形：三个交付物可独立验证；顺序写在子任务与 implement 中，父子结构不当作依赖系统。
- CJS 测试文件的处理方式是 ESM 化文件内容而非改包 `type`，依据是上面的探针结论。
- 2026-09-19 报表接线范围确认为只上传 artifact：CI 仅上传 JUnit XML 与覆盖率报告，不引入第三方 JUnit 注解 action。注解若日后需要，单独决策并固定 action SHA。
- 2026-09-19 覆盖率口径暂定显式 `coverage.include` 源根（而不是只统计被测试加载过的文件）。最终数值与口径在收口阶段以实测基线确认并写入 specs。
