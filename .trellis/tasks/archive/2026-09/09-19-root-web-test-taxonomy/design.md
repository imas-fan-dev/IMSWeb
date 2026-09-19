# 技术设计：根域 / Web / E2E 测试归类

## 1. 根契约与治理（10 文件 / 99 用例）

**主体选取**：按被治理对象命名，与文件名一致，例如

| 文件 | 顶层主题 | 二级类别示例 |
| --- | --- | --- |
| `tests/development-environment.test.js` | `development environment launcher` | `container target`、`R2 hot reload`、`doctor` |
| `tests/ci-affected-workspaces.test.js` | `affected-workspace classification` | `ownership table`、`diff parsing`、`failure handling` |
| `tests/contracts/non-json-boundaries.test.mjs` | `non-JSON boundary inventory` | `stale symbols`、`schema provenance`、`duplicate response kinds` |
| `scripts/contracts/tests/compile-route-inventory.test.mjs` | `route inventory compiler` | `mounting`、`validation` |
| `scripts/testing/tests/run-test-owner.test.mjs` | `run-test-owner plan` | `governance steps`、`api steps`、`web steps` |

要点：

- 沿用 `import { test } from 'vitest'` + `test.describe`，**不改导入行**。
- **wrapper 结构保留**：迁移期为保住 `node:test` 的 `t.test` 计数，部分文件是「一个计数 wrapper 用例 + 每 case 一个用例」，case 体执行两次。本次把它们一起放进对应 `describe`，**不去重**（去重会改变用例数，属于另一个决策）。
- 用例名去掉被 describe 承载的前缀后逐字保留。

## 2. Playwright e2e（42 spec / 115 用例）

- **主体 = 页面或流程**，通常就是文件名语义：`admin-accounts.spec.ts` → `test.describe('admin accounts', ...)`；`app-navigation.spec.ts`（13 用例）按导航区域拆 2–3 个顶层 describe 更合理。
- 允许的 `describe` 数：每 spec 1–3 个；**不**加 `test.describe.configure({ mode: 'serial' })`，不改 `playwright*.config.ts`。
- **取证方式**：`pnpm --filter @imsweb/web exec playwright test --list`（既有脚本 `test:e2e` 是 `playwright test`，额外参数走 `pnpm exec`）。首批执行时必须先确认 `--list` 输出里嵌套标题的实际格式（缩进的层级文本 vs 全名），再据实编写比对脚本；若 `--list` 不足以还原层级，改用 `--reporter=json`。
- 实跑取证只在触碰过的 spec 上做，按仓库既有约定 `CI=1 <e2e> --workers=1 --retries=0 <spec>`。

## 3. Web unit（只处理「单 describe ≥10 it」的文件）

- 这批文件的顶层 describe 已经是主体名（组件/模块/页面），因此只补**二级类别**：把 15–27 个 `it` 按主题聚成 2–4 组（如 `origin.test.ts` 的「解析」「策略判定」「错误」）。
- 沿用文件现有的具名 `describe` / `it` 导入与 `expect` 断言，不改 helper、mock、`beforeEach` 位置。
- 阈值固定为 **≥10 个 `it`**，执行时用脚本重算文件清单并写进 `verification.md`（普查时点是 11 个文件左右，以执行时点为准）。
- 小于阈值的 200 余个文件**一个都不动**——避免无收益 churn 掩盖真实改动。

## 4. 证据采集

| 域 | 命令 | 取什么 |
| --- | --- | --- |
| 根域 | `pnpm --filter @imsweb/api exec vitest run <files> --reporter=json --outputFile=/tmp/root-<batch>-<phase>.json` | 全名集合 + 用例数 |
| Web unit | 同上（`--root ../..` 由配置决定，实际按 web 域自己的配置跑） | 全名集合 + 用例数 |
| e2e | `pnpm --filter @imsweb/web exec playwright test --list` | 用例全名集合 |

采集脚本复用父任务目录下的工具（`09-19-vitest-ui-and-test-taxonomy/tools/`），不新增 package.json 脚本。

## 5. 风险表

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| e2e `--list` 输出格式与预期不符 | 名字集合无法机检 | 首批先验证格式；退 `--reporter=json`；再不行逐 spec 人工核对 + 计数断言 |
| Web unit 分组把 helper/共享状态顺序改坏 | 用例互相污染 | 只插 `describe` 行与缩进，不动 `beforeEach`/mock 注册顺序；批内跑该文件 |
| 根域 wrapper 与 case 语义混淆 | 归类错位 | wrapper 与 case 同放一个 describe；不动去重问题 |
| e2e 实跑成本高 | 验收拖延 | 默认 `--list` 取证，实跑只覆盖触碰的 spec，必要时 `--workers=1 --retries=0` 单跑 |
| 大量小 diff 掩盖真实改动 | 评审失效 | Web unit 只动 ≥10 it 的文件；每批一个提交、批说明写清文件数 |

## 6. 回滚

四批各自独立提交（根 `tests/`、根 `scripts/**/tests`、e2e、Web unit）；回滚即 revert 对应提交，互不依赖。

## 7. 收敛评估：Web 单测不合并（2026-09-20）

承接父任务 R7「合并同主题族文件」的思路，对 Web 单测做了同样的普查与干跑，结论是**不合并**，依据三条：

1. **理论空间**：220 文件按「同目录 + basename 首个 kebab 段」可合成 151 文件（−69，最大族 52 用例）。目标名取族内最长 kebab 公共前缀，避免 `use.test.tsx` 这类退化命名。
2. **实际可合并性**：拿 API 域那套 `merge-family.mjs` 干跑，29 个族只有 7 个通过（−22 文件，涉及 39 用例）。22 个被拒的理由里大部分是**工具自身缺陷**——Web 文件里跨行的 `vi.mock("…", () => ({ … }))` 工厂让工具的朴素的逐行 import 切分错位，把 `)`、`}`、`href: "https://…"` 当成标识符，进而把 vitest / testing-library 的同名全局（`expect`、`describe`、`it`、`render`）算成「同名的两个不同符号」并要求改名。另有真实阻塞：同模块 `vi.mock` 工厂不同（`pages/community/exchange/exchange`），以及标题多重集自检失败（`use-namecard` 33→30、`events` 15→13、`story-page` 9→7，fail-closed 正确触发）。
3. **一致性**：只合那 7 个能通过的族，会把结构变成「有的同族合了、有的没合」，而这个差异只能靠读本次任务证据才能解释。要么重写合并器的 import 解析与绑定归属（按代码位置扫描而非逐行，并把测试全局视为可共享）后整体推进，要么保持现状。

e2e 与根域同样不合并：Playwright 是 `fullyParallel: true`（调度单位是用例，不是文件），合并文件不增加并行度，却牺牲报告粒度；根域 9 个文件各自对应独立治理主题，不存在同族成员。

计划与干跑证据：`tools/web-merge-plan.json`、`tools/web-merge-plan.py`、`tools/merge-family.mjs`（已打三处补丁：Web 别名 `~/`、非法标识符拒绝而非崩溃、`--root/--plan` 参数化），逐条数值见 `evidence/stage3-census.md`。
