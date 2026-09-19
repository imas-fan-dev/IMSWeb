# 技术设计：根级 Vitest UI

## 1. 依赖与治理改动面

| 文件 | 改动 | 说明 |
| --- | --- | --- |
| `package.json`（根） | devDependencies `+vitest ^4.1.11`、`+@vitest/ui 4.1.11`；scripts `+test:ui` | 根从此有 vitest 可执行文件 |
| `scripts/check-workspace-boundaries.mjs:22` | `allowedRootDevDependencies = new Set(["husky", "vitest", "@vitest/ui"])` | 白名单是唯一放行机制 |
| `scripts/check-workspace-boundaries.mjs:580` | 从 `forbiddenRoot` 删除 `"vitest.config.mts"` 一项 | **必需**：该列表会直接拒绝新根配置（反向实测：加回该行 `check:boundaries` exit 1，报 `vitest.config.mts: application code must live in a workspace`）；只删这一项，其余根目录禁令不动 |
| `tests/test_workspace_boundaries.py:88-94` | 非法依赖名从 `unexpected-tool` 换成仍非法的 `prettier` | 白名单已扩，换一个真实工具名才能继续证明它是封闭列表（把 `prettier` 加进白名单 → 该用例 FAILED，非恒真） |
| `tests/test_workspace_boundaries.py:230` | 根脚本 57 → 58 | 与文档同步 |
| `docs/development/testing.md` | 脚本数、`test:ui` 段 | 必须写明「仅本地、不参与 CI」与 assets 需先 `pnpm run build` |
| `scripts/testing/run-test-owner.mjs` | 治理段加守卫测试文件 | 与 `tests/vitest-reporting.test.mjs` 同层 |
| `scripts/testing/tests/run-test-owner.test.mjs` | 治理文件清单断言同步 | 该测试对治理段做精确断言 |

## 2. 根配置形状与必须实测的四点

```ts
// vitest.config.mts（根）
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

必须逐条实测（禁止以推测代替）：

1. **`root` 继承**：projects 模式下各项目的 `root` 是根配置目录还是项目配置目录。repository 域配置的 `include` 是按仓库根写的（它平时靠 `--root ../..` 运行）。若 projects 下 root 变成项目配置所在目录，需要在根配置里给该项目显式传 `root`（`projects` 支持对象形式）或调整 include —— 且必须确认 `run-test-owner.mjs` 用绝对 `--config` 的调用方式不受影响。
2. **environment 隔离**：api 项目 `environment: node`、web 项目 `jsdom`，在同一个面板进程里各自生效（跑一次 `--run` 或看面板用例状态确认 web 组件用例不因缺少 DOM 失败）。
3. **alias 解析**：api 的 `@` → `apps/api/src`、web 的 `~` → `apps/web/app` 在各自项目内仍生效。
4. **计数一致**：面板/一次性运行的三域用例数与单域运行一致（API 134/884、Web 220/1534、仓库域按治理段）。

`test:ui` 脚本显式带 `--config vitest.config.mts`，避免将来根出现第二个配置时歧义。

## 3. 漂移守卫

新增 `tests/vitest-projects.test.mjs`（与 `tests/vitest-reporting.test.mjs` 同一治理层，注册进 `governanceNodeTests`），断言：

- 根配置存在，且解析出的 `projects` 恰好等于三个域配置路径（集合相等，顺序无关）；
- 三个路径在磁盘上存在；
- 各域配置的关键形状仍成立：api `environment: "node"`、web `environment: "jsdom"`、repository 无 coverage 块（与 reporting 守卫互补，不重复断言阈值）；
- 根配置不声明 `coverage`；
- **（复核补齐）** 每个项目条目的 `root`，以及 api/web 条目的 cwd 桥（`IMS_PANEL_WORKSPACE_ROOT` 与 `setupFiles`）与 repository 条目不携带该桥。`root` 决定 `include` 相对谁解析；漏掉它不会让任何断言失败，但面板会静默换一整套用例（实测：删掉 `root: 'apps/api'` 后 api 项目从 884 用例变成根目录 5 个 governance 文件，而守卫仍全绿）。

实现方式沿用 reporting 守卫的文本解析风格（`objectAfter(source, marker)` 切平衡括号），不引入 vitest 运行时依赖——治理段本身跑在 Vitest 里，但解析项目配置用文本更稳。

## 4. 已知限制（写进文档，不做配置层规避）

- API 项目的 `apps/api/tests/assets` 断言已构建的 Web 客户端。UI 首次使用前需 `pnpm run build`（或在面板里忽略这两个文件的失败）。**不**在配置层 exclude，那会改变 CI 行为。
- 根 UI 不产覆盖率；覆盖率门禁仍只属于 API 与 Web 的 CI 步骤（`IMS_TEST_COVERAGE_ENABLED=true`）。
- 仓库域在根 UI 里同样会执行三条 CI 调用所覆盖的全部文件；本地面板不做分批。

## 5. 回滚

Stage 1 是单提交：`package.json` + `pnpm-lock.yaml` + 根配置 + 治理（白名单、Python 断言、上限）+ 守卫测试 + 文档。回滚即 revert 该提交，回到「根无 vitest、仓库域配置为纯对象」的状态。

## 6. 风险

| 风险 | 应对 |
| --- | --- |
| projects 模式下 include/root 与单域不一致 | 事实点 1/4 实测通过才继续；必要时给项目传显式 `root` |
| 守卫测试硬编码阈值，阈值棘轮时误报 | 只断言结构与路径，不断言数值（与 reporting 守卫同约定） |
| 白名单放宽后被滥用（根继续塞依赖） | Python 用例保留「非法依赖被拒绝」断言；文档写明白名单语义 |
| 另一会话的未提交改动混入 | 全程 worktree 施工，根检出不动 |

## 7. 复核修正（2026-09-19）

`trellis-check` 复核给出 REWORK：一条阻断项已修，其余为事实性修正。

| 项 | 问题 | 处理 |
| --- | --- | --- |
| B1（阻断） | 守卫不守 `root:`，删掉 `root: 'apps/api'` 后面板 api 项目静默收集根目录 5 个 governance 文件（884→5），守卫仍 5/5 绿 | 守卫加 `root` 断言，以及 api/web 的 cwd 桥断言与 repository 不携带该桥的断言；守卫 5 例→6 例，两个反向触发实测均可失败 |
| S1 | `apps/api/vitest.config.mts` 与 `apps/web/vitest.config.ts` 的注释仍称「根只能声明 husky」，与白名单现状不符 | 改成与 repository 配置同口径的表述（域各持一份配置、根面板指向它们而非复述） |
| S2 | `docs/development/testing.md` 的 `sh` 代码块顶格，把所属列表项截断 | 代码块与续写段落缩进 2 空格 |
| S3 | 文档称 assets 两个文件都「在收集阶段失败」 | 只有 `frontend-routing.contract.test.js` 是收集期失败；`client-allowlist.test.js` 的 fs 访问在用例内，属运行期 |
| S4 | lockfile 中 api/web 的 `vitest` version 串多出 `(@vitest/ui@4.1.11)` peer 后缀，形似版本升级 | 同一个 4.1.11 的 peer 上下文变化，非升级；已在 `verification.md` 写明，避免复核者误判为违反「不得顺带升级依赖」 |
| S5 | 根配置注释称 `groupOrder` 必须逐项目唯一 | 实际约束是「不同 `maxWorkers` 的项目不能同组」，注释按实改写 |
| S6 | 规划文档未记录 `forbiddenRoot` 删项 | 已补进 §1 表格（该改动是必需项，非可选） |
