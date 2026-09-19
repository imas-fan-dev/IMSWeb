# 实施计划：根级 Vitest UI 与全仓测试归类

## 0. 启动前检查

- [ ] 0.1 在 worktree 内施工（根检出有另一会话的未提交改动），分支基于 `release/v1.1`：`chore/vitest-ui-and-test-taxonomy`
- [ ] 0.2 `pnpm install --frozen-lockfile` 成功，pre-commit 钩子可用
- [ ] 0.3 采集基线：三域用例数（API 884 / Web 1534 / 仓库域 governance+contracts+delivery 分段）、`test.describe` 现状普查数（api 134/829、root 10/99、web 220/1186、e2e 42/115）
- [ ] 0.4 记录基线命令与输出到本任务 `research/baseline.md`

## 1. Stage 1：根级 Vitest UI（子任务 `09-19-root-vitest-ui`）

提交 `874d4e6f`（`feat(test): add a root Vitest panel across the three test domains`）。除 AC6（推送后 CI 全绿）待推送确认外均完成。

- [x] 1.1 根 `package.json` 加 `vitest`、`@vitest/ui@4.1.11` 与 `test:ui` 脚本
- [x] 1.2 `scripts/check-workspace-boundaries.mjs` 白名单扩展，并从 `forbiddenRoot` 删除 `vitest.config.mts`（必需项）
- [x] 1.3 `tests/test_workspace_boundaries.py` 断言与脚本上限（57 → 58）
- [x] 1.4 根 `vitest.config.mts`（`test.projects` 三域）并实测三域 `root`/`include`/environment 解析；实测结论：必须用对象形式显式钉 `root`，且同组项目 `maxWorkers` 不同时需唯一 `sequence.groupOrder`
- [x] 1.5 漂移守卫测试（6 例，含 `root` 与 cwd 桥断言）+ `run-test-owner.mjs` 治理清单 + `run-test-owner.test.mjs` 断言同步
- [x] 1.6 文档：`docs/development/testing.md`（脚本数、`test:ui` 用途与限制）+ README 命令表
- [x] 1.7 验收：`check:boundaries`、`tests.test_workspace_boundaries`、`check:root`、`test:ui` 起面板、三域计数与单域一致（面板 365 文件 / 2545 用例）
- [x] 1.8 提交（依赖 + 配置 + 治理 + 文档一次提交）

复核（`trellis-check`）给出 REWORK 后已修正：守卫新增 `root` 与 cwd 桥断言（原始洞：删掉 `root` 后面板 api 项目静默从 884 用例变成根目录 5 个文件），另修 5 处注释/文档事实性错误，详见子任务 `design.md` §7 与 `verification.md`。

## 2. Stage 2：API 归类（子任务 `09-19-api-test-taxonomy`）

- [ ] 2.1 写出「拼接名集合」采集脚本（归类前后各跑一次，diff 必须为空）
- [ ] 2.2 批次 A：`tests/server` 102 个文件
- [ ] 2.3 批次 B：`tests/wiki` 7
- [ ] 2.4 批次 C：`tests/migration` 18
- [ ] 2.5 批次 D：`tests/assets` 2 + 顶层 5（`tests/*.test.ts`）
- [ ] 2.6 每批验收：该目录全量用例数不变、名字集合不变、`IMS_TEST_POSTGRES_ENABLED=false` 路径跳过数不变
- [ ] 2.7 收口提交

## 3. Stage 3：根域 / Web / E2E 归类（子任务 `09-19-root-web-test-taxonomy`）

- [ ] 3.1 根域 `tests/` 7 个文件 + `scripts/**/tests` 3 个文件
- [ ] 3.2 Playwright e2e：38 个平铺 spec 补顶层 `test.describe`
- [ ] 3.3 Web unit：单 describe ≥10 个 `it` 的文件二次分组（数量按普查时点重算）
- [ ] 3.4 每批验收：用例数与名字集合不变，e2e 用 `--list` 或 `--reporter=json` 取证
- [ ] 3.5 收口提交

## 4. Stage 4：集成验收

- [ ] 4.1 `pnpm run check` 全绿
- [ ] 4.2 `pnpm run test` 全链路计数与基线一致（API/Web/仓库域）
- [ ] 4.3 覆盖率与阈值不变（API 76/66/84/79、Web 70/67/67/73）
- [ ] 4.4 本地 `pnpm run test:ui` 面板可用（三域可浏览、单跑）
- [ ] 4.5 推送后 `ci.yml` 与 `deploy-preview.yml` 全绿

## 5. 收尾

- [ ] 5.1 子任务 `verification.md` 记录计数表、名字 diff 为空、门禁证据
- [ ] 5.2 更新 spec：`.trellis/spec/api/backend/testing.md`、`.trellis/spec/web/frontend/testing.md`、`.trellis/spec/repository/ci.md` 的归类约定与 `test:ui`
- [ ] 5.3 三个子任务归档，父任务归档
- [ ] 5.4 journal 记录

## 回滚点

| 提交 | 回滚方式 | 影响 |
| --- | --- | --- |
| Stage 1 根 UI | revert 单提交（含 lockfile） | 回到无根 vitest 状态；测试文件未受影响 |
| Stage 2 各批 | 按批 revert 对应提交 | 只影响该目录的归类 |
| Stage 3 各批 | 按批 revert | 同上 |

## 验收命令清单

```
pnpm run check:boundaries
python3 -m unittest tests.test_workspace_boundaries tests.test_operations_docs
pnpm run check:root
node scripts/testing/run-test-owner.mjs governance
pnpm --filter @imsweb/api run test
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web exec playwright test --list   # e2e 用例枚举
pnpm run check
pnpm run test:ui               # 本地面板（人工确认）
```
