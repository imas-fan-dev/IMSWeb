# 技术设计：根级 Vitest UI 与全仓测试归类

## 1. 两条工作流的关系与顺序

```
Stage 1  root-vitest-ui       根依赖 + projects 面板 + 治理白名单/上限/文档 + 漂移守卫
Stage 2  api-test-taxonomy    apps/api/tests 134 个文件归类（最大量）
Stage 3  root-web-taxonomy    根域 10 + e2e 42 + Web unit 收口
```

先做 Stage 1 的理由：它决定后续两条归类工作流的验收工具——归类完成后的层级要在 UI 面板与 verbose 输出里可见，先有面板就能边改边看；它本身不碰任何测试文件，是小而独立的治理改动。

Stage 2 与 Stage 3 都改根域附近文件（Stage 3 大量改 Web/e2e，Stage 2 只改 api），可以并行，但两者都要跑 `run-test-owner.mjs` 的治理段做验收，且都会改 `tests/` 下的守卫测试；串行执行以避免同域并发（仓库域 Vitest 共享 `coverage/` 与 JUnit 输出，两个进程同时跑会互踩）。

## 2. Stage 1：根级 Vitest UI

### 2.1 依赖与治理

| 文件 | 改动 |
| --- | --- |
| 根 `package.json` | devDependencies 加 `vitest`、`@vitest/ui`；scripts 加 `test:ui` |
| `scripts/check-workspace-boundaries.mjs:22` | `allowedRootDevDependencies` 由 `husky` 扩为 `husky`、`vitest`、`@vitest/ui` |
| `tests/test_workspace_boundaries.py` | `:88-94` 的拒绝用例改用仍是非法名的依赖；`:230` 根脚本上限 57 → 58 |
| `docs/development/testing.md:24` 及「报告与覆盖率」段 | 脚本数 58/43/21；新增 `test:ui` 的用途与「仅本地开发、不参与 CI」说明 |

`@vitest/ui` 钉 `4.1.11` 精确版本：`vitest@4.1.11` 的 peer 是精确 `4.1.11`，caret 会在 4.2 发布后解析成不兼容版本。`vitest` 沿用仓库既有写法 `^4.1.11`。

### 2.2 根配置形状

```ts
// vitest.config.mts（根，新增）
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            'apps/api/vitest.config.mts',
            'apps/web/vitest.config.ts',
            'scripts/testing/vitest/vitest.repository.config.mts',
        ],
    },
});
```

要点与待实测项（Stage 1 的实现必须逐条验证，不能靠推测）：

1. **project 的 `root` 继承**：项目配置里的 `include` 是相对哪个目录。repository 域配置是按「从 apps/api 用 `--root ../..`」写的，`include` 相对仓库根；若 projects 模式下 root 变成了根配置所在目录（仓库根），行为一致；若不是，就需要在项目配置里显式 `root`，且**必须确认不影响 `run-test-owner.mjs` 的绝对路径调用**。
2. **环境与池的独立性**：api 是 `environment: node` + `pool: forks`，web 是 `jsdom`；projects 模式下每个项目应各自生效。实测确认 web 用例仍在 jsdom 下通过。
3. **alias 解析**：`@` → `apps/api/src`、`~` → `apps/web/app` 等在各项目内仍生效。
4. **UI 与覆盖率互斥性**：UI 模式默认不产覆盖率；根配置**不启用** `coverage`，避免面板启动时误产报告（阈值门禁仍归各域 CI 步骤）。
5. **已知限制**：API 项目含 `apps/api/tests/assets` 两个文件，需要已构建的 Web 客户端（`apps/web/build/client`）。UI 里首次使用应先跑一次 `pnpm run build`；不为此在配置层排除（那会改变 CI 行为），写进文档即可。

### 2.3 漂移守卫

新增 `tests/vitest-projects.test.mjs`（或并入现有 `tests/vitest-reporting.test.mjs` 的域数组，取更直观者），断言：

- 根配置存在且 `projects` 恰好指向三个域配置路径（顺序无关，集合相等）；
- 三个路径都能在磁盘上解析到文件；
- 各域配置的关键形状（api `environment: node`、web `environment: jsdom`、repository 无 coverage 块）仍成立；
- 不硬编码阈值，使阈值棘轮不会触发这个测试。

测试注册进 `run-test-owner.mjs` 的 `governanceNodeTests`，并同步 `scripts/testing/tests/run-test-owner.test.mjs` 的治理文件清单断言（该测试对治理段文件列表做精确断言）。

### 2.4 回滚

Stage 1 是单提交（依赖 + 配置 + 治理 + 文档），回滚即 revert 该提交；`pnpm-lock.yaml` 与之一并回滚。

## 3. Stage 2/3：两层归类规则

### 3.1 规则

对每个平铺文件：

```
test('email delivery runner polls immediately and enforces bounded concurrency', ...)
        └── 主体前缀（同类用例共有）          └── 剩余部分（逐字保留）
test('email delivery runner serializes lease renewals', ...)

  ↓ 归类后

test.describe('email delivery runner', () => {
    test('polls immediately and enforces bounded concurrency', ...)
    test('serializes lease renewals', ...)
});
```

- **顶层 describe = 被测主体**：模块名、页面/组件名、端点或脚本名（Web unit 已经是这个形状）。
- **二级 describe = 行为类别**：优先取现有用例名的公共前缀；同一文件内若前缀天然分成两组以上（如 `... rejects ...` 与 `... accepts ...`），按语义聚成 2–4 个类别，类别名仍从既有词汇里取。
- **最多两层**：三层的场景（同一个主体下类别内还有子类别）先合成一句类别名，把理由写进提交说明。
- **用例名逐字保留**（去掉已提取的前缀后），因此 `describe` 路径拼接后的全名与归类前逐字一致，可写断言机检。

### 3.2 机械可检性

每个文件归类前后收集两件事：用例总数、以及「describe 路径 + 用例名」拼接后的字符串集合（对标 `--reporter=verbose` 的输出或 JUnit 的 `name` 属性）。两者必须相等。API/根域用 `test.describe`（免改 import），Web/e2e 沿用既有 `describe` 导入。

### 3.3 不做的改动

- 不引入 `describe.concurrent` / `describe.skip` / `.only`；
- 不打乱注册顺序（`for` 循环内动态注册的用例留在原 describe 内，Vitest 已实测支持）；
- 不把 `node:assert/strict` 改成 `expect`；
- 不改文件路径与文件名（JUnit 的 `classname` 随文件路径，保持稳定）。

## 4. 风险表

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| projects 模式下 `root`/`include` 解析与单域运行不一致 | 面板列出错误文件集，或仓库域扫不到用例 | Stage 1 先实测三域计数与单域运行一致再继续 |
| 根装 vitest 后 `pnpm exec vitest` 在根误扫全仓（无配置时） | 开发者困惑 | 根配置即默认配置，`test:ui` 脚本显式带 `--config`；文档写明 |
| 归类把用例名改坏（前缀切错、丢了词） | 报表与排障可读性下降，甚至掩盖回归 | 逐文件机检「拼接名集合不变」，批内跑该域全量用例 |
| 归类批次过大导致 review 不可读 | 评审失效 | API 按目录分批（server 102 / wiki 7 / migration 18 / assets 2 / 顶层 5），每批一个提交 |
| 与另一会话在根检出的未提交改动冲突 | 半成品混入 | 全程在独立 worktree 施工，根检出保持不动 |
| 根脚本上限/文档漏改 | 边界测试与文档检查失败 | Stage 1 的验收命令显式包含 `check:boundaries`、`tests.test_workspace_boundaries`、`check:root` |
| Web unit / e2e 的「无意义 churn」 | 大量 diff 无收益、掩盖真实改动 | 只处理「单 describe ≥10 个 it」与「0 describe」的文件，其余不动 |

## 5. 验收证据口径

- 计数：归类前后各域用例数、跳过数（`IMS_TEST_POSTGRES_ENABLED=false` 路径单独记录）；
- 名字：每文件拼接名集合的 diff 为空（脚本产出，留档在子任务 `verification.md`）；
- 门禁：`pnpm run check`、`python3 -m unittest tests.test_workspace_boundaries tests.test_operations_docs`、三域 owner、
- 远端：推送后 `ci.yml` 与 `deploy-preview.yml` 全绿。
