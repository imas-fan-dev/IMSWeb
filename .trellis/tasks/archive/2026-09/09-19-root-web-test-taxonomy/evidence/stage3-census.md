# Stage 3 普查与收敛评估（2026-09-20）

范围：根域 `tests/` 与 `scripts/**/tests`、`apps/web/tests/e2e`、`apps/web/tests/unit`。

## 1. 归类（describe）前状态

| 域 | 文件 | 用例 | 有 describe 的文件 |
| --- | --- | --- | --- |
| 根域 `tests/` + `scripts/**/tests` | 9 | 116（runner 真值） | 0 |
| `apps/web/tests/e2e` | 42 spec | 113（`--list` 去重后 200 条 = 各 project 展开） | 4（仅 `app-oauth-sign-in` 覆盖全文件） |
| `apps/web/tests/unit` | 220 | 1251（静态计数；runner 真值 1534） | 220（全部已有顶层 describe） |

Web unit 用例数分桶：1 个用例 29 文件、2–4 个 98、5–9 个 60、10+ 个 33。单 describe 且 `it` ≥10 的文件 24 个，是二级分组的候选。

## 2. 归类结果

- 根域：9 文件全部加顶层主体，`exchange-map-assets` 加二级 `exchange map preparation`（连续 3 条共享 3 词前缀）。116 条旧全名全部无损（0 失败）。
- e2e：41 个 spec 加顶层主体（`app-oauth-sign-in` 已有顶层 describe，未动）。`--list` 名称集合逐条对应，0 失败。二级一律不加：`--list` 的层级分隔是 ` › `，吸收前缀会把旧标题路径从「字面尾段」变成「加分隔符的新串」，与无损判据直接冲突。
- Web unit：5 个文件补了二级（`platform-session-provider`、`theme-toggle`、`geolocation`、`mocks/data/fudaba`、`mocks/data/wiki`），其余 19 个候选无「连续 ≥2 条共享 ≥3 词字面前缀」的片段，保持不动。

## 3. 收敛（减少文件数）评估：Web 单测

规则沿用 API 域的「同目录 + basename 首个 kebab 段成族」，目标名取族内成员的**最长 kebab 公共前缀**（因此 `use-namecard-*` 会合成 `use-namecard.test.tsx` 而不是 `use.test.tsx`）。

- 当前 220 文件 → 151 文件（29 个多成员族、122 个单成员族），理论上可减 69 个文件，最大族 52 用例（未触及 120 用例上限）。
- 用 API 域那套 `merge-family.mjs` 干跑：**29 个族只有 7 个可合并（−22 文件），22 个被拒**。拒绝理由三类：

| 类别 | 例子 | 性质 |
| --- | --- | --- |
| import 解析异常 | 把 `)`、`}`、`href: "https://www.openstreetmap.org/copyright"` 当成标识符（来自 `@testing-library/react`、`node:fs`） | 工具自身缺陷：Web 文件里 `vi.mock("...", () => ({ … }))` 跨行工厂让朴素的逐行 import 切分错位 |
| 由上一条派生的假冲突 | `expect`→`expectFromVitest`、`describe`→`describeFromVitest`、`render`→`renderFromClient`、`it`→`itFromVitest` | 工具自身缺陷：绑定归属被算错，于是把 vitest/testing-library 的同名全局当成两个不同符号 |
| 真实阻塞 | `pages/community/exchange/exchange`：两个成员对 `~/lib/api` 的 `vi.mock` 工厂不同（提升到文件顶层必然冲突）；`use-namecard`、`events`、`story-page`：标题多重集自检失败（33→30、15→13、9→7） | 合并本身的障碍，fail-closed 正确触发 |

结论：**本阶段不做 Web 单测的文件合并**。理由不是「合并没收益」，而是「当前工具在 Web 树的解析不可信」——同一个合并器在这次干跑里同时产生了假冲突与真实拒绝，若用它做部分合并（只合 7 个族），会留下「为什么 fudaba 合了、platform 没合」这种无法自解释的结构。要推进只有两条路：把合并器的 import 解析与全局绑定归属重写成可信实现（按代码位置扫描而非逐行，并把 vitest/testing-library 的全局视为可共享），或者保持现状。证据（计划与干跑输出）留在 `tools/web-merge-plan.json` 与本文件。

## 4. e2e / 根域是否合并

- e2e：不合并。`playwright.config.ts` 为 `fullyParallel: true`，调度单位是**用例而非文件**，合并文件不增加并行度；每个 spec 对应一条用户流程，合并会牺牲报告粒度与失败定位。42 个 spec / 113 用例（平均 2.7）不存在 API 那种「同模板复制十几份」的碎法。
- 根域：不合并。9 个文件分别对应独立治理主题（开发环境启动器、受影响工作区判定、地图资源、Tauri 构建配置、Tauri 设备投递、非 JSON 边界清单、路由元数据编译器、路由清单编译器、run-test-owner 计划），不存在可归并的同族成员。
