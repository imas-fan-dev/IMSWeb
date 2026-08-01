# 数据库配置

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

```sh
export IMS_DATABASE=sqlite
export IMS_SQLITE_PATH="$PWD/data/imsweb.db"
export IMS_COMPENSATION_DIR="$PWD/data/core/compensation"
test -f "$IMS_SQLITE_PATH"
sqlite3 "$IMS_SQLITE_PATH" 'PRAGMA quick_check;'
IMS_BACKOFFICE_JWT_SECRET='<high-entropy-secret>' pnpm run dev:node
```

生产必须使用 release 目录之外的绝对路径：

```sh
export IMS_DATABASE=sqlite
export IMS_SQLITE_PATH=/srv/ims/shared/database/imsweb.db
export IMS_COMPENSATION_DIR=/srv/ims/shared/database/compensation
```

SQLite 在目标不存在时可能创建空文件，因此不能把“进程成功启动”当作配置正确。启动前必须
确认文件存在，且 `PRAGMA quick_check` 输出 `ok`。不要直接复制正在写入的 `.db`，也不要手工
删除活动数据库的 `-wal` 或 `-shm` 文件。

## 两库合并

旧版数据仍保留为两个只读迁移输入：

| 输入 | 默认路径 | 表 |
| --- | --- | --- |
| Core | `data/import/core/news.db` | `users`, `logs`, `news`, `events`, `cards`, `card_emojis` |
| Story | `data/import/story/idol_data.db` | `agencies`, `idols`, `theme_colors`, 七张 `*_stories` |

它们不再是 Hono 的运行时配置。首次生成统一数据库时执行：

```sh
pnpm run migration:sqlite:merge
```

合并器不会覆盖已有目标，使用同目录临时文件、事务复制、逐表行数核对、
`PRAGMA foreign_key_check` 和 `PRAGMA quick_check`，全部完成后才原子发布。可以用
`--core`、`--story`、`--output` 覆盖三个路径。

当前 Core 源库有 33 条历史 `card_emojis.card_id -> cards.id` 孤立引用。默认严格模式会拒绝
发布；需要无损保留现状时必须显式执行：

```sh
pnpm run migration:sqlite:merge -- --allow-foreign-key-violations
```

命令会在报告中列出全部异常，不会静默删除数据。PostgreSQL 兼容性迁移会继续无损保留这些
记录，并在导入后添加 `NOT VALID` 外键；新写入立即受约束，历史异常则等待业务确认后清洗。

这些源库只是一次性迁移输入，不得注入 Hono Node 生产进程。完成迁移与对账后，应按数据
保留策略从工作目录清理或归档到受控存储。

## PostgreSQL 单库

当前稳定基线固定为 PostgreSQL 18.4。PostgreSQL 19 在 2026-07-23 仍是 Beta，不进入运行
基线；精确版本依据 PostgreSQL 官方[版本策略](https://www.postgresql.org/support/versioning/)和
[18.4 发布说明](https://www.postgresql.org/docs/18/release-18-4.html)。本地启动：

```sh
pnpm run dev:postgresql:up
docker compose -f deploy/compose.yaml ps postgres
```

不设置 `IMS_DATABASE` 或设置为 `postgresql` 时，Hono Node 忽略 SQLite 路径，通过一个
必填的 `DATABASE_URL` 创建共享连接池：

```sh
export IMS_DATABASE=postgresql
export DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb'
export IMS_PG_POOL_MAX=10
export IMS_PG_IDLE_TIMEOUT_MS=30000
export IMS_PG_CONNECTION_TIMEOUT_MS=5000
export IMS_PG_STATEMENT_TIMEOUT_MS=30000
export IMS_PG_IDLE_TRANSACTION_TIMEOUT_MS=30000
IMS_BACKOFFICE_JWT_SECRET='<high-entropy-secret>' pnpm run dev:node
```

连接池默认最多 10 条连接。Core/Story Repository 共享同一个 pool 和默认 schema；批处理只在
同一连接上的短事务内执行，普通查询使用未命名参数化语句。`DATABASE_URL` 和凭据只能由进程
环境或密钥管理系统注入。

PostgreSQL 不允许应用启动自动建表。普通空库先执行版本化 schema migration：

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
