# 同族合并验收证据（09-19-api-test-taxonomy / option C）

- 合并计划：`tools/merge-plan-c.json`（20 个目标族，冻结于 A1 之前）
- 合并工具：`tools/merge-family.mjs`（`--dry-run` / `--apply <target>` / `--apply-all`）
- 批次复核：`tools/check-batch-shape.py <worktree> <paths…>`（增广路匹配）
- 合并前后采集：`evidence/merge-before.json`、`evidence/merge-after.json`（runner JSON 报告器真值）

## 一、族级全名比对（20/20）

每个合并文件的用例全名多重集 == 其成员之和；未参与合并的文件（52 个）全部保留；全局条数 884 → 884；状态分布 666 passed / 218 skipped / 0 failed 逐项相同（PG 关闭路径）。

## 二、整域运行

| 条件 | 结果 |
| --- | --- |
| PG 开启 | 72 文件 / 884 passed / 0 skipped / 27.89s |
| PG 开启（合并前对照，同机同时段） | 134 文件 / 884 passed / 32.10s |
| PG 关闭 | 72 文件 / 666 passed / 218 skipped |
| shuffle seed=20260919 | 72 / 884 passed，0 FAIL |
| shuffle seed=7919 | 72 / 884 passed，0 FAIL |
| shuffle seed=424242 | 72 / 884 passed，0 FAIL |
| 覆盖率（`IMS_TEST_COVERAGE_ENABLED=true`，排除 `tests/assets/**`） | 70 / 874，exit 0 |
| `run-test-owner.mjs api` | 70 / 874，exit 0 |

> shuffle 用 `--sequence.shuffle --sequence.seed=<n>`；`--sequence.shuffle` 与 `--sequence.shuffle.files` 同时给会触发 Vitest 4.1.11 自身的 CAC 异常（`Cannot create property 'files' on boolean 'true'`）。

## 三、静态闸门

| 闸门 | 结果 |
| --- | --- |
| `tsc -p apps/api/tsconfig.tests.json --noEmit` | exit 0 |
| `node scripts/contracts/check-non-json-boundaries.mjs` | 31 entries / 30 handlers，exit 0 |
| `run-test-owner.mjs contracts` | 3 文件 / 29 用例，exit 0 |
| pre-commit 全链（含 eslint / web typecheck / API syntax / hono architecture） | 通过 |

## 四、契约登记的 16 条重指向

`DELIVERY-SITE-01/02/03` → `server/site.test.ts`；`FUDABA-GUEST-MEDIA-01`、`CONTENT-INFORMATION-HTML-01` → `server/handler.test.ts`；`FUDABA-OWNER-CARD-MEDIA-01`、`FUDABA-OWNER-OFFICE-COVER-01`、`FUDABA-OWNER-OFFICE-PENDING-COVER-01`、`FUDABA-REVIEW-MEDIA-01`、`FUDABA-ACCESS-PUBLIC-READ-01`、`FUDABA-ACCESS-MAP-01`、`FUDABA-ACCESS-WRITE-01`、`FUDABA-OWNER-UPLOAD-SIDE-01` → `server/fudaba.test.ts`；`PLATFORM-OAUTH-START-01`、`PLATFORM-OAUTH-CALLBACK-01` → `server/platform-oauth.test.ts`；`PLATFORM-OAUTH-LINK-START-01` → `server/platform-email.test.ts`。`test.symbol` 一律未动（标题逐字保留）。

## 五、过程中被闸门/闸门之外抓到的三个真实缺陷

1. 缩进扫描器未消费 `${` 里的 `{`，导致模板帧深度错位、后续行不再缩进（合成样例抓到；自检当时一致因而漏过，因此补了标题多重集闸门）。
2. 合并器的标题自检自身写错两处：`before` 未全局排序（各成员各自排序后拼接）；跨行 `test(` + 标题时把整段匹配文本当标题比对。
3. 改名器触及属性访问（`re.test(...)` → `re.postgresTest(...)`），由 `tsc` 抓出；另有一次因跨模块同名绑定直接 `PARSE_ERROR`，由 `vitest list` 装载闸门抓出。
