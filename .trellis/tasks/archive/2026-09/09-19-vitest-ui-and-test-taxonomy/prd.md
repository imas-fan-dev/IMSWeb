# 根级 Vitest UI 与全仓测试归类（test.describe）

## Goal

两件事一起解决「测试资产不好用、不好看」的问题：

1. **根级 Vitest UI**：在根 package 声明 `vitest` + `@vitest/ui`，并用根 `vitest.config.mts` 的 `test.projects` 把 api / web / repository 三个执行域挂进同一个面板，本地开发时一次启动就能按子包浏览、单跑、重跑用例。CI 仍按域分派，不受影响。
2. **全仓测试归类**：把仓库里平铺的用例（主要是 API 的 125 个文件）按「顶层 `describe` = 被测主体，二级 `describe` = 从现有用例名提取的行为前缀」两层归类，统一结构，使 Vitest UI 与 JUnit 报表能反映真实层级。归类只动结构，不改用例语义、名字集合与数量。

## Background

### 普查（2026-09-19 实测，`chore/vitest-test-unification` 合并后）

| 执行域 | 位置 | 文件 | 顶层用例 | describe 现状 |
| --- | --- | --- | --- | --- |
| API | `apps/api/tests/` | 134 | 829 | 仅 9 个文件有 describe，125 个全平铺 |
| 根契约与治理 | `tests/`、`scripts/**/tests/` | 10 | 99 | 0，全平铺 |
| Web unit | `apps/web/tests/unit/` | 220 | 1186 | 已全部 describe 化（202 个单 describe、18 个多 describe） |
| Web 浏览器 | `apps/web/tests/e2e/` | 42 | 115 | 4 个有 `test.describe`，38 个平铺 |
| Python 治理 | `tests/test_*.py` | 9 | — | 已是 class 结构，本次不动 |

即真正需要归类的是 **api 125 + root 10 + e2e 38 ≈ 173 个文件**；Web unit 里值得二次分组的是「单个 describe 塞了 ≥10 个 it」的那批（`origin.test.ts` 27、`api.test.ts` 25、`api-dispatcher.test.ts` 22 等）。

### 已测定的事实与约束

- **根 devDependencies 是白名单制**：`scripts/check-workspace-boundaries.mjs:22` 的 `allowedRootDevDependencies` 只允许 `husky`，在 `:362-374` 强制；`tests/test_workspace_boundaries.py:88-94` 断言其拒绝信息。装到根必须同时改这两处。
- **pnpm 不做 hoist**：根 `node_modules/.bin/vitest` 不存在，所以只装 `@vitest/ui` 没有意义，`vitest` 必须一起放根。
- **根脚本数被钉住**：`tests/test_workspace_boundaries.py:230` 断言根 57 / api 43 / web 21，`docs/development/testing.md:24` 同步记录。加根脚本必须同时改上限与文档。
- **`test.describe` 在 Vitest 4.1.11 可用**（实测：两层嵌套、循环内动态注册均通过），且**不需要改 import**——`import { test } from 'vitest'` 即可用 `test.describe`，这让 API/根域的改写只动层级不动导入行。
- **repository 域配置目前是「无 import 的纯对象」**（`scripts/testing/vitest/vitest.repository.config.mts`），因为根没有可解析的 vitest。根有 vitest 后它可以升级成 `defineConfig`（可选收益：类型检查与编辑器补全），但必须先确认不影响 `run-test-owner.mjs` 的绝对路径调用。
- **另一个会话在根检出有未提交改动**（`apps/api/package.json` + `pnpm-lock.yaml` 加了 `@vitest/ui@4.1.11`）。本次在独立 worktree 内施工，天然不与之冲突；「UI 只放根、api 不加」的结论在该 worktree 内自然成立。
- 迁移期结论：CI 的三条 `run-test-owner.mjs` 调用按域分派，根/仓库域目前**没有覆盖率门禁**（共享 `scripts/**` 分母会让阈值形同虚设），只有 API 与 Web 有阈值。本次不改变这一点。

## Requirements

- **R1 根依赖**：根 `package.json` 声明 `vitest` 与 `@vitest/ui`（`@vitest/ui` 钉精确 `4.1.11`，因为 vitest 的 peer 是精确版本），并同步 `allowedRootDevDependencies` 与 `tests/test_workspace_boundaries.py` 的断言。
- **R2 根 UI 配置**：新增根 `vitest.config.mts`，用 `test.projects` 引用 api / web / repository 三个域配置，使 `--ui` 面板一次展示三域。
- **R3 本地入口**：根脚本加 `test:ui`；脚本上限 57 → 58，`docs/development/testing.md` 同步。
- **R4 漂移守卫**：新增不变量测试，断言根 projects 指向的三个配置路径、各域 include 与配置形状，改一处即失败（照 `tests/vitest-reporting.test.mjs` 的做法，不硬编码阈值）。
- **R5 归类规则**：全仓平铺用例按两层归类——顶层 `describe` = 被测主体（模块/页面/端点/脚本），二级 = 行为类别；类别名**从现有用例名的公共前缀提取**，不新造语义。
- **R6 归类不变式**：每个文件归类后，`describe` 路径拼接出的用例全名集合与归类前逐字一致；用例数不减少。
- **R7 域级原子性**：每个执行域的归类作为一个可独立验收的批次（API 按目录分批），批内不得出现半迁移状态。

## Constraints

- CI 行为不变：`run-test-owner.mjs` 仍按域分派三条仓库域调用 + api/web 域，根 UI 只服务本地开发。
- 归类不得改变执行语义：不引入 `describe.concurrent`、`describe.skip/only`，不打乱现有用例注册顺序，动态循环内注册的用例保持原样。
- 断言风格不变：API 与根域继续用 `node:assert/strict`，不借机改成 `expect`。
- 不新增 `node:test`，也不把 Python / Playwright 的框架形态纳入改造。
- 覆盖率分母与阈值不变（归类不改 `coverage.include`）。

## Acceptance Criteria

- [x] **AC1** 根 `pnpm run test:ui` 能启动 UI 面板并列出 api / web / repository 三域用例。
- [x] **AC2** `pnpm run check:boundaries`、`python3 -m unittest tests.test_workspace_boundaries`、`pnpm run check:root` 全绿。
- [x] **AC3** 根脚本数与文档一致（58 / 43 / 21），且 `test:ui` 已在 `docs/development/testing.md` 说明。
- [x] **AC4** 漂移守卫能被触发：改动任一域配置的 include 或路径，守卫测试失败。
- [x] **AC5** 归类后各域用例数与「describe 路径拼接名集合」与基线逐字一致（API 884 / Web 1534 / 仓库域按实测基线）。
- [x] **AC6** 三域 CI（`run-test-owner.mjs` 各 owner）与 `pnpm run check` 仍全绿，覆盖率与阈值不变。四个 owner 与 Web unit 本地全绿；2026-09-20 在推送的 `ddd0fd7e` 上验证：CI run 35457618842（pull_request）与 Deploy preview run 35457615068（push）均 success；Deploy preview 内部执行 `pnpm run check` 与完整 `pnpm run test`。
- [x] **AC7** API 与根域不再存在「一个文件内 0 个 describe 且 ≥5 个用例」的平铺文件（e2e 按 R5 同规则收口）。

## Out of Scope

- 用例语义重写（把 `test('x does y')` 改成人工起名的、更有信息量的类别名）——本次只做结构归类，可读性收益来自层级而非改名。
- 把 CI 改成 `test.projects` 聚合执行；根 UI 不参与 CI 门禁。
- Playwright 的 fixture/并行/截断策略改造。
- Python `unittest` 的重排。
- 历史任务里已归档的 `node:test` → Vitest 迁移内容。

## Confirmed Decisions

1. **采用 B 方案**：根装 `vitest` + `@vitest/ui` 并配 `test.projects` 面板，而不是只装包手动 `--config`。
2. **归类用「前缀提取」式机械改写**：类别名来自现有用例名的公共前缀，不新造语义；拼接后逐字一致，可机检。
3. **最多两层 describe**，例外需在提交说明里写明理由。
4. **加根脚本 `test:ui`**，脚本上限 57 → 58，同步文档。
5. **UI 只放根**，`apps/api` 不单独声明 `@vitest/ui`。
6. **Web unit 只对「单 describe ≥10 个 it」的文件做二次分组**，e2e 的 38 个平铺 spec 按同规则补顶层 `describe`；不做全量 churn。

## 子任务映射

| 子任务 | 范围 | 依赖顺序 |
| --- | --- | --- |
| `09-19-root-vitest-ui` | R1–R4、AC1–AC4 | 先做（无前置） |
| `09-19-api-test-taxonomy` | API 134 个文件、R5–R7、AC5–AC7 | 次做（量最大） |
| `09-19-root-web-test-taxonomy` | 根域 10 + e2e 42 + Web unit 收口、R5–R7 | 后做（与 api 可并行，但两者都改根域/共享文件，实际串行以避免冲突） |
