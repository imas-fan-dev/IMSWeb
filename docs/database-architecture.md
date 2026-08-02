# 数据库架构

当前工作树的 PostgreSQL 分层 ER 图与完整物理表清单见
[PostgreSQL 表关系图](database-table-relationships.md)。

## 当前结论

IMSWeb 采用一个 PostgreSQL 物理数据库和一个进程级连接池。Core 与 Story 仅是业务能力边界，
共享底层连接与版本化 schema：

```text
Hono domains -> repository ports <- SQL repositories
                                      |
                                 SQL driver port
                                      |
                             PostgreSQL connection pool
```

活动运行时、测试与运维命令使用同一 PostgreSQL 语义。应用启动不执行 DDL；
`migrations/postgresql/` 是结构演进的唯一来源。

## 依赖方向

- `src/ports/repositories.ts` 定义业务仓储契约。
- `src/infra/db/repositories/` 实现可复用 SQL Repository。
- `src/infra/db/sql/` 定义内部 statement、batch 和 transaction 契约。
- `src/infra/db/postgresql/` 封装连接池、参数转换和 schema 验证。
- `src/runtime/node-services.ts` 是唯一组合根，创建一个连接并注入各业务端口。

Domain 与 middleware 不得导入具体数据库模块。Repository 不读取环境变量，也不拥有连接池
配置；运行时组合根负责生命周期。

## 事务与并发

`ManagedSqlDatabase.transaction()` 为多语句业务操作提供同一连接上的显式事务。乐观锁写入必须
把前置变更和最终 revision guard 放在同一事务中；guard 失败时抛出内部冲突标记触发回滚，
事务外再读取当前 revision 形成稳定的 409 响应。

`batch()` 适合无条件的一组原子 SQL；需要根据中间结果决定提交或回滚时使用 `transaction()`。
测试必须连接真实 PostgreSQL，并覆盖冲突后的数据回读，不能只断言返回值。

## 连接与性能

连接池具有建连、空闲、语句和空闲事务超时。普通读取直接使用 pool query，只有 batch 或显式
transaction 才占用专用连接。分页使用稳定的 BIGINT 游标与有界 `ORDER BY id DESC LIMIT`，避免
大偏移扫描。

每个 API 进程的默认池上限是 10。部署扩容前需按进程数计算总连接预算，并通过 PostgreSQL
慢查询、锁等待和连接使用率确认容量，而不是只调整池上限。

## Schema 与发布门禁

迁移器通过 advisory lock、事务和 SHA-256 记录保证幂等执行。发布流程必须：

- 路由按能力依赖 `BackofficeAuthRepository`、`NewsRepository`、`EventRepository` 等端口以及
  `StoryRepository`、`ObjectStorage`，不读取数据库或 S3 配置。
- `domain` 只从 `ports/` 导入接口，不进入 `infra/`，也不导入数据库驱动、ORM client 或 ORM
  生成类型。
- `SqlDatabase` 统一参数绑定、查询结果、写入元数据、脚本执行和原子批处理。
- Repository SQL 使用 `?` 参数；PostgreSQL Driver 安全转换为 `$1`、`$2`。
- `SqlSchemaStrategy` 隔离 SQLite/PostgreSQL DDL；Repository 内没有 provider 分支。
- `sqlite/` 与 `postgresql/` 分别封装各自连接和 schema 行为；`repositories/` 只实现可复用
  SQL 仓储，`sql/` 只提供适配器内部的 Driver 契约和查询工具。
- `runtime/` 是唯一组合根，每个实例只创建一个 Driver；同一个 Core SQL 适配器按能力注入多个
  Repository port，Story 适配器共享该 Driver。
- `runtime/` 独立选择 filesystem/S3；S3 状态机只依赖 `ManagedSqlDatabase`，不依赖具体 driver。
- S3 受保护读取通过 ObjectStorage port 签发短期 URL；所有 ready 对象使用单一 bucket 的
  CDN URL，上传和业务提交仍只经过 Hono。
- S3 使用 `s3_object_versions`、`s3_object_index`、`s3_upload_operations` 和
  `s3_compensation_jobs` 实现延迟发布、版本 fencing、过期恢复和有租约补偿。
- `s3_object_versions.storage_scope` 与 `s3_upload_operations.storage_scope` 记录对象访问级别；
  受保护对象写入 `__protected/`，发布时在同一 bucket 生成新的公开 ready 版本。
- SQLite/PG `close()` 都是幂等的，支持多个 Repository 端口共享同一底层资源。

回滚应用版本前必须确认旧版本理解当前 schema。破坏性结构清理应拆成后续发布，不能与依赖它的
应用变更在同一次不可逆操作中完成。
