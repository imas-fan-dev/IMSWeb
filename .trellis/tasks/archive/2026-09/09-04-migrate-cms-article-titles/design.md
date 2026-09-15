# CMS 文章标题回填设计

## 方案概览

新增一个 API workspace 的一次性 TypeScript 脚本。脚本扫描 `articles`，根据确定的中文方括号规则生成变更计划；dry-run 只写报告，apply 在单个 PostgreSQL 事务中锁定、重新规划并提交全部更新。脚本不修改 schema，不进入普通 CMS 请求链路，也不扩展业务仓储接口。

## 文件边界

- `apps/api/scripts/migration/cms-article-title-backfill.ts`
  - CLI 参数、报告输出、数据库生命周期。
  - 标题拆分和正文前置的纯转换函数。
  - 接收 `ManagedSqlDatabase` 的扫描、规划和事务执行函数。
- `apps/api/tests/migration/cms-article-title-backfill.test.js`
  - 纯函数和参数测试。
  - 使用 PostgreSQL harness 的持久化、幂等、冲突与回滚测试。
- `apps/api/package.json`
  - 新增 `migration:cms-article-titles`。
  - 将新测试加入 `test:migration` 的显式文件列表。

## 转换契约

### 标题拆分

1. 对原 `articles.title` 执行首尾空白清理。
2. 仅当结果以 `【` 开头，并且第一处 `】` 之前的内容去除边界空白后非空时匹配。
3. 新标题为括号内清理后的内容，不含外围方括号。
4. 待迁移正文为第一处 `】` 后的全部内容，再清理边界空白。
5. 后续出现的 `【】` 不再解释，原样留在正文。
6. 中间才出现方括号、括号未闭合或标题为空时返回不匹配。

### 正文合并

- 待迁移正文为空时，保留原 `body_json` 与 `body_html`。
- 待迁移正文非空时，将它构造成一个 TipTap `paragraph`。
- `\r\n` 和 `\r` 先规范为 `\n`，段内换行转换为 `hardBreak`；其他内部字符保留在 text 节点中。
- 新段落放在现有 doc 的 `content` 数组最前面，不改动其余节点及顺序。
- 现有正文先经过 `validateArticleBody`。合并后的文档再次校验，并通过 `renderArticleBody` 生成清洗后的 HTML。
- 结构无效的现有正文记为计划错误。apply 在任何候选存在计划错误时不写入。

## 数据读取与写入

### 扫描

读取全部文章的：

- `id`
- `title`
- `body_json`
- `body_html`
- `revision`
- 关联 `events` 是否存在

扫描结果分为未匹配、候选和转换错误。所有内容类型都参与匹配。

### dry-run

- 使用普通一致性读取建立计划。
- 不调用任何 UPDATE，也不增加 revision。
- 写出计划报告，候选状态为 `would-update`。

### apply

1. 创建 `PostgresConnection` 并进入一个 `ManagedSqlDatabase.transaction()`。
2. 获取事务级 PostgreSQL advisory lock，防止两份回填脚本同时运行。
3. 使用 `SELECT ... FOR UPDATE OF articles` 重新扫描并锁定当前文章，不复用早先 dry-run 的内容。
4. 在事务内重新执行纯转换和正文校验。存在计划错误时抛错，尚未发生写入。
5. 对每个候选执行参数化 UPDATE，并在 WHERE 中比较 `id`、原 title、revision、body JSON 和 body HTML。
6. 文章更新写入新 title、body JSON、body HTML，执行 `revision = revision + 1` 和 `updated_at = CURRENT_TIMESTAMP`，不修改 `updated_by`。
7. 对关联 `events.article_id` 更新兼容标题。
8. 任一预期更新的影响行数不是 1，按冲突抛错。事务回滚所有文章和活动更新。
9. 事务提交后才把候选标记为已更新。

正常 CMS 编辑也会先更新文章行，因此 `FOR UPDATE` 与原值比较可防止迁移覆盖并发编辑。事务锁只协调这一个批量脚本，不阻断无关业务数据。

## 报告与日志

报告使用 JSON，先写同目录临时文件，再以 rename 原子替换目标文件；文件模式为 `0600`。默认路径分别为：

- dry-run：`data/migration/cms-article-title-backfill-dry-run.json`
- apply：`data/migration/cms-article-title-backfill.json`

报告包含：

- 模式、生成时间、完成或中止状态。
- scanned、unmatched、candidates、wouldUpdated、updated、conflicts、errors 计数。
- 候选文章 ID、执行前后标题、待前置正文，以及执行前后正文和 revision，用于审计和人工恢复。
- 冲突或错误的文章 ID 与不含凭据的原因。

stdout 只打印计数和报告路径。stderr 只打印错误摘要，不打印标题、正文、连接串或其他生产数据。

## 兼容性与幂等性

- 无数据库结构变化。
- 没有关联活动的文章只更新 `articles`；有关联活动时同步 `events.title`。
- 成功后的标题不再以中文左方括号开头，因此第二次执行不会重复前置正文。
- 旧标题只有 `【标题】` 时只更新标题，正文保持原值。
- 脚本不调用普通 CMS API，也不产生虚假的用户审计身份。

## 失败与恢复

- 参数、连接、读取、转换或报告准备失败时不开始数据库写入。
- apply 中的转换错误、并发冲突或 SQL 错误会抛出并回滚整批事务。
- 报告写入路径在 apply 前完成目录和临时文件可写性检查，降低提交后无法落报告的风险。
- 自动反向迁移不在本任务范围内。执行生产 apply 前必须备份数据库；受限报告保留执行前值，可辅助人工核对或恢复。

## 取舍

- 直接 SQL 只存在于一次性迁移脚本中，避免把批量维护能力加入长期业务仓储接口。
- 整批事务比逐条提交占锁时间更长，但满足无部分更新的要求，且脚本是一次性运维操作。
- 报告保留完整前后值便于审计和恢复，因此必须放在被 Git 忽略的 `data/migration/` 并限制文件权限。
