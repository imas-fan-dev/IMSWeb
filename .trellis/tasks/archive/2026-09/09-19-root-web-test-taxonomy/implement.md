# 实施计划：根域 / Web / E2E 测试归类

## 0. 启动前

- [x] 0.1 确认在 worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy` 内施工
- [x] 0.2 确认前置：`09-19-root-vitest-ui` 与 `09-19-api-test-taxonomy` 已落地（工具与规则已成熟）
- [x] 0.3 采集基线：根域 `tests/` 7 文件 / 67 用例、`scripts/**/tests` 3 文件 / 32 用例；e2e 42 spec / 115 用例；Web unit 执行时点用例数与「单 describe ≥10 it」的文件清单
- [x] 0.4 验证 e2e 取证格式：`pnpm --filter @imsweb/web exec playwright test --list` 的实际输出层级

## 1. 批次 E：根域 tests/（7 文件）

- [x] 1.1 按 design §1 的主题表归类；已有 wrapper 结构的文件保留 wrapper
- [x] 1.2 验收：`node scripts/testing/run-test-owner.mjs governance`（该批含 4 个治理文件）用例数不变 + 名字集合 diff 为空
- [x] 1.3 提交

## 2. 批次 F：根域 scripts/**/tests（3 文件）

- [x] 2.1 归类（`scripts/contracts/tests` 2 个 + `scripts/testing/tests/run-test-owner.test.mjs`）
- [x] 2.2 验收：`node scripts/testing/run-test-owner.mjs contracts` 与 `... delivery repository`
- [x] 2.3 提交

## 3. 批次 G：Playwright e2e（42 spec / 115 用例）

- [x] 3.1 G1：管理端与管理页面前缀的 spec 补顶层 describe
- [x] 3.2 G2：公开页/导航/活动等剩余 spec
- [x] 3.3 每批：`--list` 全名集合 diff 为空；触碰的 spec 至少实跑 1 个 `CI=1 ... --workers=1 --retries=0 <spec>`
- [x] 3.4 提交（G1、G2 可分两个提交）

## 4. 批次 H：Web unit 二次分组

- [x] 4.1 重算「单 describe ≥10 it」文件清单并写进 `verification.md`
- [x] 4.2 逐文件补二级 describe（只补类别层，不改顶层主语）
- [x] 4.3 验收：`pnpm --filter @imsweb/web run test:unit` 全绿、用例数不变、名字集合 diff 为空
- [x] 4.4 提交

## 5. 收口

- [x] 5.1 `node scripts/testing/run-test-owner.mjs governance|contracts|delivery root|delivery repository`
- [x] 5.2 `pnpm --filter @imsweb/web run test:unit`
- [x] 5.3 AC 扫描：根域无「0 describe 且 ≥5 用例」；Web unit 无「单 describe ≥10 it」
- [x] 5.4 写 `verification.md`（三域计数表、名字 diff、e2e 实跑证据）
- [x] 5.5 更新 `.trellis/spec/web/frontend/testing.md` 与 `.trellis/spec/repository/ci.md` 的归类约定；归档子任务

## 验收命令

```
node scripts/testing/run-test-owner.mjs governance
node scripts/testing/run-test-owner.mjs contracts
node scripts/testing/run-test-owner.mjs delivery
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web exec playwright test --list
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0 apps/web/tests/e2e/<touched>.spec.ts
```

## 回滚点

| 提交 | 回滚 | 影响 |
| --- | --- | --- |
| E / F | 独立 revert | 只影响根域对应目录 |
| G1 / G2 | 独立 revert | 只影响对应 spec |
| H | 独立 revert | 只影响 Web unit 被处理文件 |
