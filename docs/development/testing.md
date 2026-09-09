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

Root、API 和 Web 的 package script 数量固定为 55、41 和 20；不得新增 `test:all`，也不为
准备状态增加 package alias 或可独立调用的跳过参数。

Root `test` 由同一个 runner 进程按顺序运行 governance、contracts 和 delivery owner。
Delivery integration profile 成功构建 Web 和 API 后，该进程才会运行不再构建的 API 阶段，
其中仍包含 syntax、architecture、Node、server、Wiki 和 migration。这样 API 测试不会接受
另一次运行留下的 `dist/server/main.js`。CI API lane 直接运行完整 API owner；Web lane 使用
`ci` profile，在同一个 runner 进程内依次运行 Web `check`（包含 unit）和普通 Playwright。
Integration job 没有跨 job artifact transfer，因此 `delivery integration` 始终保留自己的
Web 与 API build。

## 测试位置

| 范围                        | 位置                                                                                | 主要工具                             |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| API Node、数据库、HTTP      | `apps/api/tests/*.test.js`、`apps/api/tests/server/`、`apps/api/tests/integration/` | Node test runner、TypeScript         |
| Wiki contract 与数据        | `apps/api/tests/wiki/`                                                              | Node test runner、PostgreSQL fixture |
| API migration 与资产        | `apps/api/tests/migration/`、`apps/api/tests/assets/`                               | Node test runner                     |
| Web 页面、组件和 API client | `apps/web/tests/unit/`                                                              | Vitest、Testing Library              |
| Web 浏览器流程              | `apps/web/tests/e2e/`                                                               | Playwright desktop/mobile            |
| 仓库边界、部署和规则        | `tests/`                                                                            | Python `unittest`、Node test runner  |

Web 测试必须位于 `apps/web/tests/`，不得放进 `apps/web/app/`。API 测试应靠近受测 workspace，
但不可把生产实现复制进测试目录。

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

Root `test:web-routing` 调用 delivery integration owner；该 owner 在当前 job 内构建两个
workspace 后运行 frontend routing 与 packaged-client asset contracts。CI 的 Web lane 运行
Chromium、移动 Chromium 与 Firefox 的普通 Web Playwright 矩阵；App Playwright 由独立 App
lane 运行。

命令名称以当前 package scripts 为准；添加或删除 script 时同步更新 workspace README 和
边界测试，不为同一动作创建重复的根转发别名。

## 测试命名与证据

- Node、Vitest 文件使用 `*.test.ts`、`*.test.tsx` 或 `*.test.js`；Playwright 使用
  `*.spec.ts`；Python 使用 `test_*.py`。
- 缺陷修复必须先能在修复前复现，新增回归断言，再实现修复。
- 变更报告列出实际运行的命令、通过数量、失败或跳过数量，以及不能运行的门禁和原因。
- 可见 Web 改动需要提供桌面和移动截图；截图作为 Pull Request 或 CI artifact 保存，不提交到
  `docs/`。PR 记录 viewport、验证命令和结论。
- 不把完整日志、token、Cookie、生产数据或用户个人信息提交到 `docs/`；只保留可复现的
  摘要和脱敏证据。
