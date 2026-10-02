# A1 判据回扫（2026-09-20）

design §9 记录的判据漂移：A3 用可机检的「连续 ≥2 条共享同一 ≥3 词字面前缀」，A1 用更松的「连续同类」。本轮回扫把全库统一到 A3 口径。

## 工具

- `tools/scan-second-level.mjs <tests-dir> [--json <out>] [--a1 <plan>]`
  报告「直接挂在主体 suite 下、连续 ≥2 条共享同一 ≥3 词字面前缀」的段。合并后的文件里主体 suite 位于块级作用域内的第 1 层，因此判据是「父 describe 是该块里最外层的 describe」，不是列 0。
- `tools/plan-second-level.mjs <scan.json> <out.json> --pick <path::phrase> … --indent 2`
  由起始行推出「该段最后一条用例的闭合行」，生成 `apply-nested-taxonomy.mjs` 的计划。
- `tools/apply-nested-taxonomy.mjs`（放宽为同时接受 `postgresTest(` 用例声明形状，与治理分析器同口径）。

扫描过程中修掉扫描器自身两个 bug：① 原先把「两条用例之间」判成从前一条**起点**到后一条起点，中间必然是前一条的函数体，导致全库归零；② 闭合行判定 `^\s*[)}];?\s*$` 只允许一个闭合字符，而 `});` 是三个，导致每一对相邻用例都被当成「有兄弟语句」。

## 全库候选与裁决（7 段 / 6 文件）

| 文件 | 短语 | 段长 | 裁决 |
| --- | --- | --- | --- |
| `server/events.test.ts`（成员 `events-pagination`） | `cursor event pagination` | 2 | **应用** |
| `server/admin.test.ts`（成员 `admin-accounts.contract`） | `administrator deletion preserves` | 2 | **应用** |
| `hono-app-contract.test.js` | `[SEC-01] production requires` | 2 | 拒绝：用例编号属于用例，不进入类别名（批次 D 已确立） |
| `server/fudaba.test.ts`（成员 `fudaba-domain-repository`） | `real PostgreSQL enforces` | 2 | 拒绝：全文件出现 5 次，成员集合不恰好是一段；A2 已判为环境前缀 |
| `server/fudaba.test.ts`（成员 `fudaba-office-management-repository`） | `real PostgreSQL owner` | 2 | 同上（出现 3 次） |
| `server/platform-profile.contract.test.ts` | `Platform profile writes` | 2 | 拒绝：出现 4 次，A4 已按同一理由拒绝 |
| `upload-contract.test.ts` | `${name} multipart parser` | 6 | 拒绝：`for` 循环模板标题，A4 已拒绝 |

后 3 条的拒绝理由与既有批次记录**独立吻合**，说明扫描器复现了原判据。

## 应用结果

- 变更 2 文件；`tools/check-batch-shape.py`：断言行多重集变化 0、用例 11 → 11（静态标题计数）、标题无损映射失败 0。
- 两文件实跑 2 文件 / 24 用例通过；契约校验器 31 entries exit 0；`tsc -p tsconfig.tests.json` exit 0。
- 整域 PG 开启 72 / 884 通过；PG 关闭 72 / 666 passed / 218 skipped（与基线逐项相同）。
- 提交 `1ddcee10 test(api): nest the two runs the first batch left flat`。

## 附带发现：一个先于本任务的顺序依赖（已修）

随机顺序验证（`--sequence.shuffle`，新种子 `20260920`）暴露 `tests/node.test.js` 中 `node security` 的两条 chronicle 用例失败：`ENOENT ... event-chronicle/metadata/activity-state.json` 与 `…/activity-é.json`。

判据与结论：

- 失败的两条属于**同一成员**（`node-security/chronicle-event.owner.js`），不是跨成员干扰。
- 把该成员在合并前（`17d4172f^`）与归类前（`27828b24^`）的原始文件取出来单独跑，**同样失败**（种子 `20260920` 两条、种子 `7` 一条）→ 与本次归类、合并均无关，是既有的顺序依赖，由合并引入的 shuffle 验证暴露。
- 根因：`tests/node-security/fixture.js` 的 `beforeAll` 建了 `NAMECARD_DIR` / `EVENT_DIR`，但没建 `event-chronicle/metadata`；几条 chronicle 用例直接往该目录写自己的元数据夹具，原本只能靠「更早的用例碰巧发过请求让应用把它建出来」通过。
- 修复：在夹具里与其他目录一起 `fs.mkdirSync(path.join(chronicleBase, 'metadata'), { recursive: true })`。修复后 `tests/node.test.js` 在 4 个种子（含原先必失败的 `20260920`、`7`）下均 37/37 通过，整域在原失败种子下 72 / 884 通过，默认顺序与 PG 关闭路径计数不变。
- 提交 `test(api): keep the event chronicle fixture directory present`。
