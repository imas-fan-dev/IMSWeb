# 根级 Vitest UI（@vitest/ui + test.projects 面板）

## Goal

在根 package 声明 `vitest` 与 `@vitest/ui`，并新增根 `vitest.config.mts` 用 `test.projects` 把 api / web / repository 三个执行域挂进同一个 UI 面板：本地开发时一条 `pnpm run test:ui` 就能跨子包浏览、单跑、重跑用例。治理侧同步放行根依赖、放开脚本上限并补不变量测试，使这份根配置不会与三个域配置漂移。

## Background

- 根 devDependencies 是白名单制：`scripts/check-workspace-boundaries.mjs:22` 只允许 `husky`，`:362-374` 强制；`tests/test_workspace_boundaries.py:88-94` 断言该拒绝信息。装到根必须同时改这两处。
- pnpm 不做 hoist：根没有 `node_modules/.bin/vitest`，只装 `@vitest/ui` 无法运行，`vitest` 必须一起放根。
- 根脚本数被 `tests/test_workspace_boundaries.py:230` 钉在 57，`docs/development/testing.md:24` 同步记录 57/43/21。
- `test.describe` 在 Vitest 4.1.11 实测可用；这不是本子任务的需求，但说明本子任务落地的 runner 版本能力。
- repository 域配置 `scripts/testing/vitest/vitest.repository.config.mts` 目前是**无 import 的纯对象**（因为根没有可解析的 vitest）；根有 vitest 后可选择性升级为 `defineConfig`，前提是不影响 `run-test-owner.mjs` 的绝对路径调用。
- 用户在 2026-09-19 明确选择 B 方案：根装包 + `test.projects` 面板，而非只装包手动 `--config`。

## Requirements

- **R1** 根 `package.json` 的 devDependencies 增加 `vitest`（`^4.1.11`，沿用仓库写法）与 `@vitest/ui`（精确 `4.1.11`，因为 `vitest@4.1.11` 的 peer 是精确版本）。
- **R2** 新增根 `vitest.config.mts`，`test.projects` 引用三个域配置；根配置**不启用 coverage**。
- **R3** 根 scripts 增加 `test:ui`（`vitest --ui`，带显式 `--config`），并把脚本上限 57 → 58 与文档同步。
- **R4** `scripts/check-workspace-boundaries.mjs` 的白名单与 `tests/test_workspace_boundaries.py` 的断言同步更新；该 Python 用例仍要覆盖「非法根依赖被拒绝」这条规则（换成另一个仍非法的名字）。
- **R5** 新增不变量测试（治理段），断言根 `projects` 指向的三个配置路径可解析、各域关键形状不变，且不硬编码覆盖率阈值。
- **R6** CI 行为不变：`run-test-owner.mjs` 仍按域分派三条仓库域调用与 api/web 域；根 UI 仅本地开发。

## Constraints

- 不改三个域配置的既有语义（`environment`、`include`、阈值、JUnit 路径）；如 projects 模式必须补 `root`，改动要最小并验证不回归。
- 不把根 UI 接进 CI，也不为 UI 单独产覆盖率。
- 依赖安装用 `--frozen-lockfile` 之外的唯一变更就是这两个包；不得顺带升级其它依赖。
- 施工在独立 worktree，不碰根检出里另一会话的未提交改动。

## Acceptance Criteria

- [x] **AC1** `pnpm run test:ui` 能启动面板并列出三域用例；单进程实测 365 文件 / 2545 用例（api 884、web 1534、repository 127）。
- [x] **AC2** 面板内三域的用例数与「单域运行」一致（API 134 文件 / 884 用例、Web 220 / 1534、仓库域 127），`vitest list` 收口复测 api 884 / web 1534 / repository 127。
- [x] **AC3** `pnpm run check:boundaries`、`python3 -m unittest tests.test_workspace_boundaries`、`pnpm run check:root` 全绿。
- [x] **AC4** 漂移守卫可被触发：反向验证显示删掉 `root: "apps/api"` 后守卫由 5 通过变为失败，因此补上 root 映射与 setupFiles 断言（守卫现为 6 个用例）。
- [x] **AC5** 根脚本数与文档一致（58 / 43 / 21），`docs/development/testing.md` 说明 `test:ui` 的用途与「仅本地」边界。
- [x] **AC6** 推送后 `ci.yml` 与 `deploy-preview.yml` 仍全绿（证明没有把根 UI 卷进 CI）。2026-09-20 在推送的 `ddd0fd7e` 上验证：CI run 35457618842（pull_request）与 Deploy preview run 35457615068（push）均 success；Deploy preview 内部执行 `pnpm run check` 与完整 `pnpm run test`。

## Out of Scope

- 把 CI 改成 `test.projects` 聚合执行。
- Web 构建自动化（`tests/assets` 需要 `apps/web/build/client`，只在文档写明先跑 `pnpm run build`）。
- 全仓测试归类（父任务 Stage 2/3）。
- 根配置取代三个域配置（域配置仍是唯一执行真源）。

## Confirmed Decisions

1. 采用 B 方案（根装包 + projects 面板）。
2. UI 只放根，`apps/api` 不声明 `@vitest/ui`。
3. 加根脚本 `test:ui`，脚本上限 57 → 58，同步文档。
4. 守卫测试并入治理段（`run-test-owner.mjs` 的 `governanceNodeTests`），与 `tests/vitest-reporting.test.mjs` 同层。
