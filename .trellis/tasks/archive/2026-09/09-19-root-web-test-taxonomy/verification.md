# 验证记录：根域 / Web / E2E 测试归类

worktree `/Users/texas/Workspace/IMSWeb/.worktrees/vitest-ui-and-test-taxonomy`，
分支 `chore/vitest-ui-and-test-taxonomy`（基于 `release/v1.1`）。

## 1. 提交序列

| 提交 | 内容 | 文件 |
| --- | --- | --- |
| `26f5f36c` | 根域 9 文件加顶层主体（+ `exchange-map-assets` 二级） | 9 |
| `128b1f3a` | e2e 41 spec 加顶层主体 | 41 |
| `9094facc` | Web unit 5 文件补二级 | 5 |

批次 E（根域 `tests/`）与 F（`scripts/**/tests`）合为一个提交，因为两者同属根域 owner、用例数极少且互不依赖；G（e2e）与 H（Web unit）各自成提交，便于单域回滚。

## 2. 三域计数

| 域 | 归类前 | 归类后 | 证据命令 |
| --- | --- | --- | --- |
| 根域（governance） | 5 文件 / 71 用例 | 5 文件 / 71 用例 | `node scripts/testing/run-test-owner.mjs governance` |
| 根域（contracts） | 3 / 29 | 3 / 29 | `... contracts` |
| 根域（delivery root） | 3 / 27 | 3 / 27 | `... delivery root` |
| 根域（delivery repository） | 1 / 6 | 1 / 6 | `... delivery repository` |
| Python 治理套件 | Ran 123 OK | Ran 123 OK | 同上 governance |
| Python 交付套件 | Ran 2 OK | Ran 2 OK | 同上 delivery root |
| e2e（Web 配置） | `--list` 逐条一致 | 122 passed / 11 skipped | `CI=1 playwright test --workers=1 --retries=0` |
| e2e（App 配置） | `--list` 逐条一致 | 58 passed / 9 skipped | 同上 + `--config playwright.app.config.ts` |
| Web unit | 220 文件 / 1534 用例 | 220 文件 / 1534 用例 | `pnpm --filter @imsweb/web run test:unit` |

归类不改用例集合，所以「前」的数字取自归类前的同域 owner/套件运行记录，不是单独重跑；根域四条 owner 输出在归类前后逐字相同。

## 3. 名字无损

统计口径：旧全名必须是**唯一一条**新全名的字面尾段（Vitest 的 `fullName` 是 describe 路径与标题的拼接，因此「逐字节相同」只在标题本来就以主语开头时才可能）。

| 域 | 用例数 | 逐字节相同 | 仅增加 describe 路径 | 映射失败 |
| --- | --- | --- | --- | --- |
| 根域 | 116 | 0 | 116 | 0 |
| e2e | 133（`--list` 行） | 8（未改动的 `app-oauth-sign-in`） | 125 | 0 |
| Web unit | 72（5 文件） | 72 | 0 | 0 |
| Stage 3 合计（复核） | 271 | 233 | 38 | 0 |

根域全部「仅增加路径」是因为这些文件原本把主语写在每条标题里（例如 `test namecard capture ...`），加顶层 describe 后逐字节相同在数学上不可能；标题本身一字未动。

e2e 的 `--list` 名称集合 diff 见 `evidence/g-e2e-before.txt` 与 `evidence/g-e2e-after.txt`（归类前 199 行、归类后 199 行，逐行对应）。

## 4. 断言未动

`check-batch-shape.py` 的「断言行多重集」在 55 个改动文件里报了 26 个 e2e 文件「变化」。逐个查证后结论是**格式而非断言**：包裹后缩进多 2 格，prettier 按 80 列重新折行。`git diff -w`（忽略空白）在这些文件里只剩 `test.describe(...)` 与 `});` 两行；根域同理（忽略空白后 4 行差异）。3 个语料库文件（`namecard-claim-workflow.spec.ts`）的既有长行也被 prettier 重排，无表达式变化。

## 5. 二级分组裁定

机械扫描器（`scan-second-level.mjs`，判据＝连续 ≥2 条共享 ≥3 词字面前缀）的结果：

| 域 | 残留候选 | 处置 |
| --- | --- | --- |
| 根域 `tests/` | 0 | — |
| 根域 `scripts/` | 0 | — |
| e2e | 0 | 归类时一律不加二级（分隔符 ` › ` 与字面尾段判据冲突） |
| Web unit | 6 个文件各 1 段 | 全部**不采纳**，理由见下 |

Web unit 的 6 个残留候选：`lib/api/api.test.ts`（`does not refresh`）、`lib/api/origin.test.ts`（`resolves the site origin against the`）、`mocks/data/editorial.test.ts`（`builds a spotlight`）、`mocks/data/namecards.test.ts`（`builds a namecard`）、`pages/tier-list/tier-list-model.test.ts`（`removes an item from`）、`pages/tier-list/tier-list-storage.test.ts`（`returns null for`）。前两条与后两条的短语是**动词短语/句子开头**（`returns null for` 单独成句会悬空），做成套件名要么读不通、要么把同一短语在套件名与标题里重复一遍；第三、四条形状与已采纳的 `mocks/data/fudaba.test.ts`（`builds a card`）、`mocks/data/wiki.test.ts`（`builds a public`）一致，但它们所在的文件不在「单 describe ≥10 用例」的采样阈值内——按已确认的默认（Web unit 只处理 ≥10 用例的文件）保持一级。这一条是**阈值边界而非质量问题**，若希望 Web unit 的二级分组彻底完整，只需把阈值下调并重放同样的机械判据。

被处理的 5 个文件：`components/platform/platform-session-provider.test.tsx`、`components/shared/theme-toggle.test.tsx`、`lib/geolocation.test.ts`、`mocks/data/fudaba.test.ts`、`mocks/data/wiki.test.ts`，72 条全名逐字节不变。

## 6. 收敛（减少文件数）

结论是 Web 单测不做文件合并，20 个族的干跑数据、三类拒绝理由与「要么重写合并器的 import 解析、要么保持现状」的两条路写在 `design.md` §7，逐条数值在 `evidence/stage3-census.md`。计划与工具留在 `tools/`（`web-merge-plan.py`、`web-merge-plan.json`、打过补丁的 `merge-family.mjs`）。

## 7. 验收命令与结果

```sh
node scripts/testing/run-test-owner.mjs governance     # exit 0，5 文件 / 71 用例 + Python Ran 123 OK
node scripts/testing/run-test-owner.mjs contracts      # exit 0，3 文件 / 29 用例
node scripts/testing/run-test-owner.mjs delivery root  # exit 0，3 文件 / 27 用例 + Python Ran 2 OK
node scripts/testing/run-test-owner.mjs delivery repository  # exit 0，1 文件 / 6 用例
pnpm --filter @imsweb/web run test:unit                # exit 0，220 文件 / 1534 用例
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0
CI=1 pnpm --filter @imsweb/web exec playwright test --workers=1 --retries=0 --config playwright.app.config.ts
node scripts/check-docs.mjs                            # 25 个 Markdown 文件通过分类与链接校验
```

三个提交各自的 pre-commit 链均全绿（contracts 29、api `test:migration` 11 文件 / 114 用例、web `routes.test.ts` 4、`check:root`、web lint/typecheck、api syntax、api `check:architecture` 381 模块、`tsc -p tsconfig.tests.json --noEmit`）。

## 8. 已知偏差

- implement.md 5.3 的绝对表述「Web unit 无『单 describe ≥10 it』」不可达且非目标：判据已细化为「单 describe ≥10 用例，且存在连续 ≥2 条的 ≥3 词字面前缀段」，因此 19 个无可用片段的文件保持一级（`lib/api/origin.test.ts` 27 条、`lib/api/api.test.ts` 25 条等）。计数与名字不受影响。
- e2e 归类前没有整套实跑基线（该套件的验收方式就是实跑），证据由 `--list` 名称集合 diff 加归类后两套配置全绿共同承担。
- 静态用例计数与 runner 真值在四处不一致（`ci-affected-workspaces` 静态 11 / runner 28、`compile-route-inventory` 14 / 19、`non-json-boundaries` 13 / 4、根域合计 103 / 116），统一以 runner JSON 为准，这是扫描器不展开 for 循环与 wrapper 注册的固有偏差。
