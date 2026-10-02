# JUnit 报表与 v8 覆盖率门禁接线

> 父任务：`.trellis/tasks/09-19-vitest-test-unification`。共享决策见父任务 `design.md` §1 与 §4。

## Goal

让 API、根契约与治理、Web 三个执行域产出同一形态的 JUnit XML，并让 API 与 Web 另产出 v8 覆盖率报告，接入 CI artifact 与阈值门禁，使回归能被人和门禁同时看见。

## Background

- 现状：仓库没有任何测试报表或覆盖率接线。`.github/workflows/ci.yml` 只有两处 Playwright 失败证据 artifact（`:133`、`:179`），用法可作模板。
- Web 的 `apps/web/vitest.config.ts` 目前只有 `environment`、`setupFiles`、`include`、`maxWorkers`，没有 reporter 或 coverage 配置。
- `@vitest/coverage-v8` 未安装；vitest 版本为 4.1.11。
- 三域的执行入口不同：API 与根契约经 `run-test-owner.mjs`，Web 经 `pnpm --filter @imsweb/web run test`，CI 分布在 api / web / repository 三个 lane。
- 覆盖率基线的意义取决于测试是否真跑：API 域需要 PostgreSQL（CI 已提供 service container），根契约域需要构建产物（integration profile 自己构建）。

## Requirements

- R1：三域产出 JUnit XML，路径与命名一致，能被 CI 上传为 artifact。
- R2：API 与 Web 产出 v8 覆盖率报告，provider、`reportsDirectory` 与报告格式统一；根契约与治理域只产 JUnit，依据见 Confirmed Decisions 与 design §7.3。
- R3：覆盖率阈值以实测基线为起点，只允许单调上调；阈值失败必须让命令非零退出。
- R4：配置形态同形：三域各自写定 reporter 与 coverage，形状一致；跨域不漂移由一个仓库级 reporting 不变量测试守住，不做公共 preset 模块。
- R5：阈值启用前必须有基线证据（数值、命令、日期）落入 `verification.md`。
- R6：`coverage/` 与 `reports/` 不进入版本控制。
- R7：报表不得改变测试语义：不因加覆盖率而跳过用例、不把慢测试排除出统计来提升数字。

## Acceptance Criteria

- [ ] AC1：CI 模式下 `pnpm --filter @imsweb/web run test:unit` 与 `pnpm --filter @imsweb/api run test` 各自产出 JUnit XML 与覆盖率报告；`node scripts/testing/run-test-owner.mjs governance` 产出 JUnit XML。
- [ ] AC2：CI 的 api 与 web lane 上传的 artifact 内含 JUnit 与覆盖率文件；repository lane 只上传 JUnit（该域无覆盖率门禁）。
- [ ] AC3：人为降低一处覆盖或让一个用例失败时，阈值与 JUnit 都能体现，且命令退出码非零；验证后撤销该临时改动。
- [ ] AC4：API 与 Web 两份配置的 reporter 与 coverage 片段形状一致，仓库级 reporting 不变量测试能拦住任一处漂移（JUnit 路径形式、`provider`、`reportsDirectory`、阈值键），并断言根契约与治理配置没有 coverage 段。
- [ ] AC5：本地默认运行不写报表文件（避免噪音），CI 与显式 `--reporter=junit` 时写出。
- [ ] AC6：覆盖率开销有实测数字（同一命令加与不加 coverage 的耗时差），记录在 `verification.md`。
- [ ] AC7：`.gitignore` 覆盖三处 `coverage/`、`reports/`，`git status` 在跑完全量测试后保持干净。

## Out of Scope

- 覆盖率数字目标的产品或团队谈判。
- 引入外部覆盖率平台（Codecov 等）或 dashboard。
- 用 browser mode 采集覆盖率。
- JUnit 的 GitHub 注解动作。本任务只上传 artifact；注解作为可选后续单独决策，引入时需固定 action SHA（见 design §4）。

## Dependency

本子任务分两段：配置骨架必须早于 API 与根契约迁移（否则迁移时要重复接一次报表），阈值收口必须晚于两个迁移子任务（否则门禁在迁移期抖动）。

## Confirmed Decisions

- 2026-09-19 报表范围只上传 artifact，不引入第三方 JUnit 注解 action（注解留作可选后续）。
- 2026-09-19 覆盖率不是 plan 开关，而是域级运行的旗标：`enabled: process.env.IMS_TEST_COVERAGE_ENABLED === 'true'`，由 ci.yml 里拥有全域运行的那两个步骤打开（Web lane 的 `test -- ci`、API lane 的 `run test`）。初版用 `Boolean(process.env.CI)` 会让过滤运行也被域级阈值压死（App lane 的单文件运行实测 0.04%，integration lane 的 `test:assets` 同类），因为阈值本来就是按一次域级运行测出来的。用同一次运行产出 JUnit + 覆盖率的初衷与 plan 形状不变，本地仍默认不采集。
- 2026-09-19 收口修订：根契约与治理域不产覆盖率、只产 JUnit。该 lane 是三次独立调用共用一份配置与同一个 `scripts/**` 分母，逐指标最小值只剩 1 / 0 / 0 / 1，这种门禁拦不住回归，却固定付出 12s → 52s（CPU 密集的 contracts）并上传只覆盖 1.36% 行的 artifact；要让它有意义必须先让三次调用共享一次采集（改 plan 形状），本任务不做。API 与 Web 维持实测下取整阈值，不变量测试反过来断言该配置没有 coverage 段。
