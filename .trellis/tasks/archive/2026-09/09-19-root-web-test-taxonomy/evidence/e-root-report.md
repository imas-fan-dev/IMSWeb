# 根域 9 文件归类证据（批次 E/F 合并执行）

施工目录：`.worktrees/vitest-ui-and-test-taxonomy`。改动未提交。

## 结论

- 9 个文件全部补上顶层 `test.describe`，主体名取自文件自身词汇；仅 `exchange-map-assets.test.js` 命中二级 describe 规则。
- 用例数 116 → 116；旧全名一一对应为某个新全名的字面尾段，失败 0。
- 根域四段 owner 全绿：governance、contracts、delivery root、delivery repository。

## 逐文件

| 文件 | 用例 | 顶层 describe | 二级 describe | 逐字不变 | 加前缀 | 失败 |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/development-environment.test.js` | 20 | development environment launcher | 无 | 0 | 20 | 0 |
| `tests/ci-affected-workspaces.test.js` | 28 | affected workspace classification | 无 | 0 | 28 | 0 |
| `tests/exchange-map-assets.test.js` | 6 | exchange map assets | exchange map preparation | 0 | 6 | 0 |
| `tests/tauri-build-configuration.test.js` | 11 | tauri build configuration | 无 | 0 | 11 | 0 |
| `tests/tauri-device-delivery.test.js` | 10 | tauri device delivery | 无 | 0 | 10 | 0 |
| `tests/contracts/non-json-boundaries.test.mjs` | 4 | non-JSON boundary inventory | 无 | 0 | 4 | 0 |
| `scripts/contracts/tests/compile-frontend-route-metadata.test.mjs` | 6 | frontend route metadata compiler | 无 | 0 | 6 | 0 |
| `scripts/contracts/tests/compile-route-inventory.test.mjs` | 19 | route inventory compiler | 无 | 0 | 19 | 0 |
| `scripts/testing/tests/run-test-owner.test.mjs` | 12 | run-test-owner plan | 无 | 0 | 12 | 0 |
| **合计** | **116** | | | **0** | **116** | **0** |

「加前缀」表示该用例只是多了一层 describe 路径，去掉路径后标题逐字未动；「逐字不变」指全名原样，本批为 0（每个文件都新增了顶层 describe，所以每条都长了一层前缀）。

## 二级 describe 的取舍

判定规则来自委托说明：只在连续 ≥2 条用例共享同一 ≥3 词字面前缀时补二级，短语成为标题并从用例名中删去。

- `exchange-map-assets.test.js`：前 3 条连续用例均以 `exchange map preparation` 开头（3 词），故建二级 describe 并统一删去该前缀，成为 `plans a complete z0-11 same-origin release`、`rejects unsafe or ambiguous options`、`is a no-write dry-run by default`。后 3 条 `OpenMap publication ...` 只有 2 词公共前缀，留在主体层。
- 其余 8 个文件：无连续同性类别。逐一看过，能凑出的最长连续公共前缀都只有 2 词或更短，例如 `development launcher`、`development configuration`、`development preparation`、`app release`、`device delivery`、`rejects`、`CLI`、`the`、`every`；都达不到 ≥3 词，因此只加顶层主体，不硬凑类别名。

没有第三层，也没有同名兄弟 suite；单条用例留在主体层。

## 名字无损判据

真值取自 Vitest 自带 JSON reporter 的 `assertionResults[].fullName`（即 `[...ancestorTitles, title].join(' ')`），未手写解析器。改前改后各采一次：

```
cd .worktrees/vitest-ui-and-test-taxonomy/apps/api
pnpm exec vitest run --root ../.. --config scripts/testing/vitest/vitest.repository.config.mts \
  tests/development-environment.test.js tests/ci-affected-workspaces.test.js \
  tests/exchange-map-assets.test.js tests/tauri-build-configuration.test.js \
  tests/tauri-device-delivery.test.js tests/contracts/non-json-boundaries.test.mjs \
  scripts/contracts/tests/compile-frontend-route-metadata.test.mjs \
  scripts/contracts/tests/compile-route-inventory.test.mjs \
  scripts/testing/tests/run-test-owner.test.mjs \
  --reporter=json --outputFile=/tmp/root-taxonomy/<phase>.json
```

对每个旧全名，要求在未被占用的新全名中找到一个满足 `new === old` 或 `new.endsWith(" " + old)` 的对应项，消耗式一一匹配。结果：116 条旧名全部匹配，0 失败，0 多余新名，逐文件计数与表内一致。完整名单见 `e-root-names-before.txt` 与 `e-root-names-after.txt`。

## owner 命令与退出码

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node scripts/testing/run-test-owner.mjs governance` | 0 | 5 files / 71 tests passed |
| `node scripts/testing/run-test-owner.mjs contracts` | 0 | 3 files / 29 tests passed |
| `node scripts/testing/run-test-owner.mjs delivery root` | 0 | 3 files / 27 tests passed |
| `node scripts/testing/run-test-owner.mjs delivery repository` | 0 | 1 file / 6 tests passed |
| `node scripts/testing/run-test-owner.mjs delivery`（裸调用） | 1 | `delivery profile must be root, repository, app, web, or integration` |

各段用例数与改前逐文件计数一致：governance 段含本批 3 个文件（20 + 28 + 12 = 60）加未改动的 `tests/vitest-reporting.test.mjs`（11）；contracts 段 4 + 19 + 6 = 29；delivery root 段 6 + 11 + 10 = 27；delivery repository 段只有 `exchange-map-assets.test.js` 6 条。

## 说明与偏离

- 使用 `test.describe(...)` 而不改 import 行，依据本任务 `design.md` §1「沿用 `import { test } from 'vitest'` + `test.describe`，不改导入行」。委托说明允许把 `describe` 加进具名导入，这里取了更保守的一种。
- 裸跑 `delivery` 会因缺少 profile 参数退出 1，这是 `run-test-owner.mjs` 的既有行为，不是本批引入的回归；委托说明要求的两次交付实际对应 `delivery root` 与 `delivery repository`。
- 委托说明给出的静态用例数与 runner 计数在 3 个文件上不符：`ci-affected-workspaces`（静态 11 / runner 28，因一个循环按路径各生成一条）、`compile-route-inventory`（静态 14 / runner 19，两处循环）、`non-json-boundaries`（静态 13 / runner 4，文件本身只有 4 个 `test()`）。以 runner JSON 为准，归类前后三者的计数都未变。
- 未去重任何 wrapper + 逐 case 的重复执行结构，符合「只归类、不去重」。
