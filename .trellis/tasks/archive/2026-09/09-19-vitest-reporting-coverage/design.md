# 报表与覆盖率接线：技术设计

## 1. 报表片段写在各自的域配置里

不抽公共 preset 模块。三份配置各自写 reporter 与 coverage，保持同形。这个决定不是省事，而是三条约束叠出来的结果：

- 根 `package.json` 只允许声明 `husky`（`scripts/check-workspace-boundaries.mjs:22`），根 `node_modules` 下没有 vitest，`pnpm exec vitest` 在仓库根不可用。
- `vitest/config` 的类型解析以包含它的文件为起点向上找 `node_modules`。放在仓库根的 preset 找不到 vitest，而它一旦被 `apps/web` 的 `tsconfig`（include `**/*`）收进程序，`typecheck` 就会报模块不可解析。
- 代码复用指南明确说：所有权不同、或抽象需要为不相关调用方引入模式参数时不抽取。三份配置的所有权不同（各自 workspace 拥有自己的配置），且抽取后必然要带 `domain` 参数。

安装后已实测确认依赖解析：`apps/api` 与 `apps/web` 各自的 `node_modules/.bin/vitest` 存在，`@vitest/coverage-v8` 在两处均为 4.1.11，而仓库根的 `node_modules/.bin/vitest` 不存在。也就是说「根跑 vitest」不是配置问题，而是确实要改允许列表。

不变量改用治理测试守住：一个仓库级测试断言三份配置都满足 JUnit 输出路径形式 `reports/junit-<domain>.xml`、`provider: 'v8'`、`reportsDirectory: 'coverage'`、显式 `enabled`、四个阈值键齐备。它跟随所在执行域的 runner，并在 `run-test-owner.mjs` 的 governance 显式清单里登记。

三域各自写定的具体值：

| 项 | 取值 | 理由 |
| --- | --- | --- |
| JUnit 输出 | `reports/junit-<domain>.xml` | 固定且可推断的文件名，artifact 上传不需要额外配置 |
| `includeConsoleOutput` | `false` | CI 日志已有控制台输出，API 套件尤其啰嗦，XML 留失败信息与堆栈即可 |
| `addFileAttribute` | `true` | 用例与文件对应关系写进 XML，artifact 可被下游工具消费 |
| `coverage.provider` | `v8` | 显式，不吃默认值 |
| `coverage.enabled` | `Boolean(process.env.CI)` | CI 用写 JUnit 的同一次运行采集；本地默认不写文件，显式 `--coverage` 仍可压过（见 §7.1） |
| `coverage.reporter` | `text-summary`、`json-summary`、`lcov` | 默认是 `['text','html','clover','json']`，显式写定避免升级换产物 |
| `coverage.include` | API `src/**`、Web `app/**`、根契约与治理 `scripts/**` | Vitest 4 默认只统计被加载的文件，不写 include 则未测源文件不入分母（见 §7.2） |
| `thresholds` | 实测下取整，只允许单调上调 | 起点与域间口径差异见 §7.3 |

## 2. 阈值策略

- 基线取「迁移完成后、稳定状态下」的实测值，而不是迁移中的中间值。
- 起点取基线的下取整（例如实测 71.3% 取 71），避免一次无关重排就让门禁红。
- 只允许单调上调：每次上调是一个独立提交，附当次实测数字。
- 阈值按域分别设置。API 与根契约域包含大量 IO 边界与错误分支，覆盖率天然低于 Web 组件层，统一一个数字会逼着人去写无意义断言。
- `coverage.include` 决定分母。Vitest 4 的语义已确认：`CoverageOptions.include` 的文档注释写明 “By default only files covered by tests are included”，而 Vitest 3 的 `all` 开关在 4 中已不存在，因此要靠 `include` 才能把未被任何测试加载的源文件计入。口径暂定显式 include 源根，使分母覆盖真实源文件；最终数值在收口阶段实测后确认并写入 spec。
- `coverage.reporter` 的默认值是 `['text', 'html', 'clover', 'json']`，`reportsDirectory` 默认 `./coverage`，`provider` 默认 `v8`；三项都由每份域配置显式写定，不依赖默认值，否则未来升级会静默改变产物形状。
- CI 判断只在配置里读 `process.env.CI`：本地只跑 `default` 不写文件，CI 多一份 JUnit。配置本身不分叉，避免「本地过、CI 不同」。

## 3. 覆盖率与 `pool: 'forks'`

v8 覆盖率在 fork 池下由各子进程分别采集、由 vitest 合并，不需要额外配置。需要注意的是 `isolate: true` 下每个测试文件独立进程，覆盖收集有固定开销；API 域的 PG 文件本来耗时就在数据库上，相对开销小，Web 域需要实测。

## 4. CI 接线

- artifact 名称沿用现有模式：`<domain>-reports-${{ github.run_id }}-${{ github.run_attempt }}`。
- API lane 用 `if: always()`（测试失败时报表最有价值）；Playwright 现有两处用 `if: failure()`，那是失败证据，语义不同，不强行统一。
- 阈值失败让命令非零退出，无需额外步骤；JUnit 的失败同样由测试退出码表达。
- GitHub Actions 没有内建 JUnit 解析，但 Vitest 4.1.11 自带 `github-actions` reporter（`ReportersMap` 中的 `"github-actions": GithubActionsReporter`），它的职责就是把失败直接输出成 GitHub 注解，不需要第三方 action，因此也不涉及固定 SHA 的问题。本子任务的范围仍是只上传 artifact（2026-09-19 决定）；这条记录用于说明「注解」不是能力缺口，只是范围选择，日后开启只需在 CI 命令里增加一个内置 reporter。
- JUnit 与覆盖率在同一次运行内产出，不重复跑测试。

## 5. 忽略与产物位置

- `coverage/`：根、`apps/api/`、`apps/web/` 三处；`reports/`：同样三处（三域都写 JUnit）。`.gitignore` 里的 `coverage/` 与 `reports/` 不带前导斜线，匹配任意深度，一份规则覆盖全部位置，已落地验证。
- 逻辑上也可以统一写到 `/tmp`，但仓库现有约定是 `/tmp/imsweb-*-playwright`，测试报表放仓库内更像是可追溯的产物；两种都可以，选择写入仓库并 gitignore，代价是本地要多清一次目录。

## 6. 待实现期确认

1. 三域覆盖率基线数值与 `coverage.include` 的最终口径。
2. Web 域加覆盖率后的耗时增量是否可接受（用于决定是否只在 CI 采样）。
3. JUnit 的 `classnameTemplate` 或 `suiteName` 取值策略。4.1.11 的 `JUnitOptions` 只有 `outputFile`、`classnameTemplate`、`suiteName`、`includeConsoleOutput`、`addFileAttribute`、`hostname`，没有旧版的 `ancestorSeparator`；不设 `classnameTemplate` 时用默认类名即可，artifact 场景不需要额外加工。

## 7. 收口阶段落地记录（2026-09-19）

§1 表格里 `coverage.enabled` 的 `false`、`coverage.include` 的两域口径、`thresholds` 的全 0 占位都已按本节替换；本节以实现为准，但 §7.1 的开关位置与 §7.3 的根域结论都经过二次修订（见各自小节）。实测数值与命令见 `research/coverage-baseline.md` 与 `verification.md` 的第二段。

### 7.1 覆盖率不是 plan 开关，而是域级运行的旗标（2026-09-19 二次修订）

初版让三份配置写 `enabled: Boolean(process.env.CI)`，本意是让 CI lane 用写 JUnit 的**同一次运行**产出覆盖率，且 `run-test-owner.mjs` 的 plan 形状不变（没有 `--coverage` 步骤、没有第二次执行），`--` 透传的坑也不会被踩到。但 `CI=true` 对所有 CI 里的 vitest 运行都成立，于是**过滤运行**也被压上了域级阈值：App lane 只跑 `tests/unit/scripts/build-app.test.ts`（21 用例，实测覆盖率 0.04%，四条阈值全红），integration lane 只跑 `apps/api` 的 `test:assets`（同类失败）。阈值是按“一次域级运行”测出来的，部分运行本来就无法满足它。

改为显式旗标：`enabled: process.env.IMS_TEST_COVERAGE_ENABLED === 'true'`，只在 ci.yml 的两个域级步骤上打开——Web lane 的 `pnpm --filter @imsweb/web run test -- ci`（`ci` profile 跑 `check`，`check` 末尾是全量 `test:unit`）与 API lane 的 `pnpm --filter @imsweb/api run test`（整棵 API 测试树）。所以“用同一次运行产出 JUnit + 覆盖率”的初衷不变，`run-test-owner.mjs` 的 plan 形状与断言仍然不变，`--` 透传的坑也不会被踩到；变的是开关位置：从“猜是不是 CI”改成“由拥有全域运行的那一步声明”。本地默认不采集、不写文件，显式 `--coverage` 仍然压过旗标。不变量测试同时断言 enabled 表达式与旗标在 ci.yml 里的落点：删掉旗标、或把它挪到过滤运行的步骤上，都会失败。

### 7.2 三域都产出覆盖率，include / exclude 口径

| 执行域 | `coverage.include` | `coverage.exclude` | 分母（statements / branches / functions / lines） |
| --- | --- | --- | --- |
| API | `src/**` | `**/*.d.ts`、`**/*.md` | 15057 / 11012 / 2981 / 13703 |
| Web | `app/**` | `**/*.d.ts`、`**/*.css`、`**/*.json`、`**/*.svg` | 13506 / 10928 / 4260 / 12081 |
| 根契约与治理 | `scripts/**` | `**/*.d.ts`、`**/*.json`、`**/*.sh` | 3884 / 3408 / 526 / 3292 |

`scripts/**` 是宽口径，其中 `.json`（契约产物与清单）与 `.sh`（部署脚本）不是该域能用 v8 计覆盖的源码；写进 `exclude` 后，每次运行不再打印 5 条 `Failed to parse file … Excluding it from coverage`，分母也只剩可执行源码。测试文件不需要显式排除：它们匹配 `test.include`，而 Vitest 会把 `test.include` 追加进 `coverage.exclude`。三个域的非源码后缀都各自排除干净：Web 的 `app/**` 下有 19 个 `.css` / `.json` / `.svg`，它们不会被判为解析失败，而是以“0 条语句、100%”的条目混进报告（交叉评审时在 `coverage-summary.json` 的 382 个条目里数出来的），加进 `exclude` 后报告里只剩可执行源码，四项总分不变。`apps/api/src/**` 下的 5 个 `README.md` 是另一种情形：v8 remapper 直接解析失败，每次运行打印错误栈（非致命、数值不变），已用 `**/*.md` 排除。

### 7.3 阈值：实测下取整；根契约与治理域不设覆盖率门禁（2026-09-19 修订）

API 与 Web 各自只有一次运行，「域级」就是「运行级」，阈值直接取该次实测值下取整，只允许单调上调。

根契约与治理域**不产覆盖率、不设阈值**，只写 JUnit。这个结论是实测出来的：CI 的 repository lane 是三次独立的 `run-test-owner` 调用，各自一个 vitest 进程、各自判定阈值，而 `include: ['scripts/**']` 让三次调用共用同一个 3292 行分母，差别只在分子——governance 13.39%、contracts 24.96%、`delivery repository` 1.36%。域级合并口径 39.73% 用不了（三次各自判定），逐指标最小值只剩 1 / 0 / 0 / 1：这种门禁拦不住任何回归，却要为 CPU 密集的 contracts 固定付出 12s → 52s，上传的 artifact 还只有一次调用的 1.4%。要让该域有有意义的门禁，必须让三次调用共享一次采集，也就是改 `run-test-owner.mjs` 的 plan 形状；本任务不做，留作后续。

因此 `coverage` 段已从该配置移除，`ci.yml` 的 repository lane 只上传 `reports/junit-repository.xml`，仓库级不变量测试反过来断言该配置没有 coverage 段，把这个差异固定下来而不是留成隐患。

### 7.4 覆盖率开销与已撤回的 `testTimeout`

v8 用 `Profiler.startPreciseCoverage({ callCount: true, detailed: true })` 采精确块覆盖，代价是整份 isolate 变慢：纯 CPU 探针实测约 7.6x（5e7 次循环 33ms → 252ms）。API 偏 IO（+6%）、Web 偏 DOM（+20%），都扛得住；仓库域的 `contracts` 是 CPU 密集的 TypeScript 解析，实测 `tests/contracts/non-json-boundaries.test.mjs` 单用例从 2463ms 涨到 13589ms（约 5.5x），默认 5s 的 per-test timeout 会让 6 个用例超时。

收口段曾据此刻为该域加 `testTimeout: 60_000`。按 §7.3 改为不产覆盖率后，这份额外预算不再需要，已随 coverage 段一并移除：该域回到默认 5s timeout，一个真正挂住的契约用例在 5s 内报错，而不是 60s。

### 7.5 跨域不变量测试与 CI artifact

不变量落在 `tests/vitest-reporting.test.mjs`，登记进 `run-test-owner.mjs` 的 `governanceNodeTests`（该域因此变为 4 文件 / 64 用例）。断言清单、CI artifact 步骤、AC1–AC7 的证据见 `verification.md` 第二段。`tests/test_github_deployment.py` 里 `ci.count(UPLOAD_ARTIFACT_ACTION) == 2` 的断言随三个新上传步骤同步改为 5，并补上三段完整步骤的逐行断言。
