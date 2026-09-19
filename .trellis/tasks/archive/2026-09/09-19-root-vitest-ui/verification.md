# 验收记录：根级 Vitest UI

## 1. 环境

| 项 | 值 |
| --- | --- |
| worktree | `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy` |
| 分支 / 基线 | `chore/vitest-ui-and-test-taxonomy` ← `release/v1.1` @ `101e1900` |
| Node / pnpm | v24.18.0 / 11.10.0 |
| 面板与门禁命令 | `pnpm run test:ui`、`pnpm exec vitest run --config vitest.config.mts [--project=…]` |

## 2. 用例计数（面板 vs 单域）

| 域 | 面板收集 | 单域运行 | 说明 |
| --- | --- | --- | --- |
| api | 134 文件 / 884 用例 | `cd apps/api && pnpm exec vitest run` 134 / 884 | 含 `tests/assets`；CI 的 API lane 带 `--exclude tests/assets/**`，是 132 / 874，面板是它的超集 |
| web | 220 文件 / 1534 用例 | `VITE_IMS_APP_TARGET=web pnpm exec vitest run` 220 / 1534 | 面板未设 `VITE_IMS_APP_TARGET`，结果一致 |
| repository | 11 文件 / 127 用例 | governance 5 / 71 + contracts 3 / 29 + delivery root 3 / 27 | delivery repository 1 / 6 与其重复；面板一次跑完三条 CI 调用覆盖的全部文件 |
| 合计 | 365 文件 / 2545 用例 | — | 收集层面由复核子代理用 `vitest list` 逐项目名称集与单域运行 `diff` 独立比对，完全一致 |

执行层面：面板整进程 365 文件 / 2544 用例全绿（实现阶段实测，当时守卫 5 例；守卫加到 6 例后合计为
2545）；复核子代理独立执行了面板的 web 域（220 / 1534 全绿）。**面板里 api 域的 884 用例只做到收
集层面，未独立复跑**（需要 PostgreSQL 与 API 构建产物）；仓库域的执行由治理/契约/delivery 三条
owner 调用覆盖。

## 3. 门禁输出

| 命令 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0，`Already up to date` |
| `pnpm run check:boundaries` | exit 0 |
| `pnpm run check:rules` | exit 0（25 个 Markdown 文件通过，244 mounted route instances） |
| `pnpm run check:root` | exit 0（约 1m56s，复核子代理测） |
| `python3 -m unittest tests.test_workspace_boundaries …test_operations_docs …test_docs` | exit 0，`Ran 40 tests OK` |
| `node scripts/testing/run-test-owner.mjs governance` | exit 0：Node 5 文件 / 71 用例 + Python `Ran 123 tests in 142.462s OK` |
| `node scripts/testing/run-test-owner.mjs contracts` | exit 0：3 文件 / 29 用例 |
| `node scripts/testing/run-test-owner.mjs delivery repository` | exit 0：1 文件 / 6 用例 |
| `pnpm run test:ui`（无头） | `UI started at http://localhost:<port>/__vitest__/`，`GET` 该地址 HTTP 200 且含 `<title>Vitest</title>` |

## 4. 守卫的正反向证据

`tests/vitest-projects.test.mjs` 现为 6 例。反向触发全部临时改动、跑完即还原，`vitest.config.mts`
还原后 md5 = `6eb8182441d3e096a8501ab3bfbd3d2a`（与改动前一致）：

| 反向改动 | 期望 | 实测 |
| --- | --- | --- |
| `apps/api/vitest.config.mts` 的 `include` 收窄为 `tests/server/**` | 失败 | `AssertionError: api test include globs`，exit 1 |
| `include` 改写成单字符串（非数组） | 失败（不是静默漏判） | `AssertionError: api test include globs` |
| `projects` 里 repository 配置改名 | 失败 | `AssertionError: the root panel must reference exactly the api, web and repository configs` |
| **删掉 `root: 'apps/api'`** | 失败 | `AssertionError: api must resolve its include from apps/api`，exit 1 |
| **删掉 api 条目的 `setupFiles`** | 失败 | `AssertionError: api must install the cwd bridge`，exit 1 |
| 把 `prettier` 加进 `allowRootDevDependencies` | Python 用例失败 | `tests/test_workspace_boundaries.py` 该用例 FAILED（证明白名单断言非恒真） |
| 把 `vitest.config.mts` 加回 `forbiddenRoot` | `check:boundaries` 失败 | exit 1，报 `vitest.config.mts: application code must live in a workspace` |

## 5. 复核结论与修正

`trellis-check` 给出 REWORK，一条阻断项与六条事实性修正，均已处理（详见 `design.md` §7）。

**B1（阻断，已修）**：守卫守了 `projects` 路径、`environment`、`include`、coverage 形状，但**没守
`root:`**——而 `root` 才决定 `include` 相对谁解析。复核者删掉 `root: 'apps/api'` 后守卫仍 5/5 全绿，
而面板的 api 项目实际收集到根目录 5 个 governance 文件（884 → 5）。这是「面板以为在跑 API 域、实际
跑别的域」且无任何信号的静默洞。修法是给守卫加 `root` 断言、api/web 的 cwd 桥断言，以及 repository
条目不携带该桥的断言；上表两条加粗的反向触发即为修复后的验证。

其余修正：两个域配置里「根只能声明 husky」的过期注释（S1）、文档列表被顶格代码块截断（S2）、
assets 两个文件失败时机描述不准（S3）、根配置注释对 `groupOrder` 约束的表述（S5）、规划文档补记
`forbiddenRoot` 删项（S6）。

**S4（lockfile 口径，需复核者注意）**：`pnpm-lock.yaml` 中 `apps/api` 与 `apps/web` 的 `vitest`
version 串新增 `(@vitest/ui@4.1.11)` peer 后缀，git diff 里形似版本升级。实际是**同一个 4.1.11**：
新增的只有 `@vitest/ui@4.1.11` 与 `@polka/url`、`sirv`、`mrmime`、`totalist` 四个传递依赖，无任何
其它包版本变化。根 `node_modules/.pnpm` 下因此存在新旧两份 vitest 目录（peer 上下文不同），
`require.resolve` 实测根与 `apps/api` 指向同一份、`apps/web` 指向自己那份，三条仓库域调用仍走
`--filter @imsweb/api exec vitest run --root ../.. --config <绝对路径>`。

## 6. 未验证 / 无法验证项

- **AC1 的浏览器操作**：无浏览器环境，只证明面板服务起来并返回 200 与三项目可 `--project=` 过滤，
  没有人工点击浏览、单跑、重跑。`test:ui` 探测时用 `CI=1` 抑制自动开浏览器，开发机默认行为不变。
- **AC2 的 api 域执行**：见 §2，只到收集层面。
- **AC6**：需推送并触发 `ci.yml` 与 `deploy-preview.yml`，本任务禁止推送，必然无法在此验证。`.github/**`
  本次零改动（`git diff --stat -- .github/` 为空），且 `grep` 确认无 CI 文件引用 `test:ui` 或根
  `vitest.config.mts`。
- 面板的 `--port` 参数在 vitest 4.1.11 不存在（`CACError: Unknown option '--port'`），等价写法是
  `--api <port>`。

## 7. 回滚

单提交，revert 即回到「根无 vitest、`forbiddenRoot` 含 `vitest.config.mts`、仓库域配置为纯对象」的
状态。回滚后需重跑 `pnpm install --frozen-lockfile`。
