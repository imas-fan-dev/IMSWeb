# CMS 文章标题回填研究

## 现有数据链路

- `apps/api/migrations/postgresql/20260818101253_editorial_content_cms.sql` 创建 `articles.title`、`body_json`、`body_html` 与 `revision`，并将旧 `events.title` 写入文章标题，正文初始化为空。
- `apps/api/src/infra/db/repositories/editorial-repository.ts` 的正常编辑流程在同一事务中更新文章内容、增加 revision，并同步兼容活动标题。
- `articles` 没有统一的旧系统来源字段，因此按来源筛选会漏掉无法证明来源的记录。用户已决定处理所有当前标题符合格式的 CMS 文章。

## 可复用正文能力

`apps/api/src/domains/content/editorial/article-body.ts` 提供：

- `emptyArticleDocument`：空 TipTap 文档。
- `validateArticleBody`：校验 doc 根节点、允许节点、链接和图片引用格式。
- `renderArticleBody`：从 TipTap JSON 生成并清洗 HTML。
- `legacyHtmlToArticleDocument`：只适合旧 HTML 输入，不适合本任务的纯文本拆分。

本任务需要在迁移脚本内保留一个窄范围的纯转换函数：把纯文本构造成段落，并用 `hardBreak` 保存内部换行。转换后继续调用现有校验和渲染函数。该规则只有迁移脚本使用，不新增通用 helper 或业务端口。

## 脚本和数据库惯例

- `apps/api/scripts/migration/information-to-community-posts.ts` 默认 dry-run，显式 `--apply` 才写入，支持 `--report`，报告权限为 `0600`，并通过 `require.main === module` 避免测试导入时执行 CLI。
- `apps/api/src/config/database.ts` 的 `parseNodeDatabaseConfig(process.env)` 是 PostgreSQL 配置入口。
- `apps/api/src/infra/db/postgresql/connection.ts` 的 `PostgresConnection` 实现 `ManagedSqlDatabase`，其 `transaction()` 自动执行 `BEGIN`、`COMMIT` 和异常时的 `ROLLBACK`。
- `apps/api/src/infra/db/sql/query.ts` 提供参数化的 `queryAll`、`queryOne` 和 `executeSql`。SQL 不应插值用户或数据库内容。
- `resolveNodeServices()` 不公开底层数据库连接，因此一次性批量脚本应直接创建并关闭 `PostgresConnection`，同时把核心执行函数设计为接收 `ManagedSqlDatabase`，便于 PostgreSQL 集成测试。

## 并发、幂等与报告

- apply 应在事务内获取脚本级 advisory lock，并用 `SELECT ... FOR UPDATE` 重新读取当前文章。
- 更新条件继续比较原始 title、revision、body JSON 和 body HTML。任一行影响数不是 1 时按冲突处理并回滚整批事务。
- 标题成功拆分后不再以 `【` 开头，重跑会自然跳过。
- 权限为 `0600` 的 JSON 报告可记录执行前后内容以支持审计；stdout 只输出计数和报告路径，避免正文进入日志。

## 测试与验证入口

- 迁移测试属于 `apps/api/tests/migration/`，使用 Node test runner。
- `apps/api/tests/integration/postgres-harness.ts` 可创建应用完整 schema 的临时本地 PostgreSQL 数据库。
- `apps/api/package.json` 的 `test:migration` 明确列举测试文件，因此新增测试后必须把它加入命令。
- API 规范要求至少运行 typecheck、architecture check、聚焦迁移测试，并让持久化回归在 Node PostgreSQL 运行时执行。

## 相关规范

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/api/backend/data-and-errors.md`
- `.trellis/spec/api/backend/observability-and-security.md`
- `.trellis/spec/api/backend/testing.md`
- `.trellis/spec/guides/code-reuse-thinking-guide.md`
