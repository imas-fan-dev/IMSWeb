# 技术设计：API 测试归类

## 1. 归类规则（operative）

```
归类前
  test('email delivery runner polls immediately and enforces bounded concurrency', ...)
  test('email delivery runner claims with a fresh post-maintenance timestamp', ...)
  test('email delivery runner serializes lease renewals', ...)
  test('email delivery runner contains claim failures and continues polling', ...)

归类后
  test.describe('email delivery runner', () => {
      test.describe('polling', () => {
          test('starts immediately and enforces bounded concurrency', ...)
          test('contains claim failures and continues polling', ...)
      });

      test.describe('claims', () => {
          test('use a fresh post-maintenance timestamp', ...)
          test('serialize lease renewals', ...)
      });
  });
```

判定顺序：

1. **顶层主体**：取该文件里多数用例共享的主语（模块名、仓储名、端点路径、脚本名、组件名）。已有 `describe` 的文件沿用它。
2. **二级类别**：对主体下的用例做前缀聚类。公共前缀 ≥3 词的组归一类；剩余零散用例若无可归类前缀，直接挂在顶层主体下（允许「主体直接带若干用例 + 一到多个二级类别」）。
3. **用例名**：只删掉已被上层 `describe` 承载的词，其余**逐字不动**。删除会让句子不通时，可在原词序内补最少量的连接词（如 `polls`→`starts polling` 中的 `starts`），但**不允许**改成与原文无关的新表述——补词必须写进提交说明的「用例名调整清单」。
4. **最多两层**；二层的类别数 2–4，超过 4 说明主语选得不对，回到第 1 步。

**技术选择的理由**：API 现在的主语重复是「结构缺失」而不是「名字不好」，所以收益来自层级而非改名；把改名压到最小也让「拼接名集合不变」这条机检真正可用。

## 2. 机检工具：用 runner 自己输出真名，不手写解析器

采集方式（**ground truth，推荐主路径**）：

```
pnpm --filter @imsweb/api exec vitest run <dir> --reporter=json --outputFile=/tmp/names-<batch>-<before|after>.json
```

从 JSON 里取每条断言的全名（Vitest 的 JSON reporter 追随 Jest 形状：`testResults[].assertionResults[]`，带 `title`/`fullName`/`ancestorTitles`；**批量 A 开始前先确认字段实际名称**，只以实际 JSON 为准），排序后写成 `文件 → 全名集合`，归类前后 `diff` 必须为空。

注意点：

- `--reporter=json` 与 `--outputFile` 是 CLI flag，必须走 `pnpm exec vitest run ...`，**不能**写 `pnpm run <script> -- --reporter=json`（`--` 会被原样转发，flag 变成位置过滤器）。
- 跳过用例同样出现在 JSON 里（status 为 skipped），正是我们要的：名字集合应包含它们，跳过数单独比对。
- 兜底路径（仅当 JSON 字段不足以还原层级时）：用仓库里已有的 `typescript` 写一个 `createSourceFile` 遍历器，输出 `describe 路径 > test 名`。使用前先确认该版本编译器 JS API 可用（仓库装的是 typescript 7.0.2，API 面可能与 5.x 不同）；不可用就退回到「逐文件人工核对 + 该文件用例数断言」并向主线报告。

工具与输出放**任务目录**（`.trellis/tasks/09-19-api-test-taxonomy/tools/` 与 `evidence/`），不进 `package.json` scripts——根 58 / api 43 / web 21 的脚本上限由 `tests/test_workspace_boundaries.py` 钉住。

## 3. 逐文件操作步骤

1. 读文件，列出所有 `test(...)` 名字（含动态注册的 `test(entry.name, ...)`——动态名字不参与前缀提取，留在原位置）。
2. 定主语与类别，写出目标结构。
3. 用 `test.describe(...)` 包起来，只做两件事：插入 `describe` 行、把用例体整体缩进 4（二层再 4）。
4. 从用例名里删掉已被承载的前缀词；补词最小化并记录。
5. 保持 `import { test } from 'vitest'`、`node:assert/strict`、fixture、`beforeAll/afterAll/onTestFinished` 位置与顺序不变。
6. 该文件跑一遍（单文件 `pnpm exec vitest run <file>`），再跑该目录全量，最后跑名字集合 diff。

## 4. 批次划分

| 批次 | 范围 | 文件数 | 基线用例 |
| --- | --- | --- | --- |
| A1–A4 | `tests/server`（按字母或主题切 4 块，每块 ~25 文件） | 102 | 626 |
| B | `tests/wiki` | 7 | 60 |
| C | `tests/migration` | 18 | 114 |
| D | `tests/assets` 2 + 顶层 `tests/*.test.ts` 5 | 7 | 84 |

每批一个提交；提交说明必须写：批内文件数、用例数、名字集合 diff 为空、跳过数一致、补词清单（若有）。

## 5. 验收命令（每批）

```
pnpm --filter @imsweb/api exec vitest run <dir>                       # 全绿 + 用例数
IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api exec vitest run <dir>   # 跳过数
pnpm --filter @imsweb/api run test                                    # 收口时跑整域
python3 -m unittest tests.test_workspace_boundaries
```

`tests/assets` 需要已构建的 Web 客户端（`apps/web/build/client`）；本地判据用它自己的基线 2 文件 / 10 用例。

## 6. 风险表

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 前缀切错，用例名丢失关键词 | 报表可读性下降、排障困难 | 名字集合 diff 必须为空（补词单独列清单） |
| 主语选得过细/过粗 | 层级无意义或类别爆炸 | 主语用文件里多数用例共享的主语；类别数 2–4 |
| 动态注册（`test(entry.name, ...)`）被错拆 | 用例数变化 | 动态名字不参与提取；每题在 `describe` 内保持原写法 |
| 缩进/大括号改坏 | 语法错误或作用域错位 | 每文件改动后立刻单跑该文件；批末跑目录全量 |
| JSON reporter 字段与预期不符 | 机检失效 | 批量 A 先验证字段；兜底用 TS AST 遍历器 |
| 一次改太多文件导致 review 失效 | 评审走过场 | 按 4+1+1+1 批交付，每批可独立回滚 |
| 已有 9 个 describe 的文件被推倒重写 | 无谓 churn | 只做增量补齐，diff 越小越好 |

## 7. 回滚

每批一个提交；回滚即 revert 该批提交。批与批之间无依赖（不同目录），因此可单独回滚任意一批而不影响其它批。

## 8. 收敛方案 C：合并同主题族文件（2026-09-19 追加）

### 8.1 为什么「先 describe、后合并」是唯一安全的顺序

`apps/api/vitest.config.mts` 用 `pool: 'forks'` + 每文件一个进程来隔离模块状态与 PostgreSQL 池，所以文件就是隔离单元。分类阶段先在**每个文件内**建立 `describe`（主体在顶层、类别在第二层），带来两个直接好处：

1. 每个旧文件的模块级 `const`、helper、`beforeAll` 都落在**该文件自己的 describe 回调作用域**里，拼进同一个文件后不会发生重复声明冲突。
2. 合并只做「拼接 describe 块 + 合并 import」，因此合并前后 **full name 逐字节不变**（describe 标题就是旧主题），契约登记只需要改 `file`。

反过来先合并再分类，就等于在未结构化的文件里做大段搬运与缩进，风险与时序敏感断言都不可控。

### 8.2 族划分与上限

见 `tools/merge-plan-c.json`。规则：同目录 + 同扩展名 + basename 首个 kebab 段；族内 >120 用例或 >20s 单线程时按二级前缀再切；单成员族不动。结果 **134 → 72 文件**（20 个合并目标 + 52 个单成员文件），最大目标 `server/platform-email.test.ts` 98 用例 / 18.0s，单线程总时长 90.7s（不变），4 worker 理论墙钟 ≈ 22.7s，与合并前同级——关键路径没有被拉长。

不再往下并到 ~55 的原因：剩下的 52 个文件的 kebab 首段互不相同，继续合并只能把互不相关的主题塞进一个「杂项」文件，这正是 `docs/development/testing.md` 与 `.trellis/spec/api/backend/testing.md` 明确禁止的形态。

### 8.3 隔离风险与对策

| 风险 | 为什么出现 | 对策 |
| --- | --- | --- |
| `vi.mock` 提升冲突 | 两个成员对同一模块用不同 factory，合并后提升到同一文件顶层 | 合并工具必须检出「同模块不同 factory」并拒绝该族（回退不合并） |
| 假定时器跨用例污染 | 成员各自 `vi.useFakeTimers`（仓库既有要求是只 fake `setTimeout`） | 只在合并后 shuffle 复跑失败时定位；失败则回退该族 |
| PostgreSQL 池/allocator | 合并后更多用例共享一个进程与池 | 合并目标上限 120 用例；每文件仍保留自己的 `afterAll(closeSharedPostgresTestAllocator)`（幂等） |
| 时序敏感断言 | 并发负载下时长断言（如 `closeDuration < 150`） | 合并验收串行跑；失败先单独复跑判定真假 |
| 关键路径变长 | Vitest 按文件并行，文件变少变大 | 双上限把最大文件压在 18s < 22.7s 理论墙钟 |

### 8.4 判定与回滚

每个合并目标独立判定：`--sequence.shuffle` 复跑 + 该目录普通运行 + 全名集合比对 + 契约校验器。任何一项失败就**只回退该族**（`git checkout` 该族成员并删除合并文件），其余族照常推进——粒度为族，不是整批。

### 8.5 治理面（必须同批更新）

- `scripts/contracts/non-json-boundaries.manifest.json`：16 条被搬家用例的 `test.file`。
- `scripts/testing/run-test-owner.mjs` 的 `apiNodeTests` 清单（`node-listener-probe` + `node-security` → `node.test.js`）与 `scripts/testing/tests/run-test-owner.test.mjs` 的冻结 argv。
- `docs/development/testing.md` 与 `.trellis/spec/api/backend/testing.md` 的测试位置表/文件引用。
- `apps/api/package.json` 的 `test:server` / `test:wiki` / `test:migration` / `test:assets` 是目录级命令，**不需要改**（脚本数仍为 43）。

## 9. 批次裁决与判据漂移（2026-09-19，A2/A3 落地后）

- **接受 A2/A3 的「新增 vitest 导入」**：`fudaba-claim-review-repository`（A2）与 `namecard-metadata-repository`、`object-deletion-worker-fencing`、`object-deletion-worker`、`platform-email-delivery-repository`（A3）用 `postgresTest as test` 且原本没有任何 vitest 导入，于是新增一行 `import { describe } from 'vitest';`。规则 4 的「只扩既有具名导入」据此放宽为「用包装函数时允许新增一行 `describe` 导入」。
- **接受 A3 跳过 `platform-account-security.contract` 的二级**：它唯一的 ≥3 词连续段由 `for` 循环动态注册，模板标题无法缩短，嵌套后每条全名会把同一短语复制一遍；保持主体层更干净。理由留在 `evidence/a3-verification.md`。
- **接受「一个文件两个顶层主体」**：`namecard-media-keys`、`node-email-delivery-runner`、`platform-email-resend-policy-cache` 各有两段。这**不影响合并**——合并机制给整个成员包一层块级作用域，不要求成员只有一个 describe（这正是不采用「把模块级代码搬进 describe」方案的原因之一）。
- **判据漂移（遗留，合并后处理）**：A3 采用可机检的「连续 ≥2 条共享同一 **≥3 词**字面前缀」，A1 用的是更松的「连续同类」。两者都在规则允许范围内，但结果是 `events-pagination`（3 词、连续 2 条）在 A1 被记为不可行。合并完成后按 A3 口径回扫 A1 的 24 个文件，补齐该加二级的文件，使全库判据一致。
- **每批独立复核判据（本会话主线执行）**：`tools/check-batch-shape.py <worktree> <paths...>`，逐文件比对 HEAD 与工作区，要求断言行多重集不变、用例数不变、旧标题是唯一新标题的字面尾段。A2：25 文件 0 变化 / 121→121 / 0 失败；A3：25 文件 0 变化 / 186→186 / 0 失败。

## 10. 同族合并（option C）的实现与验收（2026-09-19/20）

### 10.1 机制：块级作用域，而不是拼接

19 个 `fudaba-*`、9 个 `platform-email-*`、5 个 `legacy-*` 是同模板复制出来的，各自在模块级声明同名 fixture（`MemoryStorage`×4、`AT`/`profile`/`emailAccount`/`migratePostgres`…），且**文本不同**，拼接必然重复声明。因此合并 = 合并 import 块 + 给每个旧文件包一层块级词法作用域，成员内容**只做 +4 缩进、其余一字不改**：

```ts
// Merged from 9 sibling files that each keep their own describe block.
import { … }                       // 9 份 import 并成一份
// platform-email-auth.contract.test.ts
{
    <原文件内容，缩进 +4>
}
```

`describe` 层级、用例标题、断言、模板字面量全部按原字节保留，所以**合并前后用例全名逐字节不变**。

### 10.2 三道闸门（全部为「拒写」而非「硬合」）

1. **字面量自检**：重排缩进前后，所有字符串/模板/注释区间的字节必须完全相同（扫描器状态机跟踪 `${}` 嵌套）。
2. **标题多重集自检**：用例标题多重集必须等于各成员之和（只比对标题捕获组——跨行 `test(` + 标题写法里，两者之间的换行缩进本就该随重排变化）。
3. **装载闸门**：`vitest list`（只收集不执行）必须成功。

### 10.3 合并器必须解决的三类真实冲突

1. **跨模块同名局部绑定**（`Identifier 'test' has already been declared`）：`postgresTest as test` 与 vitest 的 `test` 同名；`NewPlatformEmailAccountInput` 同时来自 barrel 与直接模块；5 个迁移脚本各有自己的 `parseArguments`。
   规则：① **可证的再导出就去重**（读模块源码确认 `export … from` 指向对方，保留 barrel，丢弃直接绑定）；② `test`/包装器这一对，把包装器一侧还原为真实导出名 `postgresTest`；③ 其余（确是不同符号）**按模块名逐一改名**（如 `parseArgumentsFromLegacyAboutAvatars`），只在该成员体内、且只在代码位置改。
2. **改名不得触及属性访问**：`re.test(...)` 这种正则方法调用被误改名（tsc 报 `Property 'postgresTest' does not exist on type 'RegExp'`）。改为负向环视 `(?<![.\w$])name\b(?!\s*:)`，即排除属性访问与对象键/类型成员。
3. **治理词表**：`scripts/contracts/non-json-boundary-analysis.mjs:366` 只认 `["test","it"]` 两种用例声明形状，合并后包装器用例写作 `postgresTest(` 会从治理视野里消失（3 条 `DELIVERY-SITE-0x` 因此报错）。**选择扩展词表**（加入 `postgresTest`）而不是把 vitest 一侧改名成 `it`——后者的代价是同一文件里 `it` 与 `test` 语义分裂。该白名单此前没有任何测试或规范钉住。

### 10.4 验收数字

| 项目 | 合并前 | 合并后 |
| --- | --- | --- |
| `apps/api/tests` 文件数 | 134 | **72** |
| 用例数（runner JSON 真值） | 884 | 884 |
| 用例全名多重集 | — | 逐族 20/20 一致 |
| PG 关闭 | 666 passed / 218 skipped | 666 / 218（逐项相同） |
| PG 开启整域墙钟 | 32.10s | **28.06s** |
| 随机顺序（3 个种子，含文件乱序） | — | 72 文件 / 884 全通过，0 FAIL |
| `tsc -p tsconfig.tests.json` | exit 0 | exit 0 |
| 契约校验器 | exit 0 | exit 0（16 条 `test.file` 重指向） |
| 覆盖率闸门（CI 排除 assets） | 70 文件 / 874 | 70 文件 / 874，exit 0 |
| run-test-owner api | — | 70 文件 / 874，exit 0 |

### 10.5 提交序列（worktree `chore/vitest-ui-and-test-taxonomy`）

`1c446a60` A1(24) → `f5a23cdf` A2(26) → `2e7d919d` A3(25) → `27828b24` B–D(27) → `d65a0c25` A4(27) → `17d4172f` 合并(104 文件：20 新增 / 82 删除 / 2 修改)。

### 10.6 判据回扫与顺序依赖（2026-09-20）

- **A1 判据回扫已完成**（提交 `1ddcee10`）：`tools/scan-second-level.mjs` 按 A3 的「连续 ≥2 条共享 ≥3 词字面前缀」扫描全库，得 7 段候选；5 段拒绝的理由与既有批次记录独立吻合（用例编号前缀、环境前缀且成员跨成员、短语成员不恰好是一段、`for` 循环模板标题），2 段应用（`events-pagination` 的 `cursor event pagination`、`admin-accounts` 的 `administrator deletion preserves`）。全库判据现已一致。详见 `evidence/a1-rescan.md`。
- **修掉一个先于本任务的顺序依赖**：shuffle 验证在 `tests/node.test.js` 暴露 `node security` 两条 chronicle 用例的 `ENOENT`；把该成员在合并前、归类前的原始文件取出来单独跑同样失败，证明与归类、合并无关。根因是 `tests/node-security/fixture.js` 没建用例会写入的 `event-chronicle/metadata` 目录。已按夹具既有写法补建并留证（`evidence/a1-rescan.md` 末节）。
- 合并工具与复核工具都在 `tools/`：`merge-family.mjs`（dry-run / apply / apply-all）、`check-batch-shape.py`（HEAD vs 工作区：断言行多重集、用例数、增广路字面尾段双射）、`merge-plan-c.json`（冻结计划）、`scan-second-level.mjs` + `plan-second-level.mjs`（二级候选扫描与计划生成）。
