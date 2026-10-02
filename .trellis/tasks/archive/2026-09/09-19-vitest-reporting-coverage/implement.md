# 报表与覆盖率接线：实施计划

> 分两段执行：骨架段必须早于 API 与根契约迁移；收口段必须晚于两个迁移子任务。

## 第一段：配置骨架（早于迁移）

- [ ] 在 `apps/api` 声明 `vitest` 与 `@vitest/coverage-v8`，在 `apps/web` 声明 `@vitest/coverage-v8`（版本与已装的 vitest 4.1.11 对齐），更新 lockfile。根不能声明，见 design §1。
- [ ] `apps/api/vitest.config.mts` 与 `apps/web/vitest.config.ts` 各自写定 reporter 与 coverage（阈值先占位 0），形状按 design §1 的表格对齐。
- [ ] 根域配置等 runner 归属决定后再建（选 A：根 `vitest.config.mts`；选 B：`scripts/testing/vitest/vitest.repository.config.mts`）。
- [ ] `.gitignore` 增加 `coverage/` 与 `reports/`（根、`apps/api`、`apps/web`）。
- [ ] 验证：
  - [ ] `CI=1 pnpm --filter @imsweb/web run test:unit` 产出 JUnit 与覆盖率文件
  - [ ] 本地 `pnpm --filter @imsweb/web run test:unit` 只输出 default reporter、不写文件
  - [ ] `git status` 干净（产物已被忽略）
- [ ] 提交。

## 第二段：阈值与 CI artifact（晚于迁移）

- [x] 分别在 API、根契约、Web 域跑一次带覆盖率的全量，记录覆盖率四项数值与耗时，落盘 `research/coverage-baseline.md`。
- [x] 确认 `coverage.include` 口径已按 design 落定（API `src/**`、Web `app/**`、根域按实测定为 `scripts/**`），并把理由写入 design §7.2（spec 由任务负责人收口）。
- [x] 把三域阈值填成实测下取整值，提交说明附当次数字。根契约域取 CI lane 三次调用的逐指标最小值（`delivery repository` 绑定，1/0/0/1），原因见 design §7.3。
- [x] 在 `ci.yml` 的 api / web / repository 三个 lane 增加 artifact 上传（`if: always()`），名称为 `<domain>-reports-${{ github.run_id }}-${{ github.run_attempt }}`。不引入任何 JUnit 注解 action（2026-09-19 决定）。
- [x] 验证：
  - [x] 人为增加一个未被覆盖的源文件让覆盖率掉到阈值下，确认命令非零退出，然后撤销
  - [x] 人为让一个用例失败，确认 JUnit 记录了失败且命令非零退出，然后撤销
  - [x] 本地全量后 `git status` 仍干净
- [x] 新增仓库级 reporting 不变量测试 `tests/vitest-reporting.test.mjs`，断言三份配置的 JUnit 路径形式、`provider`、`reportsDirectory`、`enabled` 与阈值键，并登记到 `run-test-owner.mjs` 的 governance 显式清单（governance 因此变为 4 文件 / 64 用例：59 + 5）。
- [x] 记录覆盖率开销（加与不加 coverage 的耗时差）到 `verification.md`。
- [ ] 提交（由任务负责人执行）。

## 可选后续（不在本子任务验收内）

- [ ] GitHub 注解：本任务只上传 artifact。若要引入注解，优先评估 Vitest 内置的 `github-actions` reporter（无需第三方 action，也不涉及固定 SHA），单独提交，不与迁移混在一起。
