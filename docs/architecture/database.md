# 数据库架构

> 文档类型：架构
> 状态：Active
> 权威来源：`apps/api/migrations/postgresql/`、`apps/api/src/ports/repositories/` 和 `apps/api/src/runtime/node-services.ts`

当前结构以 PostgreSQL migration ledger 和 schema verification 为准；表关系需要变化时从该权威来源重新生成，不维护手工快照。

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

- `apps/api/src/ports/repositories/` 按业务能力定义仓储契约，`index.ts` 仅保留稳定的 `@/ports/repositories` 聚合入口。
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

请求幂等端口复用同一 `ManagedSqlDatabase`。幂等 claim 通过复合主键与
`SELECT ... FOR UPDATE` 串行化首次获取、过期接管和 generation fencing；多个 API 进程因此共享
租约与回放结果，不依赖进程内内存或宿主机文件锁。幂等记录默认保留 7 天后惰性清理
completed/failed 状态；started 租约不会被清理，以免删除后复用 generation 破坏 fencing。

共享限流窗口由 Valkey 的 `ValkeyRateLimiter` 持有。它用单条原子 Lua EVAL 完成固定窗口计数、
过期滚动、身份重放豁免和 TTL 清理；窗口键与身份成员使用 SHA-256 匿名散列。多副本生产必须
连接同一 Valkey，限流计数是可丢失的短期状态，Valkey 重启只会重置配额，不影响 PostgreSQL
中的幂等、账户或审核状态。详见[缓存架构](cache.md)与[运维手册](../operations/runbook.md)。

历史站点包版本删除使用事务 outbox。Repository 先锁定 `site_packages` 父行，在同一事务中确认目标
不是 `published_revision_id`、删除 revision，并写入 `object_deletion_jobs` 的前缀回收任务；因此
不会出现数据库已删除但回收意图丢失的窗口。`ObjectDeletionWorker` 用 PostgreSQL 租约跨进程领取
任务，通过对象存储端口执行幂等 `deletePrefix()`，失败按退避策略重试，达到上限后隔离；修复外部
故障后由运维入口调用 `retryQuarantined(jobId)` 重新入队。当前由动态业务请求小批量驱动；后续定时
任务或独立 worker 应复用同一端口，不直接复制 SQL。completed 运维
任务默认保留 30 天，之后按批惰性清理。

## 连接与性能

连接池具有建连、空闲、语句和空闲事务超时。普通读取直接使用 pool query，只有 batch 或显式
transaction 才占用专用连接。分页使用稳定的 BIGINT 游标与有界 `ORDER BY id DESC LIMIT`，避免
大偏移扫描。

每个 API 进程的默认池上限是 10。部署扩容前需按进程数计算总连接预算，并通过 PostgreSQL
慢查询、锁等待和连接使用率确认容量，而不是只调整池上限。

## Schema 与发布门禁

迁移器通过 advisory lock、事务和 SHA-256 记录保证幂等执行。发布流程必须：

1. 备份 PostgreSQL 与对象存储，并记录同一发布标识。
2. 对目标数据库运行 `pnpm run migration:postgresql`。
3. 启动新 API，验证 `/api/health/live` 与 `/api/health/ready`。
4. 验证代表性公开读取、认证、管理写入和冲突回滚。
5. 观察结构化请求日志、数据库错误、连接数、延迟和 5xx 后再完成切流。

回滚应用版本前必须确认旧版本理解当前 schema。破坏性结构清理应拆成后续发布，不能与依赖它的
应用变更在同一次不可逆操作中完成。
