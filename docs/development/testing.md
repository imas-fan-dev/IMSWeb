# 测试与验证规范

> 文档类型：开发
> 状态：Active
> 权威来源：root `package.json`、各 workspace package scripts、`tests/` 与 CI workflow

测试按风险和所有权组织。测试不是文档中的数字目标；当前行为以实现、测试夹具和 CI 实际
命令为准。

## 执行所有权

| Owner      | 唯一职责                                          | Owner 命令                                                 |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------- |
| governance | 源码、文档、workspace、Git hook 和 CI 配置规则    | `node scripts/testing/run-test-owner.mjs governance`       |
| contracts  | wire ownership、non-JSON 边界和 mounted inventory | `node scripts/testing/run-test-owner.mjs contracts`        |
| API        | Node、HTTP、server、Wiki 和 migration             | `pnpm --filter @imsweb/api run test`                       |
| Web        | Vitest unit 和普通 Web Playwright                 | `pnpm --filter @imsweb/web run test`                       |
| delivery   | App、公开静态资产和 Web/API packaged routing      | `node scripts/testing/run-test-owner.mjs delivery PROFILE` |
| root       | 只按顺序调度 owner，不复述测试文件清单            | `pnpm run test`                                            |

Delivery 的 `PROFILE` 是 `root`、`repository`、`app`、`web` 或 `integration`；每个 CI lane
只调用自己拥有的 profile。

Root、API 和 Web 的 package script 数量由 `tests/test_workspace_boundaries.py` 钉在 57、43 和
21；新增 script 要同步这个期望值。不得新增 `test:all`，也不为准备状态增加 package alias 或
可独立调用的跳过参数。

Root `test` 由同一个 runner 进程按顺序运行 `check:root`、governance、contracts、delivery 的
root 与 integration profile、完整 API owner，最后是 Web unit。
Delivery integration profile 成功构建 Web 和 API 后，该进程才会运行不再构建的 API 阶段，
该阶段包含 build、syntax、architecture 和一次覆盖整个 `apps/api/tests` 的 Vitest 全量运行；
Node、server、Wiki、migration 与 assets 已并入这一次运行。这样 API 测试不会接受另一次
运行留下的 `dist/server/main.js`。CI API lane 直接运行完整 API owner；Web lane 使用
`ci` profile，在同一个 runner 进程内依次运行 Web `check`（包含 unit）和普通 Playwright。
Integration job 没有跨 job artifact transfer，因此 `delivery integration` 始终保留自己的
Web 与 API build。

governance、contracts 和 delivery 的 Node 测试属于仓库域，仓库根不能声明 `vitest`，因此该域由
`apps/api` 承载：

```sh
pnpm --filter @imsweb/api exec vitest run --root ../.. \
  --config scripts/testing/vitest/vitest.repository.config.mts <files>
```

`--root` 相对该步的 cwd（`apps/api`）解析，`--config` 由 runner 传绝对路径
（`scripts/testing/run-test-owner.mjs` 里的 `repositoryVitestConfig`），所以不受 cwd 影响。手工运行时
如果给相对 `--config`，它相对 `--root` 而非 cwd 解析，容易踩空。

## 测试位置

| 范围                        | 位置                                                                                | 主要工具                             |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| API Node、数据库、HTTP      | `apps/api/tests/*.test.js`、`apps/api/tests/server/`、`apps/api/tests/integration/` | Vitest、TypeScript                   |
| Wiki contract 与数据        | `apps/api/tests/wiki/`                                                              | Vitest、PostgreSQL fixture           |
| API migration 与资产        | `apps/api/tests/migration/`、`apps/api/tests/assets/`                               | Vitest                               |
| Web 页面、组件和 API client | `apps/web/tests/unit/`                                                              | Vitest、Testing Library              |
| Web 开发期 mock API         | `apps/web/mocks/`                                                                   | MSW                                  |
| Web 浏览器流程              | `apps/web/tests/e2e/`                                                               | Playwright desktop/mobile            |
| 仓库契约与治理              | `tests/`、`scripts/**/tests/`                                                       | Vitest（由 `apps/api` 承载）         |
| 仓库边界、部署和规则        | `tests/*.py`                                                                        | Python `unittest`                    |

Web 测试必须位于 `apps/web/tests/`，不得放进 `apps/web/app/`。API 测试应靠近受测 workspace，
但不可把生产实现复制进测试目录。Web 浏览器用例在 CI 预算、瞬时浮层与点击后状态断言上的
编写约束见 [Web testing spec](../../.trellis/spec/web/frontend/testing.md) 的 CI-stable browser test
authoring 一节；Web 单测的共享装配层（`tests/unit/support/`）、契约化 fixture 工厂与开发期
mock API 的编写约定见同一 spec 的 shared assembly layer、contract-typed fixture fidelity 与
dev-time API mocks 三节。

## 风险到验证

### 纯函数或局部 UI

运行受影响文件的单元测试和 workspace typecheck。覆盖成功、空、加载、错误和边界状态；
涉及用户可见布局时至少验证桌面和移动视口。

### API handler、route 或 wire contract

必须覆盖：

1. 正常响应和 HTTP 状态；
2. 认证、授权、CSRF、幂等和限流边界；
3. 错误响应和 malformed input；
4. `@imsweb/contracts` schema parse 或 API response alias 的漂移；
5. 路由所有权变化对应的 Web routing contract。

API response 类型不得只靠 TypeScript 通过。需要跨 workspace 的 JSON 响应时，在 HTTP
response-read 点使用 shared schema conformance。Redirect、stream、HTML 与 binary success
边界可以保留本地类型，但它们返回的 JSON error 仍由 shared contracts 定义。

### PostgreSQL、Valkey、对象存储或迁移

必须使用当前 Node runtime 验证，并覆盖失败、重试、并发、补偿和重启语义。PostgreSQL
持久化测试连接真实 PostgreSQL；Valkey 限流/缓存可使用 hermetic fake-EVAL 或 Memory
adapter，但重要 Lua 行为还要有本地真实 Valkey smoke check。对象存储写入必须覆盖部分成功
后的清理与数据库状态回滚。

### 发布、部署或边界规则

运行 root `check`、`test` 和受影响的 Python/Node contract tests。部署脚本必须分别通过
shell syntax check；不能用 `bash -n file1 file2` 代替逐文件检查。

## 标准命令

从仓库根目录执行：

```sh
pnpm run check:root
pnpm run check:pre-commit
pnpm run test
pnpm run test:web
pnpm run test:web-routing
```

聚焦迭代时使用：

```sh
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:wiki
pnpm --filter @imsweb/api run test:assets
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run test:e2e
```

### pre-commit 覆盖边界

`check:pre-commit` 在 `git diff --cached --check` 之后先运行三个不依赖基础设施的仓库级期望值
守护，再执行其余静态检查：

| 守护 | 固定内容 |
| --- | --- |
| `node scripts/testing/run-test-owner.mjs contracts` | mounted inventory 总数、前端路由元数据、non-JSON 边界清单 |
| `pnpm --filter @imsweb/api run test:migration` | 迁移有序清单、`catalog.count` 与已发布迁移校验和 |
| `pnpm --filter @imsweb/web run test:unit routes.test.ts` | 类型化 Web 路由清单长度与 prerender 数量 |

这三个测试把仓库级计数写成期望值；新增路由、迁移或页面时必须同步更新，否则提交会在
pre-commit 阶段被拒绝，而不是等到 CI 或部署。三个守护实测合计约 16s（contracts 11s、
API migration 4s、Web routes 1s，均已从 Node test runner 换成 Vitest），相对 `check:pre-commit`
约 165s 的总时长可以忽略。

`check:pre-commit` 有意不覆盖 governance owner（实测约 144s，主要耗时在 9 个 Python unittest 文件）、API/Web owner 的完整套件和浏览器
lane；这些仍只由 CI 运行。所以本地 pre-commit 全绿不等于 CI 全绿，提交前如需完全对齐应运行
`pnpm run test:infra`。

Root `test:web-routing` 调用 delivery integration owner；该 owner 在当前 job 内构建两个
workspace 后运行 frontend routing 与 packaged-client asset contracts。CI 的 Web lane 运行
Chromium、移动 Chromium 与 Firefox 的普通 Web Playwright 矩阵；App Playwright 由独立 App
lane 运行。两个浏览器 lane 在 `playwright install --with-deps` 前只移除 GitHub runner 预装的
Google Chrome apt source；Playwright 使用自己的固定浏览器版本，不依赖该 source，而保留
`--with-deps` 继续安装所需的 Ubuntu 系统库。

命令名称以当前 package scripts 为准；添加或删除 script 时同步更新 workspace README 和
边界测试，不为同一动作创建重复的根转发别名。

## 报告与覆盖率

三个执行域都写 JUnit XML，只有拥有产品源码的 API 与 Web 域设覆盖率门禁。报表由配置产出，不由
owner plan 传 flag：CI 用写 JUnit 的同一次运行产出覆盖率，`run-test-owner.mjs` 的 plan 形状与断言
不因此改变。

| 域 | JUnit | 覆盖率 |
| --- | --- | --- |
| API | `apps/api/reports/junit-api.xml` | `apps/api/coverage/`，`include: ['src/**']`，阈值 lines 79 / branches 66 / functions 84 / statements 76 |
| Web | `apps/web/reports/junit-web.xml` | `apps/web/coverage/`，`include: ['app/**']`，阈值 lines 73 / branches 67 / functions 67 / statements 70 |
| 仓库契约与治理 | 仓库根 `reports/junit-repository.xml` | 不采集，理由见下 |

仓库契约与治理域不采集覆盖率：该 lane 是三次独立调用共用一份配置与同一个 `scripts/**` 分母，最小那次
只覆盖 1.36% 的行，任何大于 1 的阈值都拦不住回归，却要为 CPU 密集的 contracts 固定付出约 40s。

覆盖率只在「这一次运行覆盖了整个域」时开启：配置读 `IMS_TEST_COVERAGE_ENABLED === 'true'`，只有
ci.yml 里两个域级步骤设置它（Web lane 的 `test -- ci`、API lane 的 `run test`）。这样过滤运行——App lane
只跑一个 Web 测试文件、integration lane 只跑 `test:assets`——不会被域级阈值压死：阈值是按域级运行实测
出来的，部分运行本来就达不到。

本地采集覆盖率：

```sh
pnpm --filter @imsweb/api exec vitest run --coverage
```

不要写成 `pnpm --filter @imsweb/api run test -- --coverage`：`pnpm run` 会把 `--` 原样透传，
`--coverage` 因此变成文件过滤参数，覆盖率不采集也不报错。命令行 `--coverage` 压过配置里的开关。

阈值是 CI 里的硬门禁：低于阈值即退出码非零。两域阈值都取迁移后实测基线的下取整，只允许单调上调，
上调时把实测值与口径写进提交信息。

CI 每个 lane 上传自己的 artifact（`if: always()`，名称 `<domain>-reports-<run_id>-<run_attempt>`，
保留 7 天）：API 与 Web lane 上传 JUnit 与 `coverage/`，repository lane 只上传 JUnit，浏览器失败证据
另有自己的上传步骤。报表消费走 artifact，不引入第三方 JUnit 注解 action。

同一域的两次 Vitest 运行不要并发：它们共用 `coverage.reportsDirectory` 与同一个 JUnit 输出文件，会
互相删掉临时文件并让其中一次失败（报错形如 `Something removed the coverage directory …`）。owner plan
内部是顺序执行；确实要并发时换域或先清空该域的 `coverage/`。

## 测试命名与证据

- Node、Vitest 文件使用 `*.test.ts`、`*.test.tsx` 或 `*.test.js`；Playwright 使用
  `*.spec.ts`；Python 使用 `test_*.py`。
- 缺陷修复必须先能在修复前复现，新增回归断言，再实现修复。
- 变更报告列出实际运行的命令、通过数量、失败或跳过数量，以及不能运行的门禁和原因。
- 可见 Web 改动需要提供桌面和移动截图；截图作为 Pull Request 或 CI artifact 保存，不提交到
  `docs/`。PR 记录 viewport、验证命令和结论。
- 不把完整日志、token、Cookie、生产数据或用户个人信息提交到 `docs/`；只保留可复现的
  摘要和脱敏证据。
