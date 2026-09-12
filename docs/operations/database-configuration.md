# 数据库配置

> 文档类型：运维
> 状态：Active
> 权威来源：`apps/api/src/config/env.ts`、`apps/api/src/config/postgresql.ts` 和 PostgreSQL migration scripts
> 适用环境：本地开发、CI 和生产 Hono Node runtime

Hono Node 只支持 PostgreSQL。Core 与 Story 是同一个 PostgreSQL 物理数据库和同一个连接池上的逻辑
Repository 边界，不是独立数据源。API 启动时会自动读取 `apps/api/.env`，已有 shell 或进程
管理器变量优先。

## 必需配置

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 无 | PostgreSQL 连接 URL，必须显式设置 |
| `IMS_PG_POOL_MAX` | `10` | 每个 API 进程的最大连接数，范围 1-100 |
| `IMS_PG_IDLE_TIMEOUT_MS` | `30000` | 空闲连接回收时间 |
| `IMS_PG_CONNECTION_TIMEOUT_MS` | `5000` | 建连超时 |
| `IMS_PG_STATEMENT_TIMEOUT_MS` | `30000` | SQL 语句超时 |
| `IMS_PG_IDLE_TRANSACTION_TIMEOUT_MS` | `30000` | 空闲事务超时 |

生产连接 URL 应由密钥管理或受控环境文件注入，不得写入仓库或命令历史。连接池总预算必须按
`API 进程数 * IMS_PG_POOL_MAX + migration/运维连接` 计算，并低于数据库连接上限。

## Schema migration

应用启动只验证 schema，不隐式建表。首次初始化和每次发布前执行：

```sh
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql
```

迁移器使用 advisory lock 串行化并发执行，记录文件名与 SHA-256，并在事务内执行未应用版本。
已经发布的 migration 文件不可修改；任何结构变化必须新增版本。

## 本地开发

推荐从仓库根目录执行 `pnpm dev`。启动器会拉起 PostgreSQL 与 RustFS、等待健康、应用
migration，再启动 API 和 Web。仅启动 API 时，先运行：

```sh
pnpm run dev:postgresql:up
pnpm run migration:postgresql
pnpm run dev:node
```

## 运行与验收

`GET /api/health/live` 只证明 Node 进程可响应；`GET /api/health/ready` 会执行 PostgreSQL 探针，
只有依赖可用时返回 200。发布验收至少包括：

```sh
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
pnpm --filter @imsweb/api test:server
```

写入冲突使用 revision guard，并必须把同一业务操作中的所有 SQL 放进一个事务。不能将进程启动、
HTTP 200 或 migration 成功单独视为数据完整性证明；还要核对代表性业务读取与写入回滚行为。
