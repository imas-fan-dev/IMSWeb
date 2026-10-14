# 统一测试执行到 Vitest：技术设计

## 1. 执行域与配置布局

三个执行域各自持有配置，各自独立运行，不跨 workspace 聚合：

| 执行域 | 配置文件 | environment | include |
| --- | --- | --- | --- |
| API | `apps/api/vitest.config.mts` | `node` | `tests/**/*.test.{ts,js}` |
| 根契约与治理 | `scripts/testing/vitest/vitest.repository.config.mts`（由 `apps/api` 宿主，见 §8 第 1 条） | `node` | `tests/**/*.test.{js,mjs,ts}`、`scripts/**/tests/**/*.test.mjs` |
| Web | `apps/web/vitest.config.ts`（已存在） | `jsdom` | `tests/unit/**/*.{test,spec}.{ts,tsx}` |

不采用 `test.projects` 把三域合成一个进程，理由有三条。owner 边界由 `run-test-owner.mjs` 与 CI lane 定义，跨 workspace 聚合会让「哪个 owner 跑了哪些用例」变得不可判读；API 与 Web 的 environment、alias、setup 文件不同，强行合并只会把差异堆进条件分支；delivery integration 依赖「先构建、随后只跑已构建产物」的顺序，单进程聚合会让这个顺序难以保持。`test.projects` 在 4.1.11 可用，留给未来「同一域多环境」的场景。

配置文件名用 `.mts` 的地方是因为 `apps/api/package.json` 是 `"type": "commonjs"`，`.ts` 配置文件在该包内会被判定为 CommonJS 而无法 import `vitest/config`。

三个域的 reporter 与 coverage 片段不抽公共模块，各自写在域名下的配置里，保持同形。理由有三条：根 `package.json` 不得声明测试工具（见 §1.1），公共模块只能放在没有任何 workspace 能解析与类型检查 `vitest/config` 的位置；`vitest/config` 的类型解析以包含文件所在目录为起点向上找，根 `node_modules` 下没有 vitest，放在根的文件无法通过 workspace 的 `tsc`；代码复用指南本身写明「当所有权不同、或抽象需要为不相关调用方加模式参数时，不要抽取」，而这里两者都命中。

跨域不漂移由治理测试保证，而不是共享模块：收口阶段新增一个仓库级测试，断言三份配置都满足不变量（JUnit 输出到 `reports/junit-<domain>.xml` 形式、`provider` 为 `v8`、`reportsDirectory` 为 `coverage`、`enabled` 显式、阈值键存在）。该测试跟着它所在的执行域走：迁移前用 node:test，迁到根域后随子任务 2 一起变为 Vitest，并登记到 `run-test-owner.mjs` 的 governance 显式清单里。

### 1.1 依赖归属（实施期发现的硬约束）

`scripts/check-workspace-boundaries.mjs:22` 定义 `allowedRootDevDependencies = new Set(["husky"])`，并在 `:357-375` 拒绝根 `package.json` 声明清单之外的任何 `dependencies` / `devDependencies` / `optionalDependencies` / `peerDependencies`。实测确认：安装后根 `node_modules/` 下没有 `vitest`，`node_modules/.bin` 里也没有 vitest 二进制。因此根 `package.json` 今天既不能声明 runner，也不能直接执行它。

两个直接后果：

- `@vitest/coverage-v8` 必须声明在真正启用覆盖率的 workspace（`apps/api`、`apps/web`），不能像原计划那样在根统一声明。两处用同一版本范围，pnpm 会解析到同一个 store 版本，不存在版本漂移。
- 根契约与治理域（子任务 2）的 runner 归属必须显式决定，见 §8 开放问题 1。

共享 preset 的方案已废弃，理由与替代方案见 §1。子任务 2 的根域配置位置已按 §8 第 1 条定为选项 B：`scripts/testing/vitest/vitest.repository.config.mts`，由 `apps/api` 宿主执行。

另一条被实测撞到的规则：`scripts/check-workspace-boundaries.mjs:557-572` 把 `apps/api/vitest.config.mts` 列入 retired Cloudflare Worker 措面清单，报错文案是「Cloudflare Worker runtime is retired; current API validation is Node-only」。因此 API 的 Vitest 配置路径也被治理规则锁住。配置必须用 `.mts`：`apps/api/package.json` 是 `"type": "commonjs"`，`.ts` 配置会被当成 CJS，而 `require('vitest')` 在 4.1.11 直接抛错（探针已验）；这也正是那份清单里写 `.mts` 的原因。两条规则一起构成「全量迁移」的前置治理决定，选项见 §8 第 1 条与子任务 1 的 design。

## 2. API 迁移

### 2.1 进程与并发模型

- `pool: 'forks'`、`isolate: true`：每文件独立进程，接近 `node --test` 默认的 per-file 子进程语义，也避免 `threads` 池下 PG 连接与全局状态串味。
- `maxWorkers`：CI 2、本地 4，与 Web 保持一致。PG 测试按文件建库，实际上限受数据库创建吞吐与 allocator `maxConnections: 4` 约束，迁移时实测后再定值，不得为了跑快而超过实测安全值。
- 关闭 `isolate` 或改用 `threads` 需要独立证据，不接受「为了跑通」而放宽。

### 2.2 模块解析

- alias 用显式 `resolve.alias`：`@` → `apps/api/src`，对齐 `tsconfig.server.json` 的 `paths`。不引入 `vite-tsconfig-paths`，避免新增依赖。
- 测试文件必须是 ESM。探针结论：`require('vitest')` 在 4.1.11 直接抛错，而 commonjs 包内的 `.js` 文件使用 `import` 语法可以正常执行。因此 25 个 `.test.js` 的 `require()` 改为 `import`，文件后缀与包 `type` 都不动。
- 非测试 helper（`tests/contracts/runtime-contracts.js`、`tests/postgres-test-lifecycle.js`、`tests/node-security/fixture.js`）是 CJS 时，从 ESM 测试 import 走 Vite 的 CJS interop。这是本设计最不确定的一处：批次 0 必须先做冒烟验证（一个 ESM 测试 import CJS helper 并使用具名导出）。具名导出 interop 失败时，把该 helper 改名为 `.mjs` 并同步 `.d.ts` 与引用路径，不改 `package.json` 的 `type`。
- 显式 `.js` 后缀指向 TS 文件的导入（当前 5 处）在 Vite 下的解析行为与 tsx 不同，迁移时按文件核对；解析失败优先改成无后缀或 `.ts` 显式，不用 `server.deps.inline` 兜底。

### 2.3 PostgreSQL 生命周期契约改写

这是迁移中唯一需要改契约的部分，`.trellis/spec/api/backend/testing.md` 的 Signatures 与 Contracts 两节随之更新。

| 现在（node:test） | 迁移后（Vitest） | 说明 |
| --- | --- | --- |
| `postgresTest: typeof nodeTest`（`nodeTest` 或 `nodeTest.skip`） | `postgresTest(name, body)` 包装器 | 禁用时声明并跳过，保留 `DISABLED_REASON` 文案 |
| `postgresTest(name, async (t) => …)` | `postgresTest(name, async () => …)` | body 不再接收 TestContext |
| `t.after(cleanup)`（87 处） | helper 内部 `onTestFinished(cleanup)` | 探针确认：在包装器里注册即可生效，清理按注册逆序，在下一个用例前执行 |
| `createPostgresTestDatabase(t, label)` | `createPostgresTestDatabase(label)` | 清理注册移入函数内部 |
| `connectPostgresTestDatabase(t, connection)` | `connectPostgresTestDatabase(connection)` | 同上 |
| `t.mock`（8 处）、`mock.timers`（3 处） | `vi.fn` / `vi.spyOn` / `vi.useFakeTimers` | 逐处判定语义等价 |
| `t.diagnostic` | `ctx.task.meta` 或结构化 console 输出 | 数量少，逐处映射 |
| `t.test`（1 处子测试） | 顶层 `test` 或 `describe` 嵌套 | 不接受静默丢弃 |
| `t.skip(reason)` | 测试体内 `ctx.skip(reason)` | 探针确认原因字符串可用且计入 skipped |
| `closeSharedPostgresTestAllocator()` 的模块级 `after` | `afterAll` | 保持进程结束时关闭 allocator |

两个包装器都要改：`tests/server/postgres-test-database.ts`（TestContext 适配器，39 个 PG 测试文件中的多数使用它）与 `tests/integration/postgres-harness.ts`（显式 close 适配器，10 个以上文件使用）。生命周期核心 `postgres-test-lifecycle.js` 的职责边界、命名规则、drain 观察、`AggregateError` 聚合逻辑不改，只改「谁来注册清理」。

spec 中的 contract row（启用判定、URL 优先级、回环校验、禁用即跳过、创建或迁移失败后强制清理、并发 close、重试、聚合失败）必须在 Vitest 下逐条保留，且生命周期自身的测试文件覆盖不回退。

### 2.4 类型门禁归宿

现状是 `tests/server/tsconfig.json` 与 `tests/wiki/tsconfig.json` 各跑一次 `tsc --noEmit`，两者都 include `src/**`。迁移后删除这两个配置的脚本用法，新增 `apps/api/tsconfig.tests.json`：extends `tsconfig.server.json`，`rootDir: "."`，include `src/**/*.{ts,tsx}` 与 `tests/**/*.ts`。

覆盖范围与今天对齐：今天也不对 25 个 `.js` 测试做类型检查，所以 `allowJs` 不开，属于等价迁移而非降级。新配置挂到现有 `typecheck` 脚本里串联执行，不新增 script。

### 2.5 脚本替换

用同名替换而不是新增。`apps/api/package.json` 的 script 数量保持 43。

| Script | 迁移后 |
| --- | --- |
| `test:node` | `vitest run`（API 全域；取代原来 4 段串行） |
| `test:server` | `vitest run tests/server` |
| `test:wiki` | `vitest run tests/wiki` |
| `test:migration` | `vitest run tests/migration`（删掉 18 文件硬编码清单） |
| `test:assets` | `vitest run tests/assets` |
| `test` | `node ../../scripts/testing/run-test-owner.mjs api`（不变） |

`test:node` 从「5 个顶层文件的 node --test」变成「API 全域 Vitest」是有意为之：owner plan 里 build → syntax → architecture → Node → server → wiki → migration 的七段串行会收敛为 build → syntax → architecture → 一次 Vitest，文件级并行由 Vitest 自己完成，删除的 18 文件清单顺带消除了一个需要人工同步的重复清单。pre-commit 仍只调 `test:migration` 与 contracts owner，保持快检语义。

## 3. 根契约与治理迁移

- 根 `vitest.config.mts` 的 include 覆盖 `tests/**/*.test.{js,mjs,ts}` 与 `scripts/**/tests/**/*.test.mjs`；`--experimental-strip-types` 不再需要。
- `run-test-owner.mjs` 中 `governancePlan()`、`contractsPlan()`、`deliveryPlan()` 的 Node 段把 `node --experimental-strip-types --test <files…>` 换成 vitest 调用；Python 段不动。
- 自举顺序：先改 `run-test-owner.mjs` 的 plan，再迁移 `scripts/testing/tests/run-test-owner.test.mjs`（它同时是被测对象与测试，顺序错了会红两边）。该文件的断言（plan 的 args、cwd、冻结性、错误信息）在迁移时逐条重写，不删断言。
- `tests/test_operations_docs.py:120-122` 断言 `test:infra` 包含 `node scripts/testing/run-test-owner.mjs governance`：该字符串不变，无需改；若为了报表把 governance 拆成两段调用，必须同步该断言。

## 4. 报表与覆盖率

- reporters：`default` 加 `junit`，JUnit 输出到 `<workspace>/reports/junit-<domain>.xml`。CI 用 `--reporter=default --reporter=junit --outputFile=…`，本地默认只跑 default，避免每次写文件。
- coverage：`@vitest/coverage-v8` 按 workspace 声明（`apps/api`、`apps/web`），根不能声明，见 §1.1；两处用同一版本范围，provider `v8`，`reportsDirectory` 统一为 `coverage`。已由已安装类型确认的显式项：`provider`、`enabled`、`reportsDirectory`、`reporter`（默认是 `['text','html','clover','json']`）、`include`、`exclude`、`thresholds`。
- 阈值：先取实测基线，再设 `coverage.thresholds.{lines,branches,functions,statements}`，只允许单调上调。不允许为了过门禁而把 `exclude` 扩大到覆盖掉真实代码。
- 阈值启用顺序：子任务 1、2 完成且各域基线稳定后再开 CI 门禁，避免迁移期用一个还在变的数字卡住 PR。
- CI：在 api / web / repository 三个 lane 增加 `actions/upload-artifact`（沿用现有 `:133`、`:179` 的写法，`if: always()` 或 `if: failure()` 按用途定），并把 JUnit 与覆盖率报告作为 artifact。
- `.gitignore` 需要忽略 `coverage/`、`reports/`（三个位置）。

## 5. 治理与兼容

- `tests/test_workspace_boundaries.py:222-237` 计数 root 57 / api 43 / web 21：本设计不新增 script，计数不变。`docs/development/testing.md:24` 的 55/41/20 属既有漂移，在子任务 1 或 2 内顺手校正，不新开任务。
- 回滚形状：批次 0（依赖与配置）一个提交；之后每批一个提交，可单独 revert；`run-test-owner.mjs` 与脚本替换单独提交，便于「配置回滚但代码不回滚」。
- 双 runner 过渡期：允许在同一批内并存（未迁移的 suite 仍用 node:test），但每个子任务收口时必须清零，父任务最终以 `node --test` 全仓消失为验收条件。

## 6. 风险与缓解

| 风险 | 触发信号 | 缓解 |
| --- | --- | --- |
| 运行时保真漂移 | Vitest 下通过、打包产物下失败 | `pool: 'forks'` + node environment + 真实 PG；每批次末重跑 delivery integration |
| CJS interop 失败 | 具名导出为 undefined 或 `module is not defined` | 批次 0 冒烟；失败则 helper 改名 `.mjs`，不改包 `type` |
| 解析差异（`.js`→`.ts`、无后缀） | 迁移后 import 报错 | 按文件核对后缀，显式化导入；不用大范围 inline 兜底 |
| 类型门禁静默退化 | 删掉 per-suite `tsc` 后无等价检查 | 单一 `tsconfig.tests.json` 覆盖 `src` + `tests`，挂在现有 typecheck 上 |
| PG 并发压垮 allocator | 迁移后 drain 超时或建库失败 | 实测 `maxWorkers`；必要时按 label 或目录分组降并发 |
| 静默漏测 | 用例数或跳过数下降 | 每批次比对 file/test/skip 基线，任何下降必须在 verification.md 解释 |
| 治理断言不同步 | `check:pre-commit` 或 `check:rules` 红 | script/plan 变更与对应断言在同一提交内完成 |

## 7. 验证策略

- 批次 0：记录迁移基线（每 suite 的 file/test/skip/duration），完成 CJS interop 冒烟与 alias 冒烟。
- 每批次：同一条命令跑迁移前后，比对计数；跑 workspace typecheck；跑对应 owner。
- 子任务收口：API 与根契约 owner 全量通过，`node --test` 在该域消失。
- 父任务收口：`pnpm run check`、`pnpm run test`、`pnpm run check:pre-commit`、delivery integration 全绿，三域 JUnit 与覆盖率 artifact 生成，覆盖率门禁在 CI 生效。

## 8. 待实现期确认的开放问题

这些问题不阻塞 planning，但必须在 implement 批次 0 得到答案并写入 verification.md。第 1、2 条已在 2026-09-19 有结论：

1. 治理规则的放行范围（已决定）。两个独立选择：
   - API 配置路径：`apps/api/vitest.config.mts` 原本在 `scripts/check-workspace-boundaries.mjs` 的 retired Worker 清单里，`pnpm run check:boundaries` 因此失败。**已把这一条从清单移除**，同组的 `tsconfig.worker.json`、`tests/worker`、`wrangler.jsonc`、`.assetsignore` 等条目不动：Vitest 是以 Node 侧 runner 的身份重新引入，不是恢复 Workers 运行时。已实测 `node scripts/check-workspace-boundaries.mjs` 重新通过。
   - 根域 runner 归属：**选 B，由 `apps/api` 宿主**，`allowedRootDevDependencies` 保持只有 `husky`。配置文件已建在 `scripts/testing/vitest/vitest.repository.config.mts`，命令形状为 `pnpm --filter @imsweb/api exec vitest run --root ../.. --config <绝对路径> <files>`，`run-test-owner.mjs` 的三个 plan 函数把 cwd 从仓库根改成 `apiRoot`（runner 的 spawn 读 `step.cwd`，机制上支持）。
   - 支撑决定的实测证据：写 `import { defineConfig } from 'vitest/config'` 时模块解析从**配置文件自己所在的目录**向上找 `node_modules`，放在 `scripts/testing/vitest/` 或仓库根都报 `[UNRESOLVED_IMPORT] Could not resolve 'vitest/config'`，配 `--root ../..` 或绝对 `--config` 路径都一样；普通对象导出则退出码 0。选项 A（把 `vitest` 加进根允许列表）能让根的 `node_modules/.bin/vitest` 与 `vitest/config` 都可用，三份配置同形，本次不采纳。
   - 明确接受的代价：根域配置只能是普通对象导出，拿不到类型检查与编辑器补全，三份配置里只有它长得不一样。
   - 已实测的 B 形态完整证据：CI=1 下该配置被正确加载，`include` 打印为相对仓库根的两条模式，JUnit 报告写到仓库根 `reports/junit-repository.xml`（`suiteName="repository"`），且被 `.gitignore:94` 忽略。
2. Vite 对 CJS helper 具名导出的 interop —— **已实测直接可用，不改名 `.mjs`**。一个 ESM 探针测试从 `tests/contracts/runtime-contracts.js` 与 `tests/postgres-test-lifecycle.js`（两者都是 `module.exports`）具名 import 了 8 个导出，8 个全部解析为期望类型，并且真的执行了函数体（`deepEqual` 在相等输入上不抛、在不等输入上抛出 `probe: expected {"a":2}, received {"a":1}`）。因此 helper 保持 `.js` 与 CJS 形态，只有测试文件本身需要 ESM 化。
3. PG 测试在 `maxWorkers: 2/4` 下的建库与 drain 是否稳定，是否需要按 label 分组。
4. 三域覆盖率基线数值，以及 `coverage.include` 的合理范围。已由已安装的类型确认：Vitest 4 的 `CoverageOptions.include` 文档注释写明默认只包含被测试覆盖的文件，Vitest 3 的 `all` 开关已不存在，所以显式 `include` 是唯一手段；`coverage.reporter` 默认 `['text', 'html', 'clover', 'json']`、`reportsDirectory` 默认 `./coverage`，本任务全部显式写定。
